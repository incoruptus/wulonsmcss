/**
 * 版本与下载链路
 * - Minecraft 版本清单（Mojang piston-meta）
 * - Fabric Loader 版本与「开箱即用服务端 jar」（meta.fabricmc.net 预构建）
 * - Paper / Purpur（插件服，水桶系）—— Plugins 目录，玩家用原版客户端即进
 * - 统一流式下载 + 进度事件，先写 .part 再原子改名
 */

const fs = require("fs");
const path = require("path");
const { download: robustDownload } = require("./download");

const MANIFEST_URL = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
const FABRIC_META = "https://meta.fabricmc.net/v2";
const PAPER_API = "https://fill.papermc.io/v3";
const PURPUR_API = "https://api.purpurmc.org/v2";

/** 服务端类型标记文件名：装了哪个核心、哪个版本，写在这里，导入时不用猜 */
const MARKER = ".mcss-server.json";

let manifestCache = null;
let manifestAt = 0;

async function getJson(url, timeoutMs = 20000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "WulonsMCSS/27" } });
    if (!res.ok) throw new Error(`HTTP ${res.status} · ${url}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function listMinecraft() {
  if (manifestCache && Date.now() - manifestAt < 10 * 60 * 1000) return manifestCache;
  const data = await getJson(MANIFEST_URL);
  manifestCache = (data.versions || []).map((v) => ({
    id: v.id,
    type: v.type,
    releaseTime: v.releaseTime,
    url: v.url
  }));
  manifestAt = Date.now();
  return manifestCache;
}

/* ------------------------- 版本生态（给新手选版本用） ------------------------- */

const ecoCache = new Map();

async function countProjects(projectType, mc) {
  const facets = JSON.stringify([[`project_type:${projectType}`], [`versions:${mc}`]]);
  const params = new URLSearchParams({ limit: "1", facets });
  try {
    const data = await getJson(`https://api.modrinth.com/v2/search?${params.toString()}`);
    return typeof data.total_hits === "number" ? data.total_hits : null;
  } catch (e) {
    return null;
  }
}

/**
 * 给候选版本返回「有多少 Mod / 插件支持」。
 * 这不是精确兼容判断，只是给新手一个「选哪个版本资源多」的锚点；
 * 网络失败返回 null，界面会隐藏数字而不是显示 0。
 */
async function ecosystem(versions) {
  const list = Array.isArray(versions) ? versions.filter(Boolean).slice(0, 8) : [];
  const out = {};
  await Promise.all(
    list.map(async (mc) => {
      const key = String(mc);
      const cached = ecoCache.get(key);
      if (cached && Date.now() - cached.at < 30 * 60 * 1000) {
        out[key] = cached.value;
        return;
      }
      const [mods, plugins] = await Promise.all([countProjects("mod", key), countProjects("plugin", key)]);
      const value = { mods, plugins };
      out[key] = value;
      ecoCache.set(key, { value, at: Date.now() });
    })
  );
  return out;
}

/**
 * Fabric Loader 列表（带 stable 标记，内部用）
 * 排序：稳定版在前，其余按 Fabric 返回顺序
 */
async function fabricLoaderList(mc) {
  const list = await getJson(`${FABRIC_META}/versions/loader/${encodeURIComponent(mc)}`);
  return list
    .map((l) => ({ version: l.loader?.version, stable: Boolean(l.loader?.stable) }))
    .filter((l) => l.version)
    .sort((a, b) => (a.stable === b.stable ? 0 : a.stable ? -1 : 1));
}

/**
 * 对外（IPC）形状：**字符串数组**。
 * 契约见 src/renderer/lib/api.ts `fabricLoaders: Promise<string[]>`。
 * 之前这里直接吐 {version, stable} 对象，渲染层当字符串用，
 * 结果 <option> 收到对象 → React #31 → 整棵组件树卸载 → 黑屏。
 * 需要 stable 信息的调用方请用 fabricLoaderList。
 */
async function fabricLoaders(mc) {
  return (await fabricLoaderList(mc)).map((l) => l.version);
}

async function fabricInstallerVersion() {
  const list = await getJson(`${FABRIC_META}/versions/installer`);
  return list?.[0]?.version || "1.0.1";
}

/* --------------------------- Paper / Purpur（插件服） --------------------------- */

/** Paper 支持哪些 MC 版本（Fill v3 的 keys 就是可用版本） */
async function paperVersions() {
  const data = await getJson(`${PAPER_API}/projects/paper`);
  return Object.keys(data?.versions ?? {}).flatMap((k) => data.versions[k] ?? []);
}

/** Paper 的 build 列表（最新的在前，和接口顺序一致） */
async function paperBuilds(mc) {
  const list = await getJson(`${PAPER_API}/projects/paper/versions/${encodeURIComponent(mc)}/builds`);
  return (Array.isArray(list) ? list : [])
    .filter((b) => b?.downloads?.["server:default"])
    .map((b) => String(b.id));
}

async function installPaper({ dir, mc, build, onProgress }) {
  const list = await getJson(`${PAPER_API}/projects/paper/versions/${encodeURIComponent(mc)}/builds`);
  const usable = (Array.isArray(list) ? list : []).filter((b) => b?.downloads?.["server:default"]);
  if (!usable.length) throw new Error(`Paper 尚未发布 ${mc} 的构建`);
  const chosen = build ? usable.find((b) => String(b.id) === String(build)) : usable[0];
  if (!chosen) throw new Error(`Paper ${mc} 不存在构建 ${build}`);

  const dl = chosen.downloads["server:default"];
  onProgress?.({ stage: "下载 Paper", percent: 5 });
  await download(
    dl.url,
    path.join(dir, "server.jar"),
    (got, total) => {
      const pct = total ? 5 + Math.round((got / total) * 90) : 50;
      onProgress?.({
        stage: "下载 Paper",
        percent: pct,
        detail: total ? `${(got / 1048576).toFixed(1)} / ${(total / 1048576).toFixed(1)} MB` : "",
      });
    },
    // Fill v3 直接给 sha256，比 sha1 更稳
    { hash: dl.checksums?.sha256 ? { sha256: dl.checksums.sha256 } : undefined },
  );
  onProgress?.({ stage: "完成", percent: 100 });
  return { ok: true, build: String(chosen.id) };
}

/** Purpur 支持哪些 MC 版本 */
async function purpurVersions() {
  const data = await getJson(`${PURPUR_API}/purpur`);
  return Array.isArray(data?.versions) ? data.versions : [];
}

/** Purpur 的 build 列表（数字，倒序） */
async function purpurBuilds(mc) {
  const data = await getJson(`${PURPUR_API}/purpur/${encodeURIComponent(mc)}`);
  const all = data?.builds?.all ?? [];
  return all.map((b) => String(b)).reverse();
}

async function installPurpur({ dir, mc, build, onProgress }) {
  const usable = await purpurBuilds(mc).catch(() => []);
  const ver = build || usable[0] || "latest";
  onProgress?.({ stage: "下载 Purpur", percent: 5 });
  await download(`${PURPUR_API}/purpur/${encodeURIComponent(mc)}/${encodeURIComponent(ver)}/download`, path.join(dir, "server.jar"), (got, total) => {
    const pct = total ? 5 + Math.round((got / total) * 90) : 50;
    onProgress?.({
      stage: "下载 Purpur",
      percent: pct,
      detail: total ? `${(got / 1048576).toFixed(1)} / ${(total / 1048576).toFixed(1)} MB` : "",
    });
  });
  onProgress?.({ stage: "完成", percent: 100 });
  return { ok: true, build: ver };
}

/** Forge 支持哪些 loader 版本（promotions_slim 的 <mc>-latest） */
async function forgeBuilds(mc) {
  const promos = await getJson("https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json");
  const v = promos?.promos?.[`${mc}-latest`] ?? promos?.promos?.[`${mc}-recommended`];
  return v ? [String(v)] : [];
}

/** NeoForge 的版本要读 maven-metadata；本机网络可能拿不到，拿不到就当没有 */
async function neoforgeBuilds(mc) {
  try {
    const xml = await getText("https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml");
    const all = [...String(xml).matchAll(/<version>([^<]+)<\/version>/g)].map((m) => m[1]);
    // NeoForge 的版本号跟 MC 走：26.1.x 或 21.5.x
    const prefix = mc.startsWith("1.") ? mc.split(".").slice(0, 2).join(".") : mc;
    return all.filter((v) => v.startsWith(`${prefix}.`)).reverse().slice(0, 50);
  } catch (e) {
    return [];
  }
}

async function getText(url, timeoutMs = 20000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "WulonsMCSS/27" } });
    if (!res.ok) throw new Error(`HTTP ${res.status} · ${url}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/* --------------------------------- 核心探测 -------------------------------- */

function readMarker(dir) {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, MARKER), "utf-8"));
    if (raw && typeof raw.serverType === "string") return raw;
  } catch (e) {}
  return null;
}

function writeMarker(dir, meta) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, MARKER), JSON.stringify({ ...meta, installedAt: Date.now() }, null, 2), "utf-8");
  } catch (e) {}
}

/**
 * 猜测一个目录用的是哪种服务端。
 * 顺序：自家标记 → 加载器痕迹 → 插件服痕迹 → 单 jar
 * 置信度：marker(high) / 特征文件(medium) / 只有目录(guess)
 */
function detectServer(dir) {
  if (!dir || !fs.existsSync(dir)) return null;
  const exists = (rel) => fs.existsSync(path.join(dir, rel));

  const marker = readMarker(dir);
  if (marker) return { ...marker, source: "marker", confidence: "high" };

  if (exists("libraries/net/neoforged")) return { serverType: "neoforge", source: "libraries", confidence: "high" };
  if (exists("libraries/net/minecraftforge")) return { serverType: "forge", source: "libraries", confidence: "high" };
  if (exists("purpur.yml")) return { serverType: "purpur", source: "purpur.yml", confidence: "medium" };
  if (exists("config/paper-global.yml") || exists("paper.yml") || exists("version_history.json")) {
    return { serverType: "paper", source: "paper-config", confidence: "medium" };
  }
  if (exists("fabric-server-launch.jar") || exists(".fabric")) return { serverType: "fabric", source: "fabric", confidence: "high" };

  const jars = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".jar"));
  const paperJar = jars.find((f) => /^paper(-|\.)/i.test(f));
  if (paperJar) return { serverType: "paper", source: paperJar, confidence: "medium" };
  const purpurJar = jars.find((f) => /^purpur(-|\.)/i.test(f));
  if (purpurJar) return { serverType: "purpur", source: purpurJar, confidence: "medium" };

  if (exists("plugins")) return { serverType: "paper", source: "plugins/", confidence: "guess" };
  if (exists("mods")) return { serverType: "fabric", source: "mods/", confidence: "guess" };
  if (exists("server.jar")) return { serverType: "vanilla", source: "server.jar", confidence: "guess" };
  return null;
}


/** 流式下载，onProgress(已下载字节, 总字节) —— 单次尝试；20 秒无数据视为卡死并中止 */
async function downloadOnce(url, dest, onProgress, opts = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 10 * 60 * 1000);
  const stallMs = opts.stallMs ?? 20_000;
  let lastActivity = Date.now();
  const watchdog = setInterval(() => {
    if (Date.now() - lastActivity > stallMs) ctrl.abort();
  }, 2000);
  const part = `${dest}.part`;
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "WulonsMCSS/27" } });
    lastActivity = Date.now();
    if (!res.ok) throw new Error(`下载失败 HTTP ${res.status}`);
    const total = Number(res.headers.get("content-length") || 0);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const out = fs.createWriteStream(part);
    let received = 0;
    const reader = res.body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        lastActivity = Date.now();
        received += value.byteLength;
        if (!out.write(Buffer.from(value))) {
          await new Promise((resolve) => out.once("drain", resolve));
        }
        if (onProgress) onProgress(received, total);
      }
    } finally {
      await new Promise((resolve) => out.end(resolve));
    }
    if (fs.existsSync(dest)) fs.unlinkSync(dest);
    fs.renameSync(part, dest);
    return { size: received };
  } catch (e) {
    try {
      if (fs.existsSync(part)) fs.unlinkSync(part);
    } catch (err) {}
    if (ctrl.signal.aborted) throw new Error("连接 20 秒无数据，已中止");
    throw e;
  } finally {
    clearTimeout(timer);
    clearInterval(watchdog);
  }
}

/** GitHub 直连在国内经常不通，按顺序回退到可用镜像 */
const GITHUB_MIRRORS = ["", "https://gh-proxy.com/", "https://ghfast.top/", "https://ghproxy.net/"];

/**
 * 下载：内部换成更硬的下载器
 * （断点续传 + 多源回退 + 哈希校验 + 缓存命中，见 ipc/download.js）
 */
async function download(url, dest, onProgress, opts = {}) {
  return robustDownload({
    url,
    dest,
    mirrors: opts.mirrors ?? [],
    hash: opts.hash,
    onProgress: (got, total) => onProgress?.(got, total),
    onRetry: opts.onRetry,
  });
}

/** 找安装器生成的 win_args.txt（成功判据） */
function findArgsFileIn(dir) {
  for (const ns of [["neoforged", "neoforge"], ["minecraftforge", "forge"]]) {
    const base = path.join(dir, "libraries", "net", ns[0], ns[1]);
    try {
      for (const ver of fs.readdirSync(base)) {
        const candidate = path.join(base, ver, "win_args.txt");
        if (fs.existsSync(candidate)) return candidate;
      }
    } catch (e) {}
  }
  return null;
}

/**
 * 安装服务端到 dir：
 * - fabric：直接取 Fabric 预构建的 server launcher jar（免装 installer）
 * - vanilla：从版本清单拿 server.jar
 * - paper / purpur：插件服（水桶系），同一个 server.jar，玩家用原版客户端即进
 */
async function installServer({ dir, mc, serverType, loader, loaderVersion, build, javaPath, onProgress }) {
  if (!dir || !mc) throw new Error("缺少安装参数");
  fs.mkdirSync(dir, { recursive: true });

  const type = serverType || loader || "vanilla";

  // 用户决定：NeoForge 新建先关掉，别让新手撞上安装器/网络问题。
  // 已有的 NeoForge 目录仍可导入、预检、启动（argsfile 逻辑不变）。
  if (type === "neoforge") {
    throw new Error(
      "暂不支持新建 NeoForge 服务器，官方安装器尚不稳定。已有 NeoForge 服务器可通过「全部服务器 → 导入现有服务器」接入管理。",
    );
  }

  // Forge / NeoForge 要跑安装器（--installServer）。判据是产物不是退出码：
  // 安装器历史上出现过"退出码 0 但没装成"，所以只认 win_args.txt 有没有生成。
  if (type === "forge" || type === "neoforge") {
    const proc = require("./proc");
    if (!javaPath) throw new Error("安装 Forge/NeoForge 前需先指定 Java");
    const builds = type === "forge" ? await forgeBuilds(mc) : await neoforgeBuilds(mc);
    const ver = build || builds[0];
    if (!ver) {
      // 区分"没有这个版本"和"连不上"：后者在受污染的网络上很常见，
      // 报"没有这个版本"只会让人以为版本不存在，实际上是被劫持了
      if (type === "neoforge") {
        throw new Error(
          "无法连接 maven.neoforged.net，暂时取不到 NeoForge 版本列表（该域名在部分网络环境下存在 DNS 污染）。\n" +
            "可先用官方安装器完成安装，再通过「导入现有服务器」接入管理。",
        );
      }
      throw new Error(`${type === "forge" ? "Forge" : "NeoForge"} 还没有 ${mc} 的版本`);
    }

    const host = type === "forge" ? "https://maven.minecraftforge.net/net/minecraftforge/forge" : "https://maven.neoforged.net/releases/net/neoforged/neoforge";
    const artifact = type === "forge" ? `${mc}-${ver}` : ver;
    const installerName = type === "forge" ? `forge-${mc}-${ver}-installer.jar` : `neoforge-${ver}-installer.jar`;
    const url = type === "forge" ? `${host}/${artifact}/${installerName}` : `${host}/${ver}/${installerName}`;

    onProgress?.({ stage: "下载安装器", percent: 2 });
    const installer = path.join(dir, installerName);
    await download(url, installer, (got, total) => {
      const pct = total ? 2 + Math.round((got / total) * 28) : 15;
      onProgress?.({ stage: "下载安装器", percent: pct, detail: total ? `${(got / 1048576).toFixed(1)} / ${(total / 1048576).toFixed(1)} MB` : "" });
    });

    onProgress?.({ stage: "正在运行安装器（需下载依赖库，可能需要几分钟）", percent: 32 });
    const res = await proc.run({ command: [javaPath, "-jar", installer, "--installServer", dir], cwd: dir });
    if (res.timedOut) throw new Error("安装器超时");
    const argsFile = findArgsFileIn(dir);
    if (!argsFile) {
      throw new Error(`安装器未生成启动参数文件，安装未成功。\n${(res.stderrTail || res.stdoutTail || "").slice(-600)}`);
    }
    writeMarker(dir, { serverType: type, mc, build: ver, argsFile });
    onProgress?.({ stage: "完成", percent: 100 });
    return { ok: true, build: ver };
  }

  const assertJar = (name) => {
    const file = path.join(dir, name);
    if (!fs.existsSync(file) || fs.statSync(file).size < 1024) {
      throw new Error(`服务端安装完成后未生成有效的 ${name}，请重试或更换构建`);
    }
  };

  if (type === "paper") {
    const res = await installPaper({ dir, mc, build, onProgress });
    assertJar("server.jar");
    writeMarker(dir, { serverType: "paper", mc, build: res.build });
    return res;
  }

  if (type === "purpur") {
    const res = await installPurpur({ dir, mc, build, onProgress });
    assertJar("server.jar");
    writeMarker(dir, { serverType: "purpur", mc, build: res.build });
    return res;
  }

  if (type === "fabric") {
    onProgress?.({ stage: "解析 Fabric 加载器", percent: 2 });
    const loaders = await fabricLoaderList(mc);
    const chosen = loaderVersion || loaders.find((l) => l.stable)?.version || loaders[0]?.version;
    if (!chosen) throw new Error(`Fabric 尚无适配 ${mc} 的加载器`);
    const installer = await fabricInstallerVersion();
    const url = `${FABRIC_META}/versions/loader/${encodeURIComponent(mc)}/${encodeURIComponent(chosen)}/${encodeURIComponent(installer)}/server/jar`;
    onProgress?.({ stage: "下载 Fabric 服务端", percent: 5 });
    await download(url, path.join(dir, "fabric-server-launch.jar"), (got, total) => {
      const pct = total ? 5 + Math.round((got / total) * 90) : 50;
      onProgress?.({ stage: "下载 Fabric 服务端", percent: pct, detail: total ? `${(got / 1048576).toFixed(1)} / ${(total / 1048576).toFixed(1)} MB` : "" });
    });
    assertJar("fabric-server-launch.jar");
    writeMarker(dir, { serverType: "fabric", mc, loaderVersion: chosen });
    onProgress?.({ stage: "完成", percent: 100 });
    return { ok: true, loaderVersion: chosen };
  }

  onProgress?.({ stage: "解析版本清单", percent: 3 });
  const versions = await listMinecraft();
  const entry = versions.find((v) => v.id === mc);
  if (!entry) throw new Error(`找不到 Minecraft ${mc}`);
  const detail = await getJson(entry.url);
  const serverUrl = detail?.downloads?.server?.url;
  if (!serverUrl) throw new Error(`${mc} 没有可用的服务端下载，可能是快照早期版本`);
  onProgress?.({ stage: "下载原版服务端", percent: 6 });
  await download(serverUrl, path.join(dir, "server.jar"), (got, total) => {
    const pct = total ? 6 + Math.round((got / total) * 90) : 50;
    onProgress?.({ stage: "下载原版服务端", percent: pct, detail: total ? `${(got / 1048576).toFixed(1)} / ${(total / 1048576).toFixed(1)} MB` : "" });
  }, { hash: { sha1: detail?.downloads?.server?.sha1 } });
  assertJar("server.jar");
  writeMarker(dir, { serverType: "vanilla", mc });
  onProgress?.({ stage: "完成", percent: 100 });
  return { ok: true };
}

module.exports = {
  listMinecraft,
  ecosystem,
  fabricLoaders,
  fabricLoaderList,
  installServer,
  download,
  getJson,
  GITHUB_MIRRORS,
  // 插件服（水桶系）
  paperVersions,
  paperBuilds,
  purpurVersions,
  purpurBuilds,
  forgeBuilds,
  neoforgeBuilds,
  // 核心探测
  detectServer,
  readMarker,
  writeMarker,
  MARKER,
};

