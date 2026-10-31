const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawn } = require("child_process");
const { app, BrowserWindow, ipcMain, shell, dialog, nativeImage } = require("electron");

// electron/ipc 下的模块按运行时路径加载（不进 bundle，打包时随 electron/ipc/** 一起进 asar）
const IPC_DIR = path.join(__dirname, "..", "..", "electron", "ipc");
const server = require(path.join(IPC_DIR, "server.js"));
const files = require(path.join(IPC_DIR, "files.js"));
const mods = require(path.join(IPC_DIR, "mods.js"));
const versions = require(path.join(IPC_DIR, "versions.js"));
const javaIpc = require(path.join(IPC_DIR, "java.js"));
// 多世界逻辑已移到渲染层（src/renderer/lib/worlds.ts）
const modrinth = require(path.join(IPC_DIR, "modrinth.js"));
const frp = require(path.join(IPC_DIR, "frp.js"));
const preflight = require(path.join(IPC_DIR, "preflight.js"));
const client = require(path.join(IPC_DIR, "client.js"));
const backup = require(path.join(IPC_DIR, "backup.js"));
const serversdat = require(path.join(IPC_DIR, "serversdat.js"));
const mrpack = require(path.join(IPC_DIR, "mrpack.js"));
const schedule = require(path.join(IPC_DIR, "schedule.js"));
const aidiag = require(path.join(IPC_DIR, "aidiag.js"));
const slp = require(path.join(IPC_DIR, "slp.js"));
const netdoctor = require(path.join(IPC_DIR, "netdoctor.js"));
const proc = require(path.join(IPC_DIR, "proc.js"));
const backups = require(path.join(IPC_DIR, "backups.js"));
const { createConfigStore } = require(path.join(IPC_DIR, "config.js"));

let mainWindow = null;
let configStore = null;

// 双开会各自起服务器、各自写 config.json，后写覆盖前写；只允许一个主进程
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
}
let activeInstanceId = null;
/** 真正在跑的那个实例：自动备份必须认它，不能认 UI 当前选中的实例 */
let runningInstanceId = null;
/** 退出前要等的自动备份 */
let pendingBackup = null;

/* ------------------------------ 渲染进程诊断 ------------------------------ */

/**
 * 黑屏没有任何信息，这一点必须改掉。
 * 渲染进程的报错、崩溃、加载失败全部落到 renderer.log，
 * 用户只要说"黑屏了"，我们就能直接从磁盘上读到原因。
 */
function rendererLogFile() {
  try {
    return path.join(app.getPath("userData"), "renderer.log");
  } catch (e) {
    return null;
  }
}

function logLine(tag, text) {
  const file = rendererLogFile();
  const line = `[${new Date().toISOString()}] ${tag} ${text}\n`;
  try {
    if (file) {
      // 只留最近 1 MB，避免长期运行把盘写满
      if (fs.existsSync(file) && fs.statSync(file).size > 1024 * 1024) fs.writeFileSync(file, "");
      fs.appendFileSync(file, line);
    }
  } catch (e) {
    /* 写日志失败不能影响主流程 */
  }
  if (process.env.MCSS_LOG_STDOUT === "1") process.stdout.write(line);
}

/** 页面加载不出来时，宁可给一页能读懂的错误，也不要留一面黑屏 */
function showFatalPage(title, detail) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8">
<style>
  html,body{height:100%;margin:0;background:#141414;color:#e8e8e8;
    font:14px/1.6 "Segoe UI","Microsoft YaHei",system-ui,sans-serif}
  .wrap{max-width:680px;margin:0 auto;padding:14vh 24px}
  h1{font-size:18px;margin:0 0 12px}
  pre{white-space:pre-wrap;word-break:break-all;background:#1f1f1f;border:1px solid #2e2e2e;
    border-radius:8px;padding:12px;color:#b8b8b8;font-size:12px;max-height:40vh;overflow:auto}
  button{margin-top:16px;padding:8px 16px;border-radius:8px;border:0;background:#3b82f6;color:#fff;font:inherit;cursor:pointer}
  p{color:#9a9a9a;margin:0 0 16px}
</style>
<div class="wrap"><h1>${title}</h1><p>界面没能正常加载。可以点下面的按钮重试；如果一直不行，日志在：<br>
${String(rendererLogFile() || "").replace(/</g, "&lt;")}</p>
<pre>${String(detail).replace(/</g, "&lt;")}</pre>
<button onclick="location.reload()">重试</button></div>`;
  mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`).catch(() => {});
}
/** 定时重启：等服务器停稳后再拉起来 */
let restartPending = null;
/** 定时任务的内存态：上次执行时间（重启按天记） */
const scheduleState = new Map();

function getConfigPath() {
  if (app.isPackaged) return path.join(app.getPath("userData"), "config.json");
  return path.join(__dirname, "..", "..", "config.json");
}

function readConfig() {
  return configStore.read();
}

function findInstance(id) {
  const cfg = readConfig();
  return cfg.instances.find((i) => i.id === id) || null;
}

function send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

/* ---------------------------------- 窗口 ---------------------------------- */

/** 只允许 http/https 交给系统浏览器；file:/ms- 或 UNC 路径会拉起本地程序、泄漏 NTLM */
async function openExternalSafe(raw) {
  let u;
  try {
    u = new URL(String(raw || ""));
  } catch {
    throw new Error("链接格式不对");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error(`不打开这种链接：${u.protocol}`);
  }
  return shell.openExternal(u.toString());
}

function createWindow() {
  const iconPath = path.join(__dirname, "..", "..", "resources", "app-icon.png");
  // 联调网页版时加载外部 URL：此时故意不注入 preload，
  // 让页面走 httpClient → agent 的真实链路（等价于普通浏览器）
  const externalUrl = process.env.MCSS_URL;
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 1000,
    minHeight: 660,
    frame: false,
    show: false,
    backgroundColor: "#0a0a0a",
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      ...(externalUrl ? {} : { preload: path.join(__dirname, "..", "preload", "index.js") }),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  const wc = mainWindow.webContents;
  let revives = 0;

  wc.on("render-process-gone", (_e, details) => {
    logLine("renderer-gone", `${details.reason} exitCode=${details.exitCode}`);
    // 渲染进程被打死（OOM / 驱动）时自动救一次，别把黑屏留给用户
    if (revives++ < 2 && mainWindow && !mainWindow.isDestroyed()) {
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.reload();
      }, 800);
    }
  });
  wc.on("unresponsive", () => logLine("renderer-unresponsive", "渲染进程无响应"));
  wc.on("responsive", () => logLine("renderer-responsive", "渲染进程恢复响应"));
  wc.on("preload-error", (_e, preloadPath, err) => logLine("preload-error", `${preloadPath} ${err?.message || err}`));
  wc.on("console-message", (_e, level, message, line, sourceId) => {
    if (level >= 2) logLine(level >= 3 ? "console-error" : "console-warn", `${message} @${sourceId}:${line}`);
  });
  wc.on("did-fail-load", (_e, code, desc, url, isMainFrame) => {
    if (!isMainFrame) return;
    if (code === -3) return; // ERR_ABORTED：只是被下一次加载取代，不是失败
    logLine("did-fail-load", `${code} ${desc} ${url}`);
    showFatalPage("页面加载失败", `错误码 ${code}：${desc}\n${url}`);
  });

  mainWindow.on("ready-to-show", () => {
    mainWindow?.show();

    // 界面自检钩子：MCSS_ACT="<js>" 在窗口显示后执行一段脚本（点按钮、切标签页）
    if (process.env.MCSS_ACT) {
      setTimeout(async () => {
        try {
          const r = await mainWindow?.webContents.executeJavaScript(process.env.MCSS_ACT!);
          logLine("act", String(r).slice(0, 800));
        } catch (err) {
          logLine("act-error", String(err?.message || err));
        }
      }, Number(process.env.MCSS_ACT_DELAY || 1800));
    }
    // 默认不开 DevTools（打包版本来就不开）；需要时设 MCSS_DEVTOOLS=1
    if (!app.isPackaged && process.env.MCSS_DEVTOOLS === "1") {
      mainWindow?.webContents.openDevTools({ mode: "detach" });
    }
    // 截图自检：MCSS_SHOT=<png 路径>，配合 MCSS_SHOT_EXIT=1 截图后自动退出
    if (process.env.MCSS_SHOT || process.env.MCSS_DUMP) {
      setTimeout(async () => {
        try {
          if (process.env.MCSS_DUMP) {
            const text = await mainWindow?.webContents.executeJavaScript(
              "JSON.stringify({href: location.href, hash: location.hash, search: location.search}) + '\\n' + document.body.innerText"
            );
            // 首尾标记：探针按标记截取，避免把后面的日志混进页面文本
            console.log("DUMP>>>" + String(text ?? "").slice(0, 20000) + "\nDUMP<<<");
          }
          if (process.env.MCSS_SHOT) {
            const image = await mainWindow?.webContents.capturePage();
            if (image) fs.writeFileSync(process.env.MCSS_SHOT!, image.toPNG());
            console.log("screenshot saved:", process.env.MCSS_SHOT);
          }
        } catch (err) {
          console.error("screenshot failed:", err);
        }
        if (process.env.MCSS_SHOT_EXIT === "1") app.quit();
      }, Number(process.env.MCSS_SHOT_DELAY || 2500));
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalSafe(url).catch(() => {});
    return { action: "deny" };
  });

  const url = process.env.ELECTRON_RENDERER_URL;
  // 截图/联调时可从指定路由启动：MCSS_START_HASH="/instances/legacy?tab=console"
  const startHash = process.env.MCSS_START_HASH;
  if (externalUrl) mainWindow.loadURL(externalUrl);
  else if (url) mainWindow.loadURL(startHash ? `${url}#${startHash}` : url);
  else mainWindow.loadFile(path.join(__dirname, "..", "renderer", "index.html"), startHash ? { hash: startHash } : undefined);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

ipcMain.on("window:minimize", () => mainWindow?.minimize());
ipcMain.on("window:maximize", () => {
  if (!mainWindow) return;
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
});
ipcMain.on("window:close", async () => {
  if (!mainWindow) return;
  if (server.getStatus() !== "stopped") {
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: "warning",
      buttons: ["取消", "停止服务器并退出"],
      defaultId: 1,
      cancelId: 0,
      title: "服务器仍在运行",
      message: "Minecraft 服务器仍在运行，关闭应用前会先停止服务器。",
      detail: "建议先在控制台用 say 通知玩家，再关闭服务器。"
    });
    if (response === 0) return;
    // 等服务器真的退出再关窗；否则 java 可能变孤儿，自动备份也来不及跑
    await server.stopAndWait(12000);
  }
  mainWindow.close();
});
ipcMain.handle("window:is-maximized", () => (mainWindow ? mainWindow.isMaximized() : false));

/* ---------------------------------- 配置 ---------------------------------- */

ipcMain.handle("config:read", () => readConfig());
ipcMain.handle("config:write", (_e, patch) => {
  const next = configStore.write(patch || {});
  if (typeof patch?.activeInstanceId === "string") activeInstanceId = patch.activeInstanceId;
  return next;
});
ipcMain.handle("config:reset", () => {
  configStore.reset();
  return configStore.read();
});

ipcMain.handle("app:info", () => ({
  version: app.getVersion(),
  isPackaged: app.isPackaged,
  // appData 是**应用自己的**目录（%APPDATA%\wulons-mcss），不是 %APPDATA%
  appData: app.getPath("userData"),
  // 玩家真正要用的 .minecraft 在 %APPDATA% 下：单独给一个字段，别让每个页面自己剥路径
  minecraftDir: path.join(app.getPath("appData"), ".minecraft"),
  documents: app.getPath("documents"),
  userName: process.env.USERNAME || "",
  platform: process.platform,
  totalMemGb: Math.floor(os.totalmem() / 1024 ** 3),
  electron: process.versions.electron,
  node: process.versions.node
}));

/* --------------------------------- 对话框 --------------------------------- */

ipcMain.handle("dialog:open-file", async (_e, filters) => {
  const res = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters: filters || [{ name: "所有文件", extensions: ["*"] }]
  });
  return res.canceled ? null : res.filePaths[0];
});

ipcMain.handle("dialog:open-directory", async () => {
  const res = await dialog.showOpenDialog(mainWindow, { properties: ["openDirectory"] });
  return res.canceled ? null : res.filePaths[0];
});

ipcMain.handle("dialog:save-file", async (_e, opts) => {
  const res = await dialog.showSaveDialog(mainWindow, {
    defaultPath: opts?.defaultPath,
    filters: opts?.filters || [{ name: "JSON", extensions: ["json"] }]
  });
  return res.canceled ? null : res.filePath;
});

/* --------------------------------- 文件 ---------------------------------- */

ipcMain.handle("fs:read", (_e, p) => files.readText(p));
ipcMain.handle("fs:write", (_e, p, content) => files.writeText(p, content));
ipcMain.handle("fs:list", (_e, p) => files.listDir(p));
ipcMain.handle("fs:exists", (_e, p) => files.exists(p));
ipcMain.handle("fs:mkdir", (_e, p) => files.mkdir(p));
ipcMain.handle("fs:remove", (_e, p) => files.remove(p));
ipcMain.handle("fs:copy", (_e, src, dest) => files.copy(src, dest));

ipcMain.handle("props:read", (_e, p) => files.readProperties(p));
ipcMain.handle("props:write", (_e, p, props) => files.writeProperties(p, props));

/* --------------------------------- Mod ----------------------------------- */

ipcMain.handle("mods:scan", (_e, dir) => mods.scanMods(dir));
ipcMain.handle("mods:meta", (_e, jarPath) => mods.readModMeta(jarPath));
ipcMain.handle("mods:resolve-modrinth", async (_e, list) => {
  try {
    return await modrinth.resolveMany(Array.isArray(list) ? list : []);
  } catch (err) {
    return [];
  }
});
ipcMain.handle("mods:disable", (_e, jarPath) => {
  if (!fs.existsSync(jarPath)) throw new Error("找不到这个 Mod 文件");
  const dest = `${jarPath}.disabled`;
  if (fs.existsSync(dest)) fs.unlinkSync(dest);
  fs.renameSync(jarPath, dest);
  return true;
});
ipcMain.handle("mods:enable", (_e, jarPath) => {
  if (!fs.existsSync(jarPath)) throw new Error("找不到这个 Mod 文件");
  const dest = jarPath.replace(/\.disabled$/i, "");
  fs.renameSync(jarPath, dest);
  return true;
});

/* -------------------------------- 多世界 ---------------------------------- */

// 多世界生成逻辑放在渲染层（src/renderer/lib/worlds.ts），
// 与 CLI 共用 wulons-mcss-mwm 的生成器，桌面版/网页版跑同一份代码，不再单独开通道。

/* -------------------------------- 版本/下载 ------------------------------- */

ipcMain.handle("versions:minecraft", () => versions.listMinecraft());
ipcMain.handle("versions:ecosystem", (_e, list) => versions.ecosystem(list));
ipcMain.handle("versions:fabric-loaders", (_e, mc) => versions.fabricLoaders(mc));
/** 某个核心在某个 MC 版本下的构建列表（Paper 的 build / Purpur 的 build / Fabric 的 loader） */
ipcMain.handle("versions:server-builds", async (_e, serverType, mc) => {
  if (!mc) return [];
  if (serverType === "fabric") return versions.fabricLoaders(mc);
  if (serverType === "paper") return versions.paperBuilds(mc);
  if (serverType === "purpur") return versions.purpurBuilds(mc);
  if (serverType === "forge") return versions.forgeBuilds(mc);
  if (serverType === "neoforge") return versions.neoforgeBuilds(mc);
  return [];
});
/** 猜一个目录用的是哪种核心（导入既有服务器用） */
ipcMain.handle("versions:detect-server", (_e, dir) => versions.detectServer(dir));

/** 跑一个子进程并等它结束（Forge/NeoForge 安装器要用） */
ipcMain.handle("proc:run", (_e, opts) => proc.run(opts || {}));
ipcMain.handle("versions:install", async (_e, opts) => {
  try {
    const res = await versions.installServer({
      ...opts,
      onProgress: (p) => send("versions:progress", p)
    });
    return { ok: true, ...res };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

/* -------------------------------- Java ----------------------------------- */

ipcMain.handle("app:pick-java", async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters: [{ name: "Java", extensions: ["exe"] }]
  });
  if (res.canceled) return null;
  return res.filePaths[0];
});

// 自动安装 Java 还没做：宁可没有这个入口，也不留一个「点了只是探测一下」的假按钮
ipcMain.handle("app:detect-java", () => javaIpc.detectJava());

ipcMain.handle("ai:export-bundle", async (_e, opts) => {
  try {
    const inst = findInstance(opts?.instanceId);
    if (!inst) return { ok: false, error: "实例不存在" };
    const docsDir = app.isPackaged ? path.join(process.resourcesPath, "ai") : path.join(__dirname, "..", "..", "docs", "ai");
    let preflightResult = null;
    try {
      preflightResult = (await preflight.run(inst))?.issues ?? null;
    } catch (e) {}
    return aidiag.exportBundle({
      outFile: opts.outFile,
      instance: inst,
      logs: Array.isArray(opts.logs) ? opts.logs : [],
      symptom: opts.symptom,
      preflight: preflightResult,
      config: readConfig(),
      docsDir,
      appVersion: app.getVersion(),
    });
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle("ai:docs-path", () => (app.isPackaged ? path.join(process.resourcesPath, "ai") : path.join(__dirname, "..", "..", "docs", "ai")));

/** Minecraft 服务器列表协议：在线人数 / 版本 / MOTD（实现见 ipc/slp.js） */
ipcMain.handle("net:ping", (_e, opts) => slp.ping(opts?.host, opts?.port, opts?.timeoutMs));

/** 探测某个地址能不能连上（用于判断是否同一局域网） */
ipcMain.handle("net:probe", (_e, opts) => {
  const net = require("net");
  const host = opts?.host || "127.0.0.1";
  const port = Number(opts?.port) || 25565;
  const timeoutMs = Number(opts?.timeoutMs) || 800;
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const start = Date.now();
    let settled = false;
    const done = (ok) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ ok, ms: Date.now() - start });
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
    try {
      socket.connect(port, host);
    } catch (e) {
      done(false);
    }
  });
});

/** AI 知识库目录（开发在仓库 docs/ai，打包后在 resources/ai） */
ipcMain.handle("app:ai-docs", () => {
  if (app.isPackaged) return path.join(process.resourcesPath, "ai");
  return path.join(__dirname, "..", "..", "docs", "ai");
});

/** 探测常见启动器（只做「找到并帮你打开」，不做实例注入） */
ipcMain.handle("app:detect-launchers", () => {
  const home = require("os").homedir();
  const env = process.env;
  const candidates = [
    { name: "Plain Craft Launcher 2", path: path.join(home, "Desktop", "Plain Craft Launcher 2.exe") },
    {
      name: "Plain Craft Launcher 2",
      path: path.join(process.env.LOCALAPPDATA || "", "Programs", "Plain Craft Launcher 2", "Plain Craft Launcher 2.exe"),
    },
    { name: "Minecraft Launcher", path: "C:\\Program Files (x86)\\Minecraft Launcher\\MinecraftLauncher.exe" },
    { name: "Minecraft Launcher", path: "C:\\Program Files\\Minecraft Launcher\\MinecraftLauncher.exe" },
    { name: "Modrinth App", path: path.join(env.LOCALAPPDATA || "", "Programs", "Modrinth App", "Modrinth App.exe") },
    { name: "Prism Launcher", path: path.join(env.APPDATA || "", "PrismLauncher", "prismlauncher.exe") },
    { name: "HMCL", path: path.join(home, "Desktop", "HMCL.exe") },
    { name: "HMCL", path: path.join(home, "Desktop", "HMCL.jar") },
  ];
  const found = [];
  const seen = new Set();
  for (const c of candidates) {
    if (!c.path || seen.has(c.path)) continue;
    seen.add(c.path);
    try {
      if (fs.existsSync(c.path)) found.push(c);
    } catch (e) {}
  }
  return found;
});

/** 本机内网地址（同 WiFi 的朋友可以直接连） */
ipcMain.handle("app:lan-address", async () => ({ ip: await netdoctor.lanAddress() }));

/** 网络体检：网卡 / 公网 IP / NAT 类型 / UPnP 网关（只探测，不改路由器） */
ipcMain.handle("net:doctor", () => netdoctor.doctor());
/** 显式端口映射：只在用户点「在路由器上开端口」时调用 */
ipcMain.handle("net:upnp-map", (_e, arg) => {
  const port = typeof arg === "number" ? arg : arg?.port;
  const lanIp = typeof arg === "object" && arg ? arg.lanIp : undefined;
  return netdoctor.upnpMap(port, lanIp);
});
ipcMain.handle("net:upnp-unmap", (_e, arg) => netdoctor.upnpUnmap(typeof arg === "number" ? arg : arg?.port));

/* --------------------------------- 服务器 --------------------------------- */

ipcMain.handle("server:preflight", async (_e, instanceId) => {
  const inst = findInstance(instanceId);
  if (!inst) return { ok: false, issues: [{ id: "no-instance", level: "error", title: "实例不存在", detail: "" }] };
  return preflight.run(inst);
});

/** 启动某个实例（IPC 与定时任务共用） */
function startInstance(instanceId) {
  const inst = findInstance(instanceId);
  if (!inst) return { ok: false, error: "实例不存在" };

  activeInstanceId = instanceId;
  configStore.write({ activeInstanceId: instanceId });

  const mem = [`-Xms${inst.memoryMin || 2}G`, `-Xmx${inst.memoryMax || 4}G`].join(" ");
  const jvmArgs = [mem, inst.jvmArgs || ""].filter(Boolean).join(" ");
  const res = server.start(inst.javaPath || "java", inst.dir, jvmArgs);
  if (res?.ok) {
    runningInstanceId = instanceId;
    const cfg = readConfig();
    configStore.write({
      instances: cfg.instances.map((i) => (i.id === instanceId ? { ...i, lastStartedAt: Date.now(), updatedAt: Date.now() } : i)),
    });
  }
  return res || { ok: true };
}

ipcMain.handle("server:start", (_e, instanceId) => startInstance(instanceId));

ipcMain.handle("server:stop", () => {
  server.stop();
});
ipcMain.handle("server:command", (_e, cmd) => server.sendCommand(cmd));
ipcMain.handle("server:status", () => server.getStatus());
ipcMain.handle("server:memory", () => server.getMemory());
ipcMain.handle("server:pid", () => server.getPid());

server.onOutput((entry) => send("server:output", entry));
server.onStatus((status) => {
  send("server:status", status);

  // 停服后自动备份（可在世界页开关）——只备份真正在跑的那个实例
  if (status === "stopped" && runningInstanceId) {
    const stoppedId = runningInstanceId;
    runningInstanceId = null;
    const cfg = readConfig();
    if (cfg.autoBackupOnStop) {
      const inst = findInstance(stoppedId);
      if (inst) {
        // 备份现在是异步的：不能在第 528 行的同步 try 里 await，
        // 而且失败也不能影响停服流程
        pendingBackup = backup
          .create(inst.dir, null)
          .then((res) => {
            if (res.ok) {
              backup.prune(inst.dir, cfg.backupKeep ?? 5);
              send("server:output", { timestamp: new Date().toLocaleTimeString("zh-CN"), level: "INFO", message: `已自动备份 ${res.name}` });
            }
          })
          .catch(() => {})
          .finally(() => {
            pendingBackup = null;
          });
      }
    }
  }

  // 定时重启：停服后自动再拉起来
  if (status === "stopped" && restartPending) {
    const id = restartPending;
    restartPending = null;
    const log = (msg) => send("server:output", { timestamp: new Date().toLocaleTimeString("zh-CN"), level: "INFO", message: msg });
    log("定时重启：3 秒后重新启动");
    setTimeout(() => {
      const res = startInstance(id);
      log(res.ok ? "定时重启：已重新启动" : `定时重启失败：${res.error || "未知原因"}`);
    }, 3000);
  }
});

/* ---------------------------------- 系统 ---------------------------------- */

ipcMain.handle("app:open-path", (_e, p) => {
  const target = String(p || "");
  // 打开目录/文档没问题；不要因为一个路径字符串就去执行程序
  if (!target || /\.(bat|cmd|ps1|vbs|js|msi|scr|com|pif)$/i.test(target)) {
    throw new Error("这个路径不能直接打开");
  }
  return shell.openPath(target);
});
ipcMain.handle("app:open-external", (_e, url) => openExternalSafe(String(url || "")));

/* --------------------------------- 备份 ---------------------------------- */

ipcMain.handle("backup:list", (_e, serverDir) => backup.list(serverDir));
ipcMain.handle("backup:create", (_e, serverDir) => backup.create(serverDir, server));
ipcMain.handle("backup:restore", (_e, serverDir, name) => backup.restore(serverDir, name, server));
ipcMain.handle("backup:remove", (_e, serverDir, name) => backup.remove(serverDir, name));

/* 增量快照：只存变过的文件，快照之间共用内容 */
ipcMain.handle("backup:snapshot", (_e, serverDir) => backups.createSnapshot(serverDir));
ipcMain.handle("backup:snapshots", (_e, serverDir) => backups.listSnapshots(serverDir));
ipcMain.handle("backup:restore-snapshot", (_e, serverDir, name) => {
  if (server.getStatus() !== "stopped") return { ok: false, error: "请先停止服务器再执行恢复，运行中恢复可能损坏存档" };
  return backups.restoreSnapshot(serverDir, name);
});

/* -------------------------------- 资源库 --------------------------------- */

ipcMain.handle("client:export-mrpack", async (_e, opts) => {
  try {
    const res = await mrpack.exportMrpack({
      outFile: opts.outFile,
      room: opts.room,
      onProgress: (p) => send("client:progress", p),
    });
    return res;
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

/**
 * 直接启动游戏：命令由渲染层的计划生成器拼好，这里只负责 spawn。
 * detached + unref：应用退出后游戏窗口不受影响。
 */
ipcMain.handle("client:launch", (_e, opts) => {
  const command: string[] = Array.isArray(opts?.command) ? opts.command : [];
  if (!command.length) return { ok: false, error: "没有可执行的启动命令" };
  try {
    const child = spawn(command[0], command.slice(1), {
      cwd: opts?.cwd || undefined,
      detached: true,
      stdio: "ignore",
      windowsHide: false,
    });
    child.unref();
    return { ok: true, pid: child.pid ?? null };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle("client:add-server", (_e, opts) => {
  try {
    return serversdat.addServer(opts.mcDir, { name: opts.name, ip: opts.ip });
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle("client:scan", (_e, dir) => {
  try {
    return client.scanClient(dir);
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle("client:prepare", async (_e, opts) => {
  try {
    const res = await client.prepare({ ...opts, onProgress: (p) => send("client:progress", p) });
    return res;
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle("modrinth:search", (_e, q, opts) => modrinth.search(q, opts));
ipcMain.handle("modrinth:project", (_e, projectId) => modrinth.project(projectId));
ipcMain.handle("modrinth:translate", (_e, projectId) => modrinth.translateProject(projectId));
ipcMain.handle("translate:text", (_e, text, opts) => modrinth.translateText(text, opts));
ipcMain.handle("modrinth:versions", (_e, projectId, opts) => modrinth.versions(projectId, opts));
ipcMain.handle("modrinth:install", async (_e, opts) => {
  try {
    return await modrinth.install(opts);
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

/* --------------------------------- FRP ----------------------------------- */

ipcMain.handle("frp:start", async (_e, profile) => {
  if (profile?.kind === "sakura") return frp.startSakura(profile.exePath);
  return frp.start(profile, (got, total) => send("frp:log", `正在下载 frpc ${(got / 1048576).toFixed(1)}/${(total / 1048576).toFixed(1)} MB`));
});
ipcMain.handle("frp:stop", () => frp.stop());
ipcMain.handle("frp:status", () => frp.status());
frp.onLog((line) => send("frp:log", line));
frp.onStatus((state) => send("frp:status", state));

/* ---------------------------------- 生命周期 ------------------------------ */

// 主进程自己也别悄悄死：记下来，继续跑（退出 = 用户看到黑屏，比留痕更糟）
process.on("uncaughtException", (err) => {
  logLine("main-uncaught", `${err?.stack || err}`);
});
process.on("unhandledRejection", (reason) => {
  logLine("main-unhandled-rejection", `${(reason as any)?.stack || reason}`);
});
app.on("child-process-gone", (_e, details) => {
  logLine("child-process-gone", `${details.type} ${details.reason}`);
});

app.whenReady().then(() => {
  configStore = createConfigStore(getConfigPath());
  const cfg = readConfig();
  activeInstanceId = cfg.activeInstanceId;
  createWindow();
  startScheduler();

  // 联调钩子：启动后自动拉起某个实例（截图验证崩溃/诊断用）
  if (process.env.MCSS_AUTOSTART) {
    setTimeout(() => {
      try {
        startInstance(process.env.MCSS_AUTOSTART);
      } catch (e) {}
    }, 1500);
  }
});

/**
 * 定时任务：每 30 秒看一眼当前实例的计划。
 * 只对「正在运行」的实例生效——没跑就没必要重启/广播。
 */
function startScheduler() {
  setInterval(() => {
    try {
      const cfg = readConfig();
      // 只调度真正在跑的那个实例；activeInstanceId 只是 UI 当前选中，可能已经切走
      const inst = cfg.instances.find((i) => i.id === runningInstanceId);
      if (!inst?.schedule) return;

      const running = server.getStatus() === "running";
      const prev = scheduleState.get(inst.id) ?? {};
      const { actions, state } = schedule.tick({ schedule: inst.schedule, state: prev, running, now: new Date() });
      scheduleState.set(inst.id, state);

      for (const action of actions) {
        if (action.type === "restart") {
          restartPending = inst.id;
          send("server:output", { timestamp: new Date().toLocaleTimeString("zh-CN"), level: "INFO", message: "定时重启：正在停服" });
          server.stop();
        } else if (action.type === "broadcast") {
          server.sendCommand(`say ${action.text}`);
        } else if (action.type === "backup") {
          void backup
            .create(inst.dir, server)
            .then((res) => {
              if (res.ok) {
                backup.prune(inst.dir, cfg.backupKeep ?? 5);
                send("server:output", { timestamp: new Date().toLocaleTimeString("zh-CN"), level: "INFO", message: `定时备份完成：${res.name}` });
              }
            })
            .catch(() => {});
        }
      }
    } catch (e) {
      /* 定时任务出错不能影响主进程 */
    }
  }, 30_000);
}

app.on("window-all-closed", () => {
  // 让 before-quit 统一负责「停服并等待」；这里不要先 stop 再立即 quit
  if (process.platform !== "darwin") app.quit();
});

let quitting = false;
app.on("before-quit", (e) => {
  if (quitting) return;
  if (server.getStatus() === "stopped") return;
  e.preventDefault();
  quitting = true;
  void (async () => {
    await server.stopAndWait(12000);
    // 等停服自动备份写完再退，否则备份会被 app.quit 掐断
    if (pendingBackup) await pendingBackup;
    app.quit();
  })();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
