const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

function readFile(filePath) {
  return fs.readFileSync(filePath, 'utf-8')
}

function writeFile(filePath, content) {
  fs.writeFileSync(filePath, content, 'utf-8')
}

function readDir(dirPath) {
  return fs.readdirSync(dirPath)
}

function readServerProperties(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8')
  const props = {}
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    props[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
  }
  return props
}

function writeServerProperties(filePath, props) {
  let content = `#Minecraft server properties\n#${new Date().toISOString()}\n`
  for (const [key, val] of Object.entries(props)) {
    content += `${key}=${val}\n`
  }
  fs.writeFileSync(filePath, content, 'utf-8')
}

function readModMeta(jarPath) {
  const { execFileSync } = require('child_process')
  try {
    const stdout = execFileSync('tar', ['-xf', jarPath, '-O', 'fabric.mod.json'], { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] })
    if (stdout.trim()) {
      try { return JSON.parse(stdout.trim()) } catch(e) {}
    }
  } catch(e) {}
  return null
}

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.copyFileSync(src, dest)
  return dest
}

function exists(filePath) {
  return fs.existsSync(filePath)
}

function readConfig(configPath) {
  if (!fs.existsSync(configPath)) return {}
  try {
    // 去掉 BOM：Windows 记事本保存的 JSON 会带 BOM，直接 JSON.parse 会失败
    return JSON.parse(fs.readFileSync(configPath, 'utf-8').replace(/^\uFEFF/, ''))
  } catch(e) { return {} }
}

function writeConfig(configPath, data) {
  fs.mkdirSync(path.dirname(configPath), { recursive: true })
  // Merge with existing config to prevent field loss
  let existing = {}
  try { existing = JSON.parse(fs.readFileSync(configPath, 'utf-8')) } catch(e) {}
  const merged = { ...existing, ...data }
  fs.writeFileSync(configPath, JSON.stringify(merged, null, 2), 'utf-8')
}

function clearCache(configPath) {
  if (fs.existsSync(configPath)) fs.unlinkSync(configPath)
}

function getServerManifest(serverDir) {
  const modsDir = path.join(serverDir, 'mods')
  const worldDir = path.join(serverDir, 'world')

  const manifest = {
    appVersion: '1.0.0',
    mcVersion: '26.1',
    fabricLoader: '0.19.3',
    updatedAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
    mods: [],
    worlds: []
  }

  if (fs.existsSync(modsDir)) {
    manifest.mods = fs.readdirSync(modsDir)
      .filter(f => f.endsWith('.jar'))
      .map(f => ({ name: f.replace(/\.jar$/, ''), version: '' }))
  }

  if (fs.existsSync(worldDir)) {
    manifest.worlds.push({ name: 'world', lastPlayed: new Date(fs.statSync(worldDir).mtime).toISOString() })
  }

  return manifest
}

module.exports = { readFile, writeFile, readDir, readServerProperties, writeServerProperties, readModMeta, getServerManifest, copyFile, exists, readConfig, writeConfig, clearCache }