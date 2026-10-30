/**
 * FRP 隧道
 * ------------------------------------------------------------
 * - 通用 frpc：自动从 GitHub Release 下载 Windows 版，按配置生成 frpc.toml 后启动，
 *   从日志里解析出「隧道已建立」与公网地址
 * - SakuraFrp：用户指定启动器 exe，只做启动/停止与进程存活判断（其内部状态不对外暴露）
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn, execFileSync } = require("child_process");
const { readZipEntry } = require("./mods");
const { download, GITHUB_MIRRORS } = require("./versions");

let proc = null;
let mode = null;
let address = "";
let lastError = "";
let logCallbacks = [];
let statusCallbacks = [];

function emitLog(line) {
  const text = String(line).trim();
  if (!text) return;
  for (const cb of logCallbacks) cb(text);
}

function emitStatus() {
  const state = { running: Boolean(proc), address, error: lastError || undefined };
  for (const cb of statusCallbacks) cb(state);
}

function frpDir() {
  const dir = path.join(os.homedir(), ".wulons-mcss", "frp");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function frpcPath() {
  return path.join(frpDir(), "frpc.exe");
}

/** 从 GitHub Release 拉最新 frpc.exe（有缓存则跳过） */
async function ensureFrpc(onProgress) {
  const exe = frpcPath();
  if (fs.existsSync(exe) && fs.statSync(exe).size > 1024) return exe;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  let release;
  try {
    const res = await fetch("https://api.github.com/repos/fatedier/frp/releases/latest", {
      signal: ctrl.signal,
      headers: { "User-Agent": "WulonsMCSS/27", Accept: "application/vnd.github+json" }
    });
    if (!res.ok) throw new Error(`获取 frp 版本失败（HTTP ${res.status}）`);
    release = await res.json();
  } finally {
    clearTimeout(timer);
  }

  const asset = (release.assets || []).find((a) => /windows_amd64\.zip$/i.test(a.name));
  if (!asset) throw new Error("没有找到 Windows 版 frp 安装包");
  emitLog(`正在下载 ${asset.name} …`);
  const zip = path.join(frpDir(), "frp.zip");
  // GitHub Release 现在会给 asset.digest（sha256:...）；有就校验，避免镜像投毒
  const digest = typeof asset.digest === "string" ? asset.digest : "";
  const hash = digest.startsWith("sha256:") ? { sha256: digest.slice(7) } : undefined;
  await download(asset.browser_download_url, zip, (got, total) => onProgress?.(got, total), {
    mirrors: GITHUB_MIRRORS,
    hash,
    onRetry: (url, msg) => emitLog(`镜像不通（${new URL(url).host}）：${msg}`)
  });

  const buf = readZipEntry(zip, "frpc.exe");
  if (!buf) throw new Error("frp 安装包里没有 frpc.exe");
  fs.writeFileSync(exe, buf);
  try {
    fs.unlinkSync(zip);
  } catch (e) {}
  emitLog("frpc.exe 已就绪");
  return exe;
}

function buildToml(profile) {
  const lines = [
    `serverAddr = ${JSON.stringify(profile.serverAddr)}`,
    `serverPort = ${Number(profile.serverPort) || 7000}`,
    `auth.token = ${JSON.stringify(profile.token || "")}`,
    "",
    "[[proxies]]",
    `name = ${JSON.stringify(profile.name || "minecraft")}`,
    `type = ${JSON.stringify(profile.type || "tcp")}`,
    `localIP = "127.0.0.1"`,
    `localPort = ${Number(profile.localPort) || 25565}`,
    `remotePort = ${Number(profile.remotePort) || 25565}`
  ];
  if (profile.type === "http" || profile.type === "https") {
    if (profile.customDomain) lines.push(`customDomains = [${JSON.stringify(profile.customDomain)}]`);
  }
  return `${lines.join("\n")}\n`;
}

async function start(profile, onProgress) {
  if (proc) return { ok: false, error: "隧道已在运行" };
  lastError = "";
  address = "";

  try {
    const exe = await ensureFrpc(onProgress);
    const dir = frpDir();
    const cfg = path.join(dir, "frpc.toml");
    fs.writeFileSync(cfg, buildToml(profile));

    mode = "frpc";
    proc = spawn(exe, ["-c", cfg], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    emitStatus();

    const onLine = (line) => {
      emitLog(line);
      // frpc 日志形如：start proxy success: [minecraft] 或 login to server success
      if (/start proxy success/i.test(line)) {
        address = `${profile.serverAddr}:${profile.remotePort}`;
        emitStatus();
      }
      if (/login to server failed|connect to server error|authorization failed/i.test(line)) {
        lastError = line;
        emitStatus();
      }
    };

    let buf = "";
    const feed = (chunk) => {
      buf += chunk.toString();
      const parts = buf.split(/\r?\n/);
      buf = parts.pop() ?? "";
      parts.forEach(onLine);
    };
    proc.stdout.on("data", feed);
    proc.stderr.on("data", feed);

    proc.on("error", (err) => {
      lastError = err.message;
      proc = null;
      emitStatus();
    });

    proc.on("exit", (code) => {
      emitLog(`frpc 退出（代码 ${code}）`);
      proc = null;
      mode = null;
      address = "";
      emitStatus();
    });

    return { ok: true };
  } catch (e) {
    lastError = e.message;
    proc = null;
    emitStatus();
    return { ok: false, error: e.message };
  }
}

/** SakuraFrp：只负责拉起用户指定的启动器 */
function startSakura(exePath) {
  if (proc) return { ok: false, error: "已有隧道在运行" };
  if (!exePath || !fs.existsSync(exePath)) return { ok: false, error: "找不到 SakuraFrp 启动器，请在设置里指定路径" };
  lastError = "";
  address = "";
  mode = "sakura";
  proc = spawn(exePath, [], { windowsHide: false, stdio: "ignore" });
  emitLog(`已启动 SakuraFrp：${exePath}`);
  emitStatus();
  proc.on("exit", (code) => {
    emitLog(`SakuraFrp 退出（代码 ${code}）`);
    proc = null;
    mode = null;
    emitStatus();
  });
  return { ok: true };
}

function stop() {
  if (!proc) return;
  try {
    if (mode === "frpc") proc.kill();
    else proc.kill();
  } catch (e) {}
  proc = null;
  mode = null;
  address = "";
  emitLog("已断开");
  emitStatus();
}

function status() {
  return { running: Boolean(proc), address, error: lastError || undefined };
}

function onLog(cb) {
  logCallbacks.push(cb);
  return () => {
    logCallbacks = logCallbacks.filter((c) => c !== cb);
  };
}

function onStatus(cb) {
  statusCallbacks.push(cb);
  return () => {
    statusCallbacks = statusCallbacks.filter((c) => c !== cb);
  };
}

module.exports = { start, startSakura, stop, status, onLog, onStatus, ensureFrpc, buildToml, frpcPath };
