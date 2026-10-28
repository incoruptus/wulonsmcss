const { contextBridge, ipcRenderer } = require('electron')

// Single-callback holders — persists across page reloads (preload context)
let _outputHandler: any = null
let _statusHandler: any = null

contextBridge.exposeInMainWorld('electronAPI', {
  // Environment info (for renderer which has contextIsolation)
  env: {
    APPDATA: process.env.APPDATA || '',
    USERNAME: process.env.USERNAME || '',
  },
  // Window controls
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),

  // Server control
  startServer: (javaPath: string, serverDir: string, jvmArgs?: string) => ipcRenderer.invoke('server:start', javaPath, serverDir, jvmArgs),
  stopServer: () => ipcRenderer.invoke('server:stop'),
  sendCommand: (cmd: string) => ipcRenderer.invoke('server:command', cmd),
  getServerStatus: () => ipcRenderer.invoke('server:status'),
  getServerMemory: () => ipcRenderer.invoke('server:memory'),
  openPath: (filePath: string) => ipcRenderer.invoke('shell:openPath', filePath),

  // File operations
  readFile: (path: string) => ipcRenderer.invoke('file:read', path),
  writeFile: (path: string, content: string) => ipcRenderer.invoke('file:write', path, content),
  readDir: (dirPath: string) => ipcRenderer.invoke('file:readDir', dirPath),
  readServerProperties: (filePath: string) => ipcRenderer.invoke('file:readServerProperties', filePath),
  writeServerProperties: (filePath: string, props: Record<string, string>) => ipcRenderer.invoke('file:writeServerProperties', filePath, props),
  deleteFile: (filePath: string) => ipcRenderer.invoke('file:delete', filePath),
  readModMeta: (jarPath: string) => ipcRenderer.invoke('mod:readMeta', jarPath),
  generateManifest: (serverDir: string) => ipcRenderer.invoke('manifest:generate', serverDir),
  copyWallpaper: (src: string) => ipcRenderer.invoke('file:copyWallpaper', src),
  readWallpaper: (filePath: string) => ipcRenderer.invoke('file:readWallpaper', filePath),
  analyzeWallpaper: (filePath: string) => ipcRenderer.invoke('file:analyzeWallpaper', filePath),
  copyFile: (src: string, dest: string) => ipcRenderer.invoke('file:copy', src, dest),
  copyServerIcon: (src: string, serverDir: string) => ipcRenderer.invoke('file:copyServerIcon', src, serverDir),
  readConfig: () => ipcRenderer.invoke('file:readConfig'),
  writeConfig: (data: any) => ipcRenderer.invoke('file:writeConfig', data),
  clearCache: () => ipcRenderer.invoke('file:clearCache'),
  getDataPath: () => ipcRenderer.invoke('app:getDataPath'),

  // FRP
  startFrp: (config: any) => ipcRenderer.invoke('frp:start', config),
  stopFrp: () => ipcRenderer.invoke('frp:stop'),

  // File dialogs
  openFileDialog: (filters?: any) => ipcRenderer.invoke('dialog:openFile', filters),
  saveFileDialog: (opts?: any) => ipcRenderer.invoke('dialog:saveFile', opts),
  openDirectoryDialog: () => ipcRenderer.invoke('dialog:openDirectory'),

  // Events from main — single-callback to prevent duplicates on reload
  onServerOutput: (cb: (data: any) => void) => {
    if (_outputHandler) ipcRenderer.removeListener('server:output', _outputHandler)
    _outputHandler = (_e: any, data: any) => cb(data)
    ipcRenderer.on('server:output', _outputHandler)
  },
  onServerStatus: (cb: (status: string) => void) => {
    if (_statusHandler) ipcRenderer.removeListener('server:status-changed', _statusHandler)
    _statusHandler = (_e: any, status: any) => cb(status)
    ipcRenderer.on('server:status-changed', _statusHandler)
  },

  // Multi-World Management
  scanWorlds: (serverDir: string) => ipcRenderer.invoke('worlds:scan', serverDir),
  createWorld: (serverDir: string, worldConfig: any) => ipcRenderer.invoke('worlds:create', serverDir, worldConfig),
  deleteWorld: (serverDir: string, packName: string) => ipcRenderer.invoke('worlds:delete', serverDir, packName),
  reloadWorlds: () => ipcRenderer.invoke('worlds:reload')
})
