<template>
  <transition name="dialog">
    <div class="dialog-overlay" v-if="visible">
      <div class="dialog-card">
        <div class="setup-icon">
          <span class="material-symbols-outlined">{{ isFirstRun ? 'settings_applications' : 'map' }}</span>
        </div>
        <h2 class="setup-title">{{ isFirstRun ? '首次运行设置' : '服务端路径确认' }}</h2>
        <p class="setup-desc">{{ isFirstRun ? '选择 Minecraft 服务端文件夹和 Java 路径' : '检测到服务端配置不完整，请确认以下路径' }}</p>

        <div class="setup-field-row">
          <md-outlined-text-field class="setup-input" :value="serverDir" label="服务端文件夹" type="text" readonly></md-outlined-text-field>
          <md-outlined-button @click="browseServer">浏览</md-outlined-button>
        </div>
        <div class="setup-hint">应包含 fabric-server-launch.jar 或 server.jar</div>

        <div class="setup-field-row">
          <md-outlined-text-field class="setup-input" :value="javaPath" label="Java 路径" type="text" readonly></md-outlined-text-field>
          <md-outlined-button @click="browseJava">浏览</md-outlined-button>
        </div>
        <div class="setup-hint" v-if="javaDetected">自动检测到 {{ javaDetected }}</div>
        <div class="setup-hint warn" v-else>请手动选择 java.exe 路径</div>

        <div class="setup-actions">
          <md-filled-button @click="confirm" :disabled="!serverDir || !javaPath">
            <md-icon slot="icon">check</md-icon>
            确认
          </md-filled-button>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

const visible = ref(false)
const serverDir = ref('')
const javaPath = ref('')
const javaDetected = ref('')
const isFirstRun = ref(true)

onMounted(async () => {
  try {
    const cfg = await window.electronAPI.readConfig()
    isFirstRun.value = !cfg.setupComplete
    if (cfg.serverPath) serverDir.value = cfg.serverPath
    if (cfg.javaPath) javaPath.value = cfg.javaPath
  } catch(e) {}

  // Only show if paths are missing or setup not complete
  if (serverDir.value && javaPath.value && !isFirstRun.value) return

  visible.value = true

  // Auto-detect Java
  if (!javaPath.value) {
    const appData = window.electronAPI.env?.APPDATA
    const mcDir = (appData || '') + '\\.minecraft\\runtime\\java-runtime-epsilon\\bin\\java.exe'
    try {
      await window.electronAPI.readDir(mcDir.substring(0, mcDir.lastIndexOf('\\')))
      javaPath.value = mcDir
      javaDetected.value = 'Minecraft Java'
    } catch(e) {
      for (const base of ['C:\\Program Files\\Java', 'C:\\Program Files\\Eclipse Adoptium']) {
        try {
          const items = await window.electronAPI.readDir(base)
          const jDir = items.find((i: string) => i.startsWith('jre-') || i.startsWith('jdk-'))
          if (jDir) {
            javaPath.value = base + '\\' + jDir + '\\bin\\java.exe'
            javaDetected.value = '系统 Java'
            break
          }
        } catch(e2) {}
      }
    }
  }

  // Auto-detect server directory
  if (!serverDir.value) {
    try {
      const files = await window.electronAPI.readDir('D:\\Games\\Minecraft\\MCServer')
      if (files.some((f: string) => f.includes('server.jar') || f.includes('fabric-server'))) {
        serverDir.value = 'D:\\Games\\Minecraft\\MCServer'
      }
    } catch(e) {}
  }

  // Save auto-detected paths (merge with existing config)
  if (serverDir.value || javaPath.value) {
    try {
      const cfg = await window.electronAPI.readConfig() || {}
      if (serverDir.value) cfg.serverPath = serverDir.value
      if (javaPath.value) cfg.javaPath = javaPath.value
      await window.electronAPI.writeConfig(cfg)
    } catch(e) {}
  }
})

async function browseServer() {
  const dir = await window.electronAPI.openDirectoryDialog()
  if (dir) serverDir.value = dir
}

async function browseJava() {
  const path = await window.electronAPI.openFileDialog([{ name: 'Java', extensions: ['exe'] }])
  if (path) javaPath.value = path
}

async function confirm() {
  if (!serverDir.value || !javaPath.value) return
  try {
    const cfg = await window.electronAPI.readConfig() || {}
    cfg.serverPath = serverDir.value
    cfg.javaPath = javaPath.value
    cfg.setupComplete = true
    await window.electronAPI.writeConfig(cfg)
  } catch(e) {}
  visible.value = false
}
</script>

<style scoped>
.dialog-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.5);
  display: flex; align-items: center; justify-content: center;
  z-index: 10000;
}

.dialog-card {
  background: var(--md-sys-color-surface-container-high);
  border-radius: var(--md-sys-shape-corner-large);
  padding: 32px;
  width: 500px;
  max-width: 90vw;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  box-shadow: var(--md-elevation-level5);
}

.setup-icon .material-symbols-outlined { font-size: 48px; color: var(--md-sys-color-primary); }
.setup-title { font-size: 20px; font-weight: 700; }
.setup-desc { font-size: 14px; color: var(--md-sys-color-outline); text-align: center; }

.setup-field-row { width: 100%; display: flex; gap: 8px; align-items: center; }
.setup-input { flex: 1; }

.setup-hint { width: 100%; font-size: 11px; color: var(--md-sys-color-outline); margin: 0; }
.setup-hint.warn { color: var(--md-sys-color-error); }

.setup-actions { margin-top: 8px; }
</style>