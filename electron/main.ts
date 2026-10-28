const path = require("path");
const fs = require("fs");
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
const backups = require(path.join(IPC_DIR, "backups.js"));
const { createConfigStore } = require(path.join(IPC_DIR, "config.js"));

let mainWindow = null;
let configStore = null;
let activeInstanceId = null;
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

  mainWindow.on("ready-to-show", () => {
    mainWindow?.show();
    // 默认不开 DevTools（打包版本来就不开）；需要时设 MCSS_DEVTOOLS=1
    if (!app.isPackaged && process.env.MCSS_DEVTOOLS === "1") {
      mainWindow?.webContents.openDevTools({ mode: "detach" });
    }
    // 截图自检：MCSS_SHOT=<png 路径>，配合 MCSS_SHOT_EXIT=1 截图后自动退出
    if (process.env.MCSS_SHOT || process.env.MCSS_DUMP) {
      setTimeout(async () => {
        try {
          if (process.env.MCSS_DUMP) {
            const text = await mainWindow?.webContents.executeJavaScript("document.body.innerText");
            console.log("DUMP>>>" + String(text ?? "").slice(0, 20000));
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
    shell.openExternal(url);
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
      message: "Minecraft 服务器仍在运行，关闭应用会先停止服务器。",
      detail: "建议先在控制台用 say 通知玩家，再关闭。"
    });
    if (response === 0) return;
    server.stop();
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
  appData: app.getPath("userData"),
  documents: app.getPath("documents"),
  userName: process.env.USERNAME || "",
  platform: process.platform,
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
ipcMain.handle("versions:fabric-loaders", (_e, mc) => versions.fabricLoaders(mc));
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

ipcMain.handle("app:install-java", async () => {
  // 目前只做「探测并回报」，真正的自动安装链路在后续版本接入
  const list = javaIpc.detectJava();
  return list.length ? { ok: true, path: list[0].path } : { ok: false, error: "没有找到可用的 Java，请手动指定" };
});

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
    { name: "Plain Craft Launcher 2", path: "D:\\Games\\Minecraft\\Plain Craft Launcher 2.exe" },
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
ipcMain.handle("app:lan-address", () => {
  const os = require("os");
  const nets = os.networkInterfaces();
  for (const list of Object.values(nets)) {
    for (const net of list || []) {
      if (net.family === "IPv4" && !net.internal && /^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[01])\./.test(net.address)) {
        return { ip: net.address };
      }
    }
  }
  for (const list of Object.values(nets)) {
    for (const net of list || []) {
      if (net.family === "IPv4" && !net.internal) return { ip: net.address };
    }
  }
  return { ip: "127.0.0.1" };
});

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

  // 停服后自动备份（可在世界页开关）
  if (status === "stopped" && activeInstanceId) {
    const cfg = readConfig();
    if (cfg.autoBackupOnStop) {
      const inst = findInstance(activeInstanceId);
      if (inst) {
        try {
          const res = backup.create(inst.dir, null);
          if (res.ok) {
            backup.prune(inst.dir, cfg.backupKeep ?? 5);
            send("server:output", { timestamp: new Date().toLocaleTimeString("zh-CN"), level: "INFO", message: `已自动备份 ${res.name}` });
          }
        } catch (e) {}
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

ipcMain.handle("app:open-path", (_e, p) => shell.openPath(p));
ipcMain.handle("app:open-external", (_e, url) => shell.openExternal(url));

/* --------------------------------- 备份 ---------------------------------- */

ipcMain.handle("backup:list", (_e, serverDir) => backup.list(serverDir));
ipcMain.handle("backup:create", (_e, serverDir) => backup.create(serverDir, server));
ipcMain.handle("backup:restore", (_e, serverDir, name) => backup.restore(serverDir, name, server));
ipcMain.handle("backup:remove", (_e, serverDir, name) => backup.remove(serverDir, name));

/* 增量快照：只存变过的文件，快照之间共用内容 */
ipcMain.handle("backup:snapshot", (_e, serverDir) => backups.createSnapshot(serverDir));
ipcMain.handle("backup:snapshots", (_e, serverDir) => backups.listSnapshots(serverDir));
ipcMain.handle("backup:restore-snapshot", (_e, serverDir, name) => {
  if (server.getStatus() !== "stopped") return { ok: false, error: "先把服务器停掉再恢复，否则会写坏存档" };
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

ipcMain.handle("client:add-server", (_e, opts) => {
  try {
    return serversdat.addServer(opts.mcDir, { name: opts.name, ip: opts.ip });
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
  return frp.start(profile, (got, total) => send("frp:log", `下载 frpc ${(got / 1048576).toFixed(1)} / ${(total / 1048576).toFixed(1)} MB`));
});
ipcMain.handle("frp:stop", () => frp.stop());
ipcMain.handle("frp:status", () => frp.status());
frp.onLog((line) => send("frp:log", line));
frp.onStatus((state) => send("frp:status", state));

/* ---------------------------------- 生命周期 ------------------------------ */

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
      const inst = cfg.instances.find((i) => i.id === cfg.activeInstanceId);
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
          const res = backup.create(inst.dir, server);
          if (res.ok) {
            backup.prune(inst.dir, cfg.backupKeep ?? 5);
            send("server:output", { timestamp: new Date().toLocaleTimeString("zh-CN"), level: "INFO", message: `定时备份完成：${res.name}` });
          }
        }
      }
    } catch (e) {
      /* 定时任务出错不能影响主进程 */
    }
  }, 30_000);
}

app.on("window-all-closed", () => {
  server.stop();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  server.stop();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
