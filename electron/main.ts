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
const worlds = require(path.join(IPC_DIR, "worlds.js"));
const { createConfigStore } = require(path.join(IPC_DIR, "config.js"));

let mainWindow = null;
let configStore = null;
let activeInstanceId = null;

function getConfigPath() {
  if (app.isPackaged) return path.join(app.getPath("userData"), "config.json");
  return path.join(__dirname, "..", "..", "config.json");
}

function getMwmDir() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "mwm")
    : path.join(__dirname, "..", "..", "wulons-mcss-mwm");
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
      preload: path.join(__dirname, "..", "preload", "index.js"),
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
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  const url = process.env.ELECTRON_RENDERER_URL;
  if (url) mainWindow.loadURL(url);
  else mainWindow.loadFile(path.join(__dirname, "..", "renderer", "index.html"));

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

/* -------------------------------- 多世界 ---------------------------------- */

ipcMain.handle("worlds:scan", (_e, serverDir) => worlds.scan(serverDir));
ipcMain.handle("worlds:create", (_e, serverDir, cfg) => worlds.create(serverDir, cfg, getMwmDir()));
ipcMain.handle("worlds:remove", (_e, serverDir, pack) => worlds.remove(serverDir, pack));
ipcMain.handle("worlds:reload", () => {
  server.sendCommand("reload");
  return { success: true };
});

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

/* --------------------------------- 服务器 --------------------------------- */

ipcMain.handle("server:start", async (_e, instanceId) => {
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
      instances: cfg.instances.map((i) => (i.id === instanceId ? { ...i, lastStartedAt: Date.now(), updatedAt: Date.now() } : i))
    });
  }
  return res || { ok: true };
});

ipcMain.handle("server:stop", () => {
  server.stop();
});
ipcMain.handle("server:command", (_e, cmd) => server.sendCommand(cmd));
ipcMain.handle("server:status", () => server.getStatus());
ipcMain.handle("server:memory", () => server.getMemory());
ipcMain.handle("server:pid", () => server.getPid());

server.onOutput((entry) => send("server:output", entry));
server.onStatus((status) => send("server:status", status));

/* ---------------------------------- 系统 ---------------------------------- */

ipcMain.handle("app:open-path", (_e, p) => shell.openPath(p));
ipcMain.handle("app:open-external", (_e, url) => shell.openExternal(url));

/* ---------------------------------- 占位 ---------------------------------- */
// 后续版本接入：Modrinth 资源库 / FRP 隧道。先给出明确错误，避免调用方拿到 undefined。
for (const ch of ["modrinth:search", "modrinth:versions", "modrinth:install"]) {
  ipcMain.handle(ch, () => {
    throw new Error("资源库功能尚未接入");
  });
}
for (const ch of ["frp:start", "frp:stop", "frp:status"]) {
  ipcMain.handle(ch, () => {
    throw new Error("FRP 功能尚未接入");
  });
}

/* ---------------------------------- 生命周期 ------------------------------ */

app.whenReady().then(() => {
  configStore = createConfigStore(getConfigPath());
  const cfg = readConfig();
  activeInstanceId = cfg.activeInstanceId;
  createWindow();
});

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
