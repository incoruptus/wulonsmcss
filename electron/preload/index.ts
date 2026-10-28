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
  startServer: (javaPath, serverDir, jvmArgs) => ipcRenderer.invoke('server:start', javaPath, serverDir, jvmArgs),
  stopServer: () => ipcRenderer.invoke('server:stop'),
  sendCommand: (cmd) => ipcRenderer.invoke('server:command', cmd),
  getServerStatus: () => ipcRenderer.invoke('server:status'),
  getServerMemory: () => ipcRenderer.invoke('server:memory'),
  openPath: (filePath) => ipcRenderer.invoke('shell:openPath', filePath),

  // File operations
  readFile: (path) => ipcRenderer.invoke('file:read', path),
  writeFile: (path, content) => ipcRenderer.invoke('file:write', path, content),
  readDir: (dirPath) => ipcRenderer.invoke('file:readDir', dirPath),
  readServerProperties: (filePath) => ipcRenderer.invoke('file:readServerProperties', filePath),
  writeServerProperties: (filePath, props) => ipcRenderer.invoke('file:writeServerProperties', filePath, props),
  deleteFile: (filePath) => ipcRenderer.invoke('file:delete', filePath),
  readModMeta: (jarPath) => ipcRenderer.invoke('mod:readMeta', jarPath),
  generateManifest: (serverDir) => ipcRenderer.invoke('manifest:generate', serverDir),
  copyWallpaper: (src) => ipcRenderer.invoke('file:copyWallpaper', src),
  readWallpaper: (filePath) => ipcRenderer.invoke('file:readWallpaper', filePath),
  analyzeWallpaper: (filePath) => ipcRenderer.invoke('file:analyzeWallpaper', filePath),
  copyFile: (src, dest) => ipcRenderer.invoke('file:copy', src, dest),
  copyServerIcon: (src, serverDir) => ipcRenderer.invoke('file:copyServerIcon', src, serverDir),
  readConfig: () => ipcRenderer.invoke('file:readConfig'),
  writeConfig: (data) => ipcRenderer.invoke('file:writeConfig', data),
  clearCache: () => ipcRenderer.invoke('file:clearCache'),
  getDataPath: () => ipcRenderer.invoke('app:getDataPath'),

  // FRP
  startFrp: (config) => ipcRenderer.invoke('frp:start', config),
  stopFrp: () => ipcRenderer.invoke('frp:stop'),

  // File dialogs
  openFileDialog: (filters) => ipcRenderer.invoke('dialog:openFile', filters),
  saveFileDialog: (opts) => ipcRenderer.invoke('dialog:saveFile', opts),
  openDirectoryDialog: () => ipcRenderer.invoke('dialog:openDirectory'),

  // Events from main — single-callback to prevent duplicates on reload
  onServerOutput: (cb) => {
    if (_outputHandler) ipcRenderer.removeListener('server:output', _outputHandler)
    _outputHandler = (_e: any, data: any) => cb(data)
    ipcRenderer.on('server:output', _outputHandler)
  },
  onServerStatus: (cb) => {
    if (_statusHandler) ipcRenderer.removeListener('server:status-changed', _statusHandler)
    _statusHandler = (_e: any, status: any) => cb(status)
    ipcRenderer.on('server:status-changed', _statusHandler)
  },

  // Multi-World Management
  scanWorlds: (serverDir) => ipcRenderer.invoke('worlds:scan', serverDir),
  createWorld: (serverDir, worldConfig) => ipcRenderer.invoke('worlds:create', serverDir, worldConfig),
  deleteWorld: (serverDir, packName) => ipcRenderer.invoke('worlds:delete', serverDir, packName),
  reloadWorlds: () => ipcRenderer.invoke('worlds:reload')
})