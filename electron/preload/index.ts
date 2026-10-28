const { contextBridge, ipcRenderer } = require("electron");

/** 单个回调持有者：preload 上下文跨页面刷新存活，避免监听器重复注册 */
const handlers: Record<string, ((...args: any[]) => void) | null> = {};

function subscribe(channel: string, key: string, cb: (...args: any[]) => void) {
  if (handlers[key]) ipcRenderer.removeListener(channel, handlers[key]!);
  const fn = (_e: any, ...args: any[]) => cb(...args);
  handlers[key] = fn;
  ipcRenderer.on(channel, fn);
  return () => {
    ipcRenderer.removeListener(channel, fn);
    if (handlers[key] === fn) handlers[key] = null;
  };
}

const invoke = (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld("mcss", {
  window: {
    minimize: () => ipcRenderer.send("window:minimize"),
    maximize: () => ipcRenderer.send("window:maximize"),
    close: () => ipcRenderer.send("window:close"),
    isMaximized: () => invoke("window:is-maximized")
  },
  env: {
    appData: process.env.APPDATA || "",
    userName: process.env.USERNAME || "",
    platform: process.platform
  },
  config: {
    read: () => invoke("config:read"),
    write: (patch: any) => invoke("config:write", patch),
    reset: () => invoke("config:reset")
  },
  dialog: {
    openFile: (filters?: any) => invoke("dialog:open-file", filters),
    openDirectory: () => invoke("dialog:open-directory"),
    saveFile: (opts?: any) => invoke("dialog:save-file", opts)
  },
  fs: {
    read: (path: string) => invoke("fs:read", path),
    write: (path: string, content: string) => invoke("fs:write", path, content),
    list: (dir: string) => invoke("fs:list", dir),
    exists: (path: string) => invoke("fs:exists", path),
    mkdir: (path: string) => invoke("fs:mkdir", path),
    remove: (path: string) => invoke("fs:remove", path),
    copy: (src: string, dest: string) => invoke("fs:copy", src, dest)
  },
  server: {
    preflight: (instanceId: string) => invoke("server:preflight", instanceId),
    start: (instanceId: string) => invoke("server:start", instanceId),
    stop: () => invoke("server:stop"),
    command: (cmd: string) => invoke("server:command", cmd),
    status: () => invoke("server:status"),
    memory: () => invoke("server:memory"),
    pid: () => invoke("server:pid"),
    onOutput: (cb: (entry: any) => void) => subscribe("server:output", "output", cb),
    onStatus: (cb: (s: any) => void) => subscribe("server:status", "status", cb)
  },
  props: {
    read: (path: string) => invoke("props:read", path),
    write: (path: string, props: any) => invoke("props:write", path, props)
  },
  mods: {
    scan: (dir: string) => invoke("mods:scan", dir),
    meta: (jarPath: string) => invoke("mods:meta", jarPath),
    disable: (jarPath: string) => invoke("mods:disable", jarPath),
    enable: (jarPath: string) => invoke("mods:enable", jarPath)
  },
  worlds: {
    scan: (serverDir: string) => invoke("worlds:scan", serverDir),
    create: (serverDir: string, cfg: any) => invoke("worlds:create", serverDir, cfg),
    remove: (serverDir: string, packName: string) => invoke("worlds:remove", serverDir, packName),
    repair: (serverDir: string) => invoke("worlds:repair", serverDir),
    reload: () => invoke("worlds:reload")
  },
  versions: {
    minecraft: () => invoke("versions:minecraft"),
    fabricLoaders: (mc: string) => invoke("versions:fabric-loaders", mc),
    install: (opts: any) => invoke("versions:install", opts),
    onProgress: (cb: (p: any) => void) => subscribe("versions:progress", "versionsProgress", cb)
  },
  modrinth: {
    search: (q: string, opts?: any) => invoke("modrinth:search", q, opts),
    versions: (projectId: string, opts?: any) => invoke("modrinth:versions", projectId, opts),
    install: (opts: any) => invoke("modrinth:install", opts)
  },
  client: {
    prepare: (opts: any) => invoke("client:prepare", opts),
    onProgress: (cb: (p: any) => void) => subscribe("client:progress", "clientProgress", cb)
  },
  frp: {
    start: (profile: any) => invoke("frp:start", profile),
    stop: () => invoke("frp:stop"),
    status: () => invoke("frp:status"),
    onLog: (cb: (line: string) => void) => subscribe("frp:log", "frpLog", cb),
    onStatus: (cb: (s: any) => void) => subscribe("frp:status", "frpStatus", cb)
  },
  app: {
    info: () => invoke("app:info"),
    openPath: (path: string) => invoke("app:open-path", path),
    openExternal: (url: string) => invoke("app:open-external", url),
    pickJava: () => invoke("app:pick-java"),
    detectJava: () => invoke("app:detect-java"),
    detectLaunchers: () => invoke("app:detect-launchers"),
    lanAddress: () => invoke("app:lan-address"),
    installJava: () => invoke("app:install-java")
  }
});
