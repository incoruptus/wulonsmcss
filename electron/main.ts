const path = require('path')
const Module = require('module')

if (!process.activateUvLoop) {
  process.activateUvLoop = function() {}
}

try {
  if (Module.builtinModules.includes('electron/js2c/browser_init')) {
    require('electron/js2c/browser_init')
  }
} catch(e) {}

const { app, BrowserWindow, ipcMain, shell, dialog, nativeImage } = require('electron')
const { join } = require('path')

const server = require(join(__dirname, '..', '..', 'electron', 'ipc', 'server.js'))
const files = require(join(__dirname, '..', '..', 'electron', 'ipc', 'files.js'))

let mainWindow = null

function getConfigPath() {
  if (app.isPackaged) {
    return path.join(app.getPath('userData'), 'config.json')
  }
  return path.join(__dirname, '..', '..', 'config.json')
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    frame: false,
    show: true,
    icon: join(__dirname, '..', '..', 'resources', 'app-icon.png'),
    webPreferences: {
      preload: join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
    if (!app.isPackaged) mainWindow?.webContents.openDevTools()
  })
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  const url = process.env.ELECTRON_RENDERER_URL
  if (url) {
    mainWindow.loadURL(url)
  } else {
    mainWindow.loadFile(join(__dirname, '..', 'renderer', 'index.html'))
  }
}

// Window controls
ipcMain.on('window-minimize', () => mainWindow?.minimize())
ipcMain.on('window-maximize', () => {
  mainWindow?.isMaximized() ? mainWindow?.unmaximize() : mainWindow?.maximize()
})
ipcMain.on('window-close', async () => {
  if (server.getStatus() !== 'stopped') {
    const choice = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      buttons: ['取消', '关闭服务器'],
      defaultId: 1,
      cancelId: 0,
      title: '服务器仍在运行',
      message: 'Minecraft 服务器仍在运行中，关闭本应用也会停止服务器。',
      detail: '是否先向玩家发送提示消息再关闭？建议在控制台输入 say 通知玩家。'
    })
    if (choice.response === 0) return // cancelled
    server.stop()
  }
  mainWindow?.close()
})
ipcMain.handle('window-is-maximized', () => mainWindow?.isMaximized())

// Server control
ipcMain.handle('server:start', (_, javaPath, serverDir, jvmArgs) => {
  server.start(javaPath, serverDir, jvmArgs)
})

ipcMain.handle('server:stop', () => {
  server.stop()
})

ipcMain.handle('server:command', (_, cmd) => {
  server.sendCommand(cmd)
})

ipcMain.handle('server:status', () => {
  return server.getStatus()
})

ipcMain.handle('server:memory', () => {
  return server.getMemory()
})

// FRP process control
let frpProcess = null
ipcMain.handle('frp:start', async (_, config) => {
  if (frpProcess) return
  const { spawn } = require('child_process')
  frpProcess = spawn(config.frpPath || 'SakuraLauncher.exe', [], { stdio: 'ignore' })
  return true
})
ipcMain.handle('frp:stop', () => {
  if (frpProcess) { frpProcess.kill(); frpProcess = null }
})

// Open a folder in system file explorer
ipcMain.handle('shell:openPath', async (_, filePath) => {
  return shell.openPath(filePath)
})

// Server output events sent to renderer
server.onOutput((entry) => {
  mainWindow?.webContents.send('server:output', entry)
})

server.onStatus((status) => {
  mainWindow?.webContents.send('server:status-changed', status)
})

// File operations
ipcMain.handle('file:read', (_, filePath) => {
  return files.readFile(filePath)
})

ipcMain.handle('file:write', (_, filePath, content) => {
  files.writeFile(filePath, content)
})

ipcMain.handle('file:readDir', (_, dirPath) => {
  return files.readDir(dirPath)
})

ipcMain.handle('file:readServerProperties', (_, filePath) => {
  return files.readServerProperties(filePath)
})

ipcMain.handle('file:writeServerProperties', (_, filePath, props) => {
  files.writeServerProperties(filePath, props)
})

ipcMain.handle('mod:readMeta', (_, jarPath) => {
  return files.readModMeta(jarPath)
})

ipcMain.handle('file:delete', (_, filePath) => {
  try { require('fs').unlinkSync(filePath) } catch(e) {}
})

ipcMain.handle('file:copyServerIcon', (_, src, serverDir) => {
  try {
    const dest = require('path').join(serverDir, 'server-icon.png')
    require('fs').copyFileSync(src, dest)
  } catch(e) {}
})

ipcMain.handle('manifest:generate', (_, serverDir) => {
  return files.getServerManifest(serverDir)
})

// Wallpaper copy + config persistence
function analyzeBrightness(filePath) {
  try {
    const img = nativeImage.createFromPath(filePath)
    if (img.isEmpty()) return 0.5
    // Only analyze the center 40% of the image (where content appears)
    const w = img.getSize().width, h = img.getSize().height
    const cx = Math.floor(w * 0.3), cy = Math.floor(h * 0.3)
    const cw = Math.floor(w * 0.4), ch = Math.floor(h * 0.4)
    const cropped = img.crop({ x: cx, y: cy, width: cw, height: ch })
    const buf = cropped.toBitmap()
    let total = 0, count = 0
    for (let i = 0; i < buf.length; i += 16) {
      const b = buf[i], g = buf[i + 1], r = buf[i + 2]
      total += (r * 0.299 + g * 0.587 + b * 0.114)
      count++
    }
    return count > 0 ? total / count / 255 : 0.5
  } catch(e) { return 0.5 }
}

// 用户上传的壁纸一律落到 userData/wallpapers：
// 打包后 app.asar 只读，写 resources/ 会静默失败；开发时也不会覆盖内置壁纸
function getWallpaperDir() {
  return path.join(app.getPath('userData'), 'wallpapers')
}

ipcMain.handle('file:copyWallpaper', (_, src) => {
  const ext = path.extname(src).toLowerCase() || '.png'
  const dest = path.join(getWallpaperDir(), 'wallpaper' + ext)
  files.copyFile(src, dest)
  const mimeTypes = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.bmp': 'image/bmp' }
  const mime = mimeTypes[ext] || 'image/png'
  const data = require('fs').readFileSync(dest)
  const brightness = analyzeBrightness(dest)
  return { path: dest, dataUrl: `data:${mime};base64,${data.toString('base64')}`, brightness }
})

ipcMain.handle('file:analyzeWallpaper', (_, filePath) => {
  return { brightness: analyzeBrightness(filePath) }
})

ipcMain.handle('file:readConfig', () => {
  return files.readConfig(getConfigPath())
})

ipcMain.handle('file:writeConfig', (_, data) => {
  files.writeConfig(getConfigPath(), data)
})

// Read wallpaper file as base64 data URL for display
ipcMain.handle('file:readWallpaper', (_, filePath) => {
  try {
    if (!require('fs').existsSync(filePath)) return null
    const ext = require('path').extname(filePath).toLowerCase()
    const mimeTypes = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.bmp': 'image/bmp' }
    const mime = mimeTypes[ext] || 'image/png'
    const data = require('fs').readFileSync(filePath)
    return `data:${mime};base64,${data.toString('base64')}`
  } catch(e) { return null }
})

ipcMain.handle('file:clearCache', () => {
  const configPath = getConfigPath()
  files.clearCache(configPath)
  // 清掉用户上传并缓存的壁纸（内置壁纸在 resources/，不动）
  try {
    const dir = getWallpaperDir()
    if (require('fs').existsSync(dir)) {
      require('fs').readdirSync(dir)
        .filter((f: string) => f.startsWith('wallpaper.'))
        .forEach((f: string) => {
          try { require('fs').unlinkSync(path.join(dir, f)) } catch(e) {}
        })
    }
  } catch(e) {}
})

// Copy a file (used for mod installation)
ipcMain.handle('file:copy', (_, src, dest) => {
  return files.copyFile(src, dest)
})

// Get writable app data directory
ipcMain.handle('app:getDataPath', () => {
  if (app.isPackaged) {
    return app.getPath('userData')
  }
  return path.join(__dirname, '..', '..')
})

// Multi-World Management IPC
// 打包后 MWM 生成器放在 resources/mwm（asar 外），否则 app.asar 内的 ESM 子进程读取不稳妥
const mwmDir = app.isPackaged
  ? path.join(process.resourcesPath, 'mwm')
  : path.join(__dirname, '..', '..', 'wulons-mcss-mwm')

ipcMain.handle('worlds:scan', (_, serverDir) => {
  const datapacksDir = path.join(serverDir, 'world', 'datapacks')
  const worlds = []
  try {
    if (require('fs').existsSync(datapacksDir)) {
      const entries = require('fs').readdirSync(datapacksDir, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory() || !entry.name.startsWith('mwm-')) continue
        const packDir = path.join(datapacksDir, entry.name)
        const metaPath = path.join(packDir, 'pack.mcmeta')
        let info = { name: entry.name, worlds: [] }
        if (require('fs').existsSync(metaPath)) {
          try {
            const meta = JSON.parse(require('fs').readFileSync(metaPath, 'utf-8'))
            info.description = meta.pack?.description || ''
          } catch(e) {}
        }
        // Scan dimension JSONs inside the pack
        const dimDir = path.join(packDir, 'data')
        if (require('fs').existsSync(dimDir)) {
          const namespaces = require('fs').readdirSync(dimDir)
          for (const ns of namespaces) {
            const dimPath = path.join(dimDir, ns, 'dimension')
            if (require('fs').existsSync(dimPath)) {
              for (const dimFile of require('fs').readdirSync(dimPath)) {
                if (dimFile.endsWith('.json')) {
                  try {
                    const dimData = JSON.parse(require('fs').readFileSync(path.join(dimPath, dimFile), 'utf-8'))
                    info.worlds.push({
                      id: `${ns}:${dimFile.replace(/\.json$/, '')}`,
                      type: dimData.type || '',
                      generator: dimData.generator?.type || ''
                    })
                  } catch(e) {}
                }
              }
            }
          }
        }
        worlds.push(info)
      }
    }
  } catch(e) {}
  return worlds
})

ipcMain.handle('worlds:create', async (_, serverDir, worldConfig) => {
  const fs = require('fs')
  const { execFileSync } = require('child_process')
  const mwmCli = path.join(mwmDir, 'src', 'cli.js')
  if (!fs.existsSync(mwmCli)) return { success: false, error: `MWM 生成器缺失：${mwmCli}` }

  // 世界名会直接参与目录/命名空间，先做白名单校验，避免跳出服务端目录
  const name = String(worldConfig?.name || '')
  if (!/^[a-z0-9_-]{1,48}$/i.test(name)) {
    return { success: false, error: '世界名称只能包含字母、数字、下划线和连字符' }
  }
  const namespace = worldConfig?.namespace || 'wulons'
  if (!/^[a-z0-9_.-]{1,48}$/i.test(namespace)) {
    return { success: false, error: '命名空间不合法' }
  }

  // Build a temp config for MWM
  const tmpConfig = path.join(require('os').tmpdir(), `mwm-tmp-${Date.now()}.json`)
  const mwmConfig = { namespace, worlds: [{ ...worldConfig, name }] }
  fs.writeFileSync(tmpConfig, JSON.stringify(mwmConfig, null, 2))

  const tmpOutput = path.join(require('os').tmpdir(), `mwm-out-${Date.now()}`)
  try {
    // 用 Electron 自带的 Node 跑生成器，避免依赖用户机器上装了 node
    execFileSync(process.execPath, [mwmCli, tmpConfig, tmpOutput], {
      timeout: 30000,
      cwd: mwmDir,
      windowsHide: true,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
    })
    // Copy generated pack to server
    const packName = `mwm-${namespace}-${name}`
    const srcPack = path.join(tmpOutput, packName)
    const destPack = path.join(serverDir, 'world', 'datapacks', packName)
    if (fs.existsSync(srcPack)) {
      if (fs.existsSync(destPack)) fs.rmSync(destPack, { recursive: true, force: true })
      fs.cpSync(srcPack, destPack, { recursive: true })
      return { success: true }
    }
    return { success: false, error: 'MWM 生成器没有产出数据包' }
  } catch(e) {
    const detail = (e.stderr && e.stderr.toString().trim()) || ''
    return { success: false, error: detail ? `${e.message}\n${detail}` : e.message }
  } finally {
    try { fs.rmSync(tmpConfig, { force: true }) } catch(e) {}
    try { fs.rmSync(tmpOutput, { recursive: true, force: true }) } catch(e) {}
  }
})

ipcMain.handle('worlds:delete', (_, serverDir, packName) => {
  try {
    const packDir = path.join(serverDir, 'world', 'datapacks', packName)
    if (require('fs').existsSync(packDir)) {
      require('fs').rmSync(packDir, { recursive: true, force: true })
    }
    return { success: true }
  } catch(e) {
    return { success: false, error: e.message }
  }
})

ipcMain.handle('worlds:reload', () => {
  server.sendCommand('reload')
  return { success: true }
})

// File dialogs
ipcMain.handle('dialog:openFile', async (_, filters) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: filters || [{ name: 'Any', extensions: ['*'] }]
  })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('dialog:saveFile', async (_, opts) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: opts?.defaultPath || 'server-manifest.json',
    filters: opts?.filters || [{ name: 'JSON', extensions: ['json'] }]
  })
  return result.canceled ? null : result.filePath
})

ipcMain.handle('dialog:openDirectory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  })
  return result.canceled ? null : result.filePaths[0]
})

app.whenReady().then(createWindow)

// 关闭窗口时自动停服
app.on('window-all-closed', () => {
  server.stop()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  server.stop()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})