/**
 * 玩家侧：准备客户端环境
 * ------------------------------------------------------------
 * 从房间描述符里的 Modrinth 版本 id 反查下载地址，把 Mod 拉进目标目录的 mods/。
 * 不做启动器适配（各家用各自的实例目录），先保证「文件齐了」这一步可靠。
 */

const fs = require("fs");
const path = require("path");
const { download } = require("./versions");
const { matches } = require("./download");
const { scanMods } = require("./mods");

const API = "https://api.modrinth.com/v2";
const UA = "WulonsMCSS/27.0.0 (github.com/wulons)";

async function getJson(url, timeoutMs = 20000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`Modrinth HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 远端文件名不可信：只能保留最后一段并清掉 Windows 非法字符。
 * 之前直接 path.join(modsDir, filename)，`..\..\Startup\x.jar` 能写到 mods 之外。
 */
function safeFileName(raw) {
  const base = path.basename(String(raw || "mod.jar")).replace(/[\\/:*?"<>|]+/g, "_").trim();
  if (!base || base === "." || base === "..") return "mod.jar";
  return base;
}

/** 解析单个 Modrinth 版本 id → 首选文件 */
async function resolveFile(versionId) {
  const v = await getJson(`${API}/version/${encodeURIComponent(versionId)}`);
  const files = v.files || [];
  const file = files.find((f) => f.primary) || files[0];
  if (!file) throw new Error(`版本 ${versionId} 没有可下载文件`);
  return { url: file.url, filename: file.filename, size: file.size, name: v.name || "", sha1: file.hashes?.sha1, sha512: file.hashes?.sha512 };
}

/**
 * 目标位置已有的文件，要不要用服务器指定的版本覆盖？
 * ------------------------------------------------------------
 * 只看大小是不够的：不同构建/被手工换过的文件常常大小相同，
 * 跳过它 = 玩家进服时 Mod 不匹配，而且报错看不出原因。
 * 有哈希就按哈希判，没有哈希才退回大小比较。
 */
async function needsReplace(destPath, file) {
  if (!fs.existsSync(destPath)) return false;
  const same =
    file.sha1 || file.sha512
      ? await matches(destPath, { sha1: file.sha1, sha512: file.sha512 })
      : fs.statSync(destPath).size === file.size;
  return !same;
}

/**
 * 准备客户端目录：
 * - mods[]: 房间码里的 { p, v, n }
 * - 返回每个 Mod 的结果，单个失败不影响其它
 */
async function prepare({ dir, mods = [], onProgress }) {
  if (!dir) throw new Error("缺少目标目录");
  const modsDir = path.join(dir, "mods");
  fs.mkdirSync(modsDir, { recursive: true });

  const results = [];
  let index = 0;
  for (const mod of mods) {
    index += 1;
    const label = mod.n || mod.p;
    onProgress?.({ stage: `准备 ${label}`, stageKey: "join.stage.preparing", stageVars: { label }, percent: Math.round(((index - 1) / Math.max(mods.length, 1)) * 100), detail: `${index}/${mods.length}` });
    try {
      const file = await resolveFile(mod.v);
      const safeName = safeFileName(file.filename);
      const dest = path.resolve(modsDir, safeName);
      if (path.dirname(dest) !== path.resolve(modsDir)) throw new Error(`文件名不安全：${file.filename}`);
      const existed = fs.existsSync(dest);
      if (existed && !(await needsReplace(dest, file))) {
        results.push({ ok: true, name: label, file: safeName, skipped: true });
        continue;
      }
      await download(file.url, dest, undefined, {
        mirrors: ["", "https://gh-proxy.com/"],
        hash: { sha1: file.sha1, sha512: file.sha512 },
      });
      results.push({ ok: true, name: label, file: safeName, replaced: existed || undefined });
    } catch (e) {
      results.push({ ok: false, name: label, error: e.message });
    }
  }

  onProgress?.({ stage: "完成", stageKey: "join.stage.done", percent: 100, detail: `${results.filter((r) => r.ok).length}/${mods.length}` });
  return { ok: results.every((r) => r.ok), dir, modsDir, results };
}

/* ------------------------------------------------------------------ */
/* 读取现有客户端：版本 / 加载器 / Mod                                     */
/* ------------------------------------------------------------------ */

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8").replace(/^\uFEFF/, ""));
  } catch (e) {
    return null;
  }
}

function loaderFromLibraries(json) {
  const libs = Array.isArray(json?.libraries) ? json.libraries : [];
  for (const lib of libs) {
    const name = String(lib?.name || "");
    const fabric = name.match(/^net\.fabricmc:fabric-loader:(.+)$/);
    if (fabric) return { loader: "fabric", loaderVersion: fabric[1] };
    const forge = name.match(/^net\.minecraftforge:forge:(.+)$/);
    if (forge) {
      const raw = forge[1];
      const dash = raw.indexOf("-");
      return { loader: "forge", loaderVersion: dash >= 0 ? raw.slice(dash + 1) : raw };
    }
    const neo = name.match(/^net\.neoforged:neoforge:(.+)$/);
    if (neo) return { loader: "neoforge", loaderVersion: neo[1] };
    const quilt = name.match(/^org\.quiltmc:quilt-loader:(.+)$/);
    if (quilt) return { loader: "quilt", loaderVersion: quilt[1] };
  }
  return null;
}

function loaderFromId(id) {
  const text = String(id || "");
  let m = text.match(/^fabric-loader-([^-]+)-(.+)$/i);
  if (m) return { loader: "fabric", loaderVersion: m[1], mcVersion: m[2] };
  m = text.match(/^(.+?)-fabric(?:[- ](.+))?$/i);
  if (m) return { loader: "fabric", loaderVersion: m[2] || "", mcVersion: m[1] };
  m = text.match(/^(.+?)-forge(?:[- ](.+))?$/i);
  if (m) return { loader: "forge", loaderVersion: m[2] || "", mcVersion: m[1] };
  m = text.match(/^(.+?)-neoforge(?:[- ](.+))?$/i);
  if (m) return { loader: "neoforge", loaderVersion: m[2] || "", mcVersion: m[1] };
  m = text.match(/^neoforge-(.+)$/i);
  if (m) return { loader: "neoforge", loaderVersion: m[1], mcVersion: "" };
  m = text.match(/^quilt-loader-([^-]+)-(.+)$/i);
  if (m) return { loader: "quilt", loaderVersion: m[1], mcVersion: m[2] };
  m = text.match(/^(\d+\.\d+(?:\.\d+)?)$/);
  if (m) return { loader: "vanilla", loaderVersion: "", mcVersion: m[1] };
  return null;
}

function readLauncherProfiles(mcDir) {
  const file = path.join(mcDir, "launcher_profiles.json");
  const json = readJson(file);
  const map = new Map();
  const profiles = json?.profiles && typeof json.profiles === "object" ? Object.values(json.profiles) : [];
  for (const p of profiles) {
    const id = String(p?.lastVersionId || "");
    if (!id) continue;
    map.set(id, {
      name: String(p?.name || id),
      lastUsed: Number(p?.lastUsed || 0),
    });
  }
  return map;
}

/**
 * 扫描一个 .minecraft：
 * - versions/ 里每个版本目录 + 对应 json 的 inheritsFrom/libraries
 * - launcher_profiles.json 里最近使用的版本
 * - mods/ 里的 jar（交给 mods.scanMods，Fabric/Forge 元数据都能读）
 *
 * 不改任何文件；找不到 versions/ 时返回空数组，让 UI 显示“这不是客户端目录”。
 */
function scanClient(mcDir) {
  if (!mcDir) throw new Error("缺少客户端目录");
  const versionsDir = path.join(mcDir, "versions");
  const launcher = readLauncherProfiles(mcDir);
  const versions = [];
  let entries = [];
  try {
    entries = fs.readdirSync(versionsDir, { withFileTypes: true });
  } catch (e) {
    entries = [];
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const folder = entry.name;
    const json = readJson(path.join(versionsDir, folder, `${folder}.json`));
    const fromLib = loaderFromLibraries(json);
    const fromId = loaderFromId(folder);
    const loader = fromLib?.loader || fromId?.loader || "vanilla";
    const loaderVersion = fromLib?.loaderVersion || fromId?.loaderVersion || "";
    let mcVersion = String(json?.inheritsFrom || fromId?.mcVersion || "");
    if (!mcVersion) {
      const m = folder.match(/(\d+\.\d+(?:\.\d+)?)/);
      mcVersion = m ? m[1] : "";
    }
    if (!mcVersion) continue;

    let mtime = 0;
    try {
      mtime = fs.statSync(path.join(versionsDir, folder)).mtimeMs;
    } catch (e) {}
    const meta = launcher.get(folder);
    versions.push({
      id: folder,
      name: meta?.name || folder,
      mcVersion,
      loader,
      loaderVersion,
      lastUsed: meta?.lastUsed || 0,
      mtime,
      path: path.join(versionsDir, folder),
    });
  }

  versions.sort((a, b) => b.lastUsed - a.lastUsed || b.mtime - a.mtime || a.id.localeCompare(b.id, "zh-CN"));
  const recommended =
    versions.find((v) => v.lastUsed > 0) ||
    versions.find((v) => v.loader !== "vanilla") ||
    versions[0] ||
    null;

  return {
    dir: mcDir,
    versions,
    recommended,
    mods: scanMods(path.join(mcDir, "mods")),
  };
}

module.exports = { prepare, resolveFile, needsReplace, safeFileName, scanClient };
