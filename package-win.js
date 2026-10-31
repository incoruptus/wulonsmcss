const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf-8'))
const OUT = `D:\\Games\\Minecraft\\MCServer\\wulons-mcss-b${pkg.version}`
const APP_DIR = 'D:\\Games\\Minecraft\\MCServer\\wulons-mcss'
const ELECTRON_DIST = path.join(APP_DIR, 'node_modules', '.pnpm', 'electron@33.4.11', 'node_modules', 'electron', 'dist')

const APP_NAME = 'WulonsMCSS'
const OUT_DIR = path.join(OUT, APP_NAME + '-win32-x64')
const RESOURCES_DIR = path.join(OUT_DIR, 'resources')
const ICON_PNG = path.join(APP_DIR, 'resources', 'app-icon.png')

function pngToIco(pngPath) {
  const pngData = fs.readFileSync(pngPath)
  const header = Buffer.alloc(6 + 16)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(1, 4)
  header.writeUInt8(0, 6)
  header.writeUInt8(0, 7)
  header.writeUInt8(0, 8)
  header.writeUInt8(0, 9)
  header.writeUInt16LE(1, 10)
  header.writeUInt16LE(32, 12)
  header.writeUInt32LE(pngData.length, 14)
  header.writeUInt32LE(22, 18)
  return Buffer.concat([header, pngData])
}

// Step 1: Clear output and copy electron runtime
console.log('Copying Electron runtime...')
if (fs.existsSync(OUT_DIR)) {
  try { fs.rmSync(OUT_DIR, { recursive: true, force: true }) } catch(e) {
    execSync(`rmdir /s /q "${OUT_DIR}" 2>nul`, { shell: true })
  }
}
fs.mkdirSync(RESOURCES_DIR, { recursive: true })

for (const e of fs.readdirSync(ELECTRON_DIST)) {
  const src = path.join(ELECTRON_DIST, e)
  const dest = path.join(OUT_DIR, e)
  if (fs.statSync(src).isDirectory()) {
    execSync(`xcopy "${src}" "${dest}\\" /E /I /Q /Y >nul 2>nul`, { shell: true })
  } else if (e !== 'electron.exe') {
    fs.cpSync(src, dest, { recursive: true })
  }
}
fs.cpSync(path.join(ELECTRON_DIST, 'electron.exe'), path.join(OUT_DIR, APP_NAME + '.exe'))

// Step 2: Generate .ico and embed into exe
if (fs.existsSync(ICON_PNG)) {
  console.log('Setting application icon...')
  const ICON_ICO = path.join(OUT_DIR, APP_NAME + '.ico')
  fs.writeFileSync(ICON_ICO, pngToIco(ICON_PNG))
  const rceditPath = path.join(APP_DIR, 'node_modules', '.pnpm', 'electron-builder-squirrel-w_a0f480f9f253a2ce4ae80312c2b87949', 'node_modules', 'electron-winstaller', 'vendor', 'rcedit.exe')
  if (fs.existsSync(rceditPath)) {
    try {
      execSync(`"${rceditPath}" "${path.join(OUT_DIR, APP_NAME + '.exe')}" --set-icon "${ICON_ICO}"`, { shell: true, timeout: 30000 })
      console.log('Icon embedded into executable.')
    } catch(e) { console.log('Icon embedding skipped.') }
  } else {
    console.log('rcedit not found, exe icon not embedded (taskbar icon still works via BrowserWindow).')
  }
}

// Step 3: Build app asar
console.log('Packing app.asar...')
const TMP = path.join(APP_DIR, '.tmp-pack')
if (fs.existsSync(TMP)) try { fs.rmSync(TMP, { recursive: true, force: true }) } catch(e) {}
fs.mkdirSync(TMP, { recursive: true })

for (const f of ['package.json']) {
  const src = path.join(APP_DIR, f)
  if (fs.existsSync(src)) fs.cpSync(src, path.join(TMP, f))
}

execSync(`xcopy "${path.join(APP_DIR, 'out')}" "${path.join(TMP, 'out')}\\" /E /I /Q /Y >nul 2>nul`, { shell: true })

const ipcDir = path.join(APP_DIR, 'electron', 'ipc')
if (fs.existsSync(ipcDir)) {
  execSync(`xcopy "${ipcDir}" "${path.join(TMP, 'electron', 'ipc')}\\" /E /I /Q /Y >nul 2>nul`, { shell: true })
}

// Resources: fonts + app icon (no wallpaper)
const resDest = path.join(TMP, 'resources')
const fontSrc = path.join(APP_DIR, 'resources', 'fonts')
if (fs.existsSync(fontSrc)) {
  execSync(`xcopy "${fontSrc}" "${path.join(resDest, 'fonts')}\\" /E /I /Q /Y >nul 2>nul`, { shell: true })
}
if (fs.existsSync(ICON_PNG)) {
  fs.mkdirSync(resDest, { recursive: true })
  fs.cpSync(ICON_PNG, path.join(resDest, 'app-icon.png'))
}

const asarBin = path.join(APP_DIR, 'node_modules', '.bin', 'asar.cmd')
execSync(`"${asarBin}" pack "${TMP}" "${path.join(RESOURCES_DIR, 'app.asar')}"`, { shell: true, timeout: 60000 })

fs.rmSync(TMP, { recursive: true, force: true })

// 多世界生成器已打包进渲染层（见 src/renderer/lib/mwm.ts），不再需要 resources/mwm

// AI 排错知识库：放到 asar 外的 resources/ai，提示词里会给用户这个路径
const aiDocs = path.join(APP_DIR, 'docs', 'ai')
if (fs.existsSync(aiDocs)) {
  console.log('Copying AI docs...')
  execSync(`xcopy "${aiDocs}" "${path.join(RESOURCES_DIR, 'ai')}\\" /E /I /Q /Y >nul 2>nul`, { shell: true })
}

// 本地助手：桌面版也用得上（网页版可以把这个 exe 单独发给朋友）
const agentExe = path.join(APP_DIR, 'agent', 'target', 'release', 'mcss-agent.exe')
if (fs.existsSync(agentExe)) {
  console.log('Copying local agent...')
  fs.mkdirSync(path.join(RESOURCES_DIR, 'agent'), { recursive: true })
  fs.copyFileSync(agentExe, path.join(RESOURCES_DIR, 'agent', 'mcss-agent.exe'))
  fs.copyFileSync(path.join(APP_DIR, 'agent', 'README.md'), path.join(RESOURCES_DIR, 'agent', 'README.md'))
}

// Step 4: Write metadata
fs.writeFileSync(path.join(OUT_DIR, 'version'), pkg.version)
const ownLicense = path.join(APP_DIR, 'LICENSE')
if (fs.existsSync(ownLicense)) {
  fs.copyFileSync(ownLicense, path.join(OUT_DIR, 'LICENSE'))
} else {
  fs.writeFileSync(path.join(OUT_DIR, 'LICENSE'), 'ISC License\nCopyright (c) 2026 隐刻INCO')
}

// 第三方许可证：Lucide/React/Radix 等随包分发，必须把版权与许可声明一起带上
const notices = path.join(APP_DIR, 'THIRD-PARTY-NOTICES.md')
if (fs.existsSync(notices)) {
  fs.copyFileSync(notices, path.join(OUT_DIR, 'THIRD-PARTY-NOTICES.md'))
}

// 出包信息：版本 / 提交 / 时间 / agent，排查「这个包到底是哪次构建」
const buildInfo = {
  version: pkg.version,
  commit: (() => {
    try {
      return execSync('git rev-parse --short HEAD', { cwd: APP_DIR }).toString().trim()
    } catch {
      return 'unknown'
    }
  })(),
  builtAt: new Date().toISOString(),
  agent: fs.existsSync(path.join(RESOURCES_DIR, 'agent', 'mcss-agent.exe')) ? pkg.version : null
}
fs.writeFileSync(path.join(OUT_DIR, 'build-info.json'), JSON.stringify(buildInfo, null, 2))

const size = (getDirSize(OUT_DIR) / 1024 / 1024).toFixed(1)
console.log(`\n===== Done =====\nOutput: ${OUT_DIR}\nSize: ${size} MB`)

function getDirSize(dir) {
  let total = 0
  try {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, item.name)
      if (item.isDirectory()) total += getDirSize(full)
      else total += fs.statSync(full).size
    }
  } catch(e) {}
  return total
}