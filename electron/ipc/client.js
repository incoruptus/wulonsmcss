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
    onProgress?.({ stage: `准备 ${label}`, percent: Math.round(((index - 1) / Math.max(mods.length, 1)) * 100), detail: `${index}/${mods.length}` });
    try {
      const file = await resolveFile(mod.v);
      const dest = path.join(modsDir, file.filename);
      const existed = fs.existsSync(dest);
      if (existed && !(await needsReplace(dest, file))) {
        results.push({ ok: true, name: label, file: file.filename, skipped: true });
        continue;
      }
      await download(file.url, dest, undefined, {
        mirrors: ["", "https://gh-proxy.com/"],
        hash: { sha1: file.sha1, sha512: file.sha512 },
      });
      results.push({ ok: true, name: label, file: file.filename, replaced: existed || undefined });
    } catch (e) {
      results.push({ ok: false, name: label, error: e.message });
    }
  }

  onProgress?.({ stage: "完成", percent: 100, detail: `${results.filter((r) => r.ok).length}/${mods.length}` });
  return { ok: results.every((r) => r.ok), dir, modsDir, results };
}

module.exports = { prepare, resolveFile, needsReplace };
