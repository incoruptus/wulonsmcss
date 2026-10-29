/**
 * 版本与下载链路
 * - Minecraft 版本清单（Mojang piston-meta）
 * - Fabric Loader 版本与「开箱即用服务端 jar」（meta.fabricmc.net 预构建）
 * - 统一流式下载 + 进度事件，先写 .part 再原子改名
 */

const fs = require("fs");
const path = require("path");
const { download: robustDownload } = require("./download");

const MANIFEST_URL = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
const FABRIC_META = "https://meta.fabricmc.net/v2";

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
    if (ctrl.signal.aborted) throw new Error("连接卡住（20 秒无数据），已中止");
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

/**
 * 安装服务端到 dir：
 * - fabric：直接取 Fabric 预构建的 server launcher jar（免装 installer）
 * - vanilla：从版本清单拿 server.jar
 */
async function installServer({ dir, mc, loader, loaderVersion, onProgress }) {
  if (!dir || !mc) throw new Error("缺少安装参数");
  fs.mkdirSync(dir, { recursive: true });

  if (loader === "fabric") {
    onProgress?.({ stage: "解析 Fabric Loader", percent: 2 });
    const loaders = await fabricLoaderList(mc);
    const chosen = loaderVersion || loaders.find((l) => l.stable)?.version || loaders[0]?.version;
    if (!chosen) throw new Error(`Fabric 没有适配 ${mc} 的 Loader`);
    const installer = await fabricInstallerVersion();
    const url = `${FABRIC_META}/versions/loader/${encodeURIComponent(mc)}/${encodeURIComponent(chosen)}/${encodeURIComponent(installer)}/server/jar`;
    onProgress?.({ stage: "下载 Fabric 服务端", percent: 5 });
    await download(url, path.join(dir, "fabric-server-launch.jar"), (got, total) => {
      const pct = total ? 5 + Math.round((got / total) * 90) : 50;
      onProgress?.({ stage: "下载 Fabric 服务端", percent: pct, detail: total ? `${(got / 1048576).toFixed(1)} / ${(total / 1048576).toFixed(1)} MB` : "" });
    });
    onProgress?.({ stage: "完成", percent: 100 });
    return { ok: true, loaderVersion: chosen };
  }

  onProgress?.({ stage: "解析版本清单", percent: 3 });
  const versions = await listMinecraft();
  const entry = versions.find((v) => v.id === mc);
  if (!entry) throw new Error(`找不到 Minecraft ${mc}`);
  const detail = await getJson(entry.url);
  const serverUrl = detail?.downloads?.server?.url;
  if (!serverUrl) throw new Error(`${mc} 没有服务端下载（可能是快照早期版本）`);
  onProgress?.({ stage: "下载原版服务端", percent: 6 });
  await download(serverUrl, path.join(dir, "server.jar"), (got, total) => {
    const pct = total ? 6 + Math.round((got / total) * 90) : 50;
    onProgress?.({ stage: "下载原版服务端", percent: pct, detail: total ? `${(got / 1048576).toFixed(1)} / ${(total / 1048576).toFixed(1)} MB` : "" });
  }, { hash: { sha1: detail?.downloads?.server?.sha1 } });
  onProgress?.({ stage: "完成", percent: 100 });
  return { ok: true };
}

module.exports = { listMinecraft, fabricLoaders, fabricLoaderList, installServer, download, getJson, GITHUB_MIRRORS };
