<template>
  <div class="dashboard" :class="[dashAnim, { 'dash-open': showBottom, 'row-hidden': !showRow }]">
    <div class="dashboard-top dash-fade-in" :class="{
      'has-wallpaper': appStore.hasCustomWallpaper && appStore.wallpaperMode === 'image',
      'wallpaper-dark': appStore.wallpaperIsDark,
      'wallpaper-light': appStore.hasCustomWallpaper && appStore.wallpaperMode === 'image' && !appStore.wallpaperIsDark
    }">
      <div v-if="appStore.hasCustomWallpaper && appStore.wallpaperMode === 'image'" class="wallpaper-layer" :style="{ backgroundImage: `url('${appStore.wallpaperUrl}')` }"></div>
      <div class="top-content">
        <div class="title-section">
          <h1 class="page-title">{{ appStore.title }}</h1>
          <p class="page-subtitle">{{ appStore.subtitle }}</p>
        </div>
        <div class="server-control">
          <button
            class="power-btn"
            :class="{ running: serverStore.status === 'running', loading: serverStore.status === 'starting' }"
            @click="toggleServer"
          >
            <span v-if="serverStore.status === 'starting'" class="material-symbols-outlined spinning">progress_activity</span>
            <span v-else class="material-symbols-outlined">{{ serverStore.status === 'running' ? 'power_settings_new' : 'play_arrow' }}</span>
          </button>
          <span class="status-text" :class="'status-' + serverStore.status">
            {{ statusLabel }}
          </span>
          <span v-if="serverStore.status === 'running' && frpAddress" class="frp-address">
            {{ frpAddress }}
          </span>
        </div>
      </div>
    </div>

    <div class="dashboard-bottom">
      <div class="stats-grid anim-stagger">
        <div class="stat-card">
          <span class="material-symbols-outlined stat-icon">schedule</span>
          <div class="stat-body">
            <span class="stat-value">{{ formatUptime }}</span>
            <span class="stat-label">运行时长</span>
          </div>
        </div>

        <div class="stat-card">
          <span class="material-symbols-outlined stat-icon">speed</span>
          <div class="stat-body">
            <span class="stat-value tps" :class="{ good: serverStore.tps >= 19, medium: serverStore.tps >= 15 && serverStore.tps < 19, bad: serverStore.tps < 15 }">
              {{ serverStore.tps.toFixed(1) }}
            </span>
            <span class="stat-label">TPS</span>
          </div>
        </div>

        <div class="stat-card">
          <span class="material-symbols-outlined stat-icon">memory</span>
          <div class="stat-body">
            <span class="stat-value small">{{ (serverStore.memoryUsage.used / 1024 / 1024 / 1024).toFixed(1) }} / {{ (serverStore.memoryUsage.max / 1024 / 1024 / 1024).toFixed(1) }} GB</span>
            <div class="stat-bar"><div class="stat-bar-fill" :style="{ width: memPercent + '%' }"></div></div>
            <span class="stat-label">内存</span>
          </div>
        </div>

        <div class="stat-card">
          <span class="material-symbols-outlined stat-icon">people</span>
          <div class="stat-body">
            <span class="stat-value">{{ serverStore.onlinePlayers.length }} / {{ serverStore.maxPlayers }}</span>
            <span class="stat-label">在线玩家</span>
          </div>
        </div>
      </div>

      <transition name="dash-row">
      <div v-if="showRow" class="bottom-row">
        <div class="quick-actions">
          <div class="section-header">
            <span class="section-label">快捷操作</span>
            <button class="icon-btn" @click="editDialog?.show(customActions, (items) => saveQuickActions(items))" title="编辑">
              <span class="material-symbols-outlined">edit</span>
            </button>
          </div>
          <div class="actions-row" ref="actionsRow">
            <button class="action-chip" @click="openDir('mods')">
              <span class="material-symbols-outlined">extension</span>
              Mod 目录
            </button>
            <button class="action-chip" @click="openDir('server')">
              <span class="material-symbols-outlined">folder_open</span>
              服务器目录
            </button>
            <button class="action-chip" @click="openDir('world')">
              <span class="material-symbols-outlined">public</span>
              世界存档
            </button>
            <button
              v-for="a in customActions"
              :key="a.id"
              class="action-chip"
              @click="runAction(a)"
            >
              <span class="material-symbols-outlined">{{ a.icon }}</span>
              {{ a.name }}
            </button>
            <button class="action-chip add-btn" @click="addDialog?.show()" title="添加自定义操作">
              <span class="material-symbols-outlined">add</span>
            </button>
          </div>
        </div>

        <div class="recent-logs">
          <div class="section-header">
            <span class="section-label">最近日志</span>
            <router-link to="/console" class="view-more">
              查看更多
              <span class="material-symbols-outlined">arrow_forward</span>
            </router-link>
          </div>
          <div class="log-list">
            <div v-for="(log, i) in recentLogs" :key="i" class="log-line" :class="'log-' + log.level.toLowerCase()">
              <span class="log-time">{{ log.timestamp }}</span>
              <span class="log-level">[{{ log.level }}]</span>
              <span class="log-msg">{{ log.message }}</span>
            </div>
            <div v-if="recentLogs.length === 0" class="log-empty">暂无日志</div>
          </div>
        </div>
      </div>
    </transition>
    </div>
<AddActionDialog ref="addDialog" @add="onAddAction" />
<EditActionsDialog ref="editDialog" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'
import { useServerStore } from '@/stores/server'
import { useAnimationStore } from '@/stores/animation'
import AddActionDialog from '@/components/AddActionDialog.vue'
import EditActionsDialog from '@/components/EditActionsDialog.vue'

interface QuickAction {
  id: string; name: string; icon: string; type: string; path?: string; section?: string; page?: string
}

const appStore = useAppStore()
const serverStore = useServerStore()
const animStore = useAnimationStore()
const router = useRouter()
const dashAnim = computed(() => animStore.enabled ? 'dash-running' : '')
const addDialog = ref<InstanceType<typeof AddActionDialog> | null>(null)
const editDialog = ref<InstanceType<typeof EditActionsDialog> | null>(null)
const customActions = ref<QuickAction[]>([])
const showBottom = ref(!animStore.enabled)
const showRow = ref(window.innerHeight >= 680)

// Load wallpaper + analyze brightness + start stats polling on mount
let statsTimer: any = null

onMounted(async () => {
  if (appStore.wallpaperValue) {
    const dataUrl = await window.electronAPI.readWallpaper(appStore.wallpaperValue)
    if (dataUrl) appStore.wallpaperDataUrl = dataUrl
    try {
      const result = await window.electronAPI.analyzeWallpaper(appStore.wallpaperValue)
      if (result) appStore.wallpaperBrightness = result.brightness
    } catch(e) {}
  }

  // Read server config for max players, shortcuts, and custom actions
  try {
    const cfg = await window.electronAPI.readConfig()
    if (cfg.serverPath) serverDir.value = cfg.serverPath
    if (cfg.maxMemory) serverStore.memoryUsage.max = cfg.maxMemory * 1024 * 1024 * 1024
    const props = await window.electronAPI.readServerProperties(serverDir.value + '\\server.properties')
    if (props['max-players']) serverStore.maxPlayers = parseInt(props['max-players'])
  } catch(e) {}
  await loadQuickActions()

  // Poll for stats every 5 seconds when server is running
  statsTimer = setInterval(async () => {
    if (serverStore.status === 'running') {
      await window.electronAPI.sendCommand('tps')
      const mem = await window.electronAPI.getServerMemory()
      if (mem > 0) serverStore.memoryUsage.used = mem
    }
  }, 5000)

  // Animate bottom section in after mount
  if (animStore.enabled) {
    setTimeout(() => { showBottom.value = true }, 300)
  } else {
    showBottom.value = true
  }

  // Check window size on mount and resize
  window.addEventListener('resize', checkWindowSize)
  setTimeout(checkWindowSize, 300)
})

onUnmounted(() => {
  if (statsTimer) { clearInterval(statsTimer); statsTimer = null }
  window.removeEventListener('resize', checkWindowSize)
})

const frpAddress = ref('')
const serverDir = ref('D:\\Games\\Minecraft\\MCServer')
const actionsRow = ref<HTMLElement | null>(null)

// Hide quick actions + logs on small windows
function checkWindowSize() {
  if (!animStore.enabled) return
  showRow.value = window.innerHeight >= 680
}

const statusLabel = computed(() => {
  switch (serverStore.status) {
    case 'running': return '运行中'
    case 'starting': return '启动中...'
    default: return '已停止'
  }
})

const formatUptime = computed(() => {
  const s = serverStore.uptime
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return `${h}h ${m}m ${sec}s`
})

const memPercent = computed(() => {
  if (serverStore.memoryUsage.max === 0) return 0
  return (serverStore.memoryUsage.used / serverStore.memoryUsage.max) * 100
})

const recentLogs = computed(() => serverStore.logs.slice(-3).reverse())

async function toggleServer() {
  if (serverStore.status === 'running' || serverStore.status === 'starting') {
    await window.electronAPI.stopServer()
    serverStore.setServerStatus('stopped')
    serverStore.uptime = 0
    return
  }

  // Read config for paths
  let serverDir = ''
  let javaPath = ''
  let jvmArgs = ''
  try {
    const cfg = await window.electronAPI.readConfig()
    serverDir = cfg.serverPath || ''
    javaPath = cfg.javaPath || ''
    // 设置页里的内存滑块要真正传给 JVM，否则一直跑默认堆大小
    const memArgs: string[] = []
    if (cfg.initMemory) memArgs.push(`-Xms${cfg.initMemory}G`)
    if (cfg.maxMemory) memArgs.push(`-Xmx${cfg.maxMemory}G`)
    jvmArgs = [...memArgs, cfg.jvmArgs || ''].filter(Boolean).join(' ')
    if (!javaPath) {
      const options = [
        (window.electronAPI.env?.APPDATA || '') + '\\.minecraft\\runtime\\java-runtime-epsilon\\bin\\java.exe',
        'C:\\Users\\' + (window.electronAPI.env?.USERNAME || '') + '\\AppData\\Roaming\\.minecraft\\runtime\\java-runtime-epsilon\\bin\\java.exe',
      ]
      for (const mcDir of options) {
        try {
          const dir = mcDir.substring(0, mcDir.lastIndexOf('\\'))
          await window.electronAPI.readDir(dir)
          javaPath = mcDir
          break
        } catch(e) {}
      }
    }
  } catch(e) {}

  if (!serverDir || !javaPath) return
  serverStore.setServerStatus('starting')
  await window.electronAPI.startServer(javaPath, serverDir, jvmArgs)
}

function openDir(type: string) {
  const base = serverDir.value || 'D:\\Games\\Minecraft\\MCServer'
  const paths: Record<string, string> = {
    mods: base + '\\mods',
    server: base,
    world: base + '\\world'
  }
  const p = paths[type]
  if (p) window.electronAPI.openPath(p)
}

async function onAddAction(action: { name: string; type: string; path?: string; section?: string; icon: string }) {
  const id = 'qa_' + Date.now()
  customActions.value.push({ id, ...action })
  await saveQuickActions()
}

async function runAction(a: QuickAction) {
  if (a.type === 'path' && a.path) {
    window.electronAPI.openPath(a.path)
  } else if (a.type === 'section' && a.section) {
    const page = a.page || 'dashboard'
    router.push({ path: '/' + page, query: a.section?.startsWith('section-') ? { section: a.section } : undefined })
  }
}

async function saveQuickActions(items?: QuickAction[]) {
  try {
    if (items) customActions.value = items
    const data = JSON.stringify(customActions.value, null, 2)
    const basePath = await window.electronAPI.getDataPath()
    await window.electronAPI.writeFile(basePath + '\\quick-actions.json', data)
  } catch(e) {}
}

async function loadQuickActions() {
  try {
    const basePath = await window.electronAPI.getDataPath()
    const data = await window.electronAPI.readFile(basePath + '\\quick-actions.json')
    customActions.value = JSON.parse(data)
  } catch(e) {}
}


</script>

<style scoped>
.dashboard {
  height: 100%;
  display: grid;
  grid-template-rows: 1fr 0fr;
  transition: grid-template-rows calc(1.2s * var(--anim-modifier, 1)) var(--anim-ease-out);
  background: var(--md-sys-color-surface-container-low);
  overflow: hidden;
}

.dashboard.dash-open {
  grid-template-rows: 60fr 40fr;
}

.dashboard.dash-open.row-hidden {
  grid-template-rows: 1fr auto;
}

.dashboard-top {
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  background-size: cover;
  background-position: center;
  background: linear-gradient(135deg, var(--md-sys-color-primary-container), var(--md-sys-color-secondary-container));
  border-radius: var(--md-sys-shape-corner-large);
  overflow: hidden;
  transition: background 0.3s;
}

.wallpaper-layer {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  z-index: 0;
}

.top-content {
  position: relative;
  z-index: 2;
  transition: text-shadow 0.3s;
}

/* Dark wallpaper → light text */
.dashboard-top.wallpaper-dark .page-title,
.dashboard-top.wallpaper-dark .page-subtitle,
.dashboard-top.wallpaper-dark .status-text {
  color: #e2e3dd !important;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.55);
  mix-blend-mode: overlay;
}

.dashboard-top.wallpaper-dark .power-btn {
  border-color: rgba(255, 255, 255, 0.7);
  color: #e2e3dd;
  background: rgba(0, 0, 0, 0.2);
  backdrop-filter: blur(4px);
}

/* Light wallpaper → dark text */
.dashboard-top.wallpaper-light .page-title,
.dashboard-top.wallpaper-light .page-subtitle,
.dashboard-top.wallpaper-light .status-text {
  color: #1a1c1a !important;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.55);
  mix-blend-mode: overlay;
}

.dashboard-top.wallpaper-light .power-btn {
  border-color: rgba(0, 0, 0, 0.5);
  color: #1a1c1a;
  background: rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(4px);
}

/* Default gradient mode colors */
.page-title {
  font-size: 32px;
  font-weight: 700;
  color: var(--md-sys-color-on-primary-container);
}

.page-subtitle {
  font-size: 14px;
  color: var(--md-sys-color-on-primary-container);
  opacity: 0.85;
}

.top-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  text-align: center;
}

.title-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.page-title {
  font-size: 32px;
  font-weight: 700;
  color: var(--md-sys-color-on-primary-container);
}

.page-subtitle {
  font-size: 14px;
  color: var(--md-sys-color-on-primary-container);
  opacity: 0.8;
}

.server-control {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.power-btn {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  border: 3px solid var(--md-sys-color-on-primary-container);
  background: var(--md-sys-color-primary-container);
  color: var(--md-sys-color-on-primary-container);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.power-btn:hover {
  transform: scale(1.05);
  box-shadow: 0 0 20px rgba(0,0,0,0.15);
}

.power-btn.running {
  background: var(--md-sys-color-error-container);
  border-color: var(--md-sys-color-error);
  color: var(--md-sys-color-on-error-container);
}

.power-btn .material-symbols-outlined {
  font-size: 36px;
}

.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.status-text {
  font-size: 14px;
  font-weight: 600;
}

.status-running { color: var(--md-sys-color-primary); }
.status-starting { color: #f4b740; }
.status-stopped { color: var(--md-sys-color-outline); }

.frp-address {
  font-size: 12px;
  color: var(--md-sys-color-on-primary-container);
  opacity: 0.7;
  font-family: var(--font-mono);
}

.dashboard-bottom {
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: hidden;
  padding: 16px 0;
  border-top: 1px solid var(--md-sys-color-outline-variant);
  opacity: 0;
  transition: opacity calc(0.8s * var(--anim-modifier, 1)) var(--anim-ease-out);
}

.dashboard.dash-open .dashboard-bottom {
  opacity: 1;
  overflow-y: auto;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

.stat-card {
  padding: 16px;
  border-radius: var(--md-sys-shape-corner-medium);
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--md-sys-color-surface-container);
  border: 1px solid var(--md-sys-color-outline-variant);
}

.stat-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.stat-icon {
  font-size: 24px;
  color: var(--md-sys-color-primary);
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--md-sys-color-primary-container);
  border-radius: var(--md-sys-shape-corner-medium);
}

.stat-label {
  font-size: 12px;
  color: var(--md-sys-color-outline);
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: var(--md-sys-color-on-surface);
}

.stat-value.small {
  font-size: 13px;
  font-weight: 500;
}

.stat-value.tps.good { color: var(--md-sys-color-primary); }
.stat-value.tps.medium { color: #f4b740; }
.stat-value.tps.bad { color: var(--md-sys-color-error); }

.stat-bar {
  height: 6px;
  background: var(--md-sys-color-surface-container-highest);
  border-radius: var(--md-sys-shape-corner-full);
  overflow: hidden;
}

.stat-bar-fill {
  height: 100%;
  background: var(--md-sys-color-primary);
  border-radius: var(--md-sys-shape-corner-full);
  transition: width 0.3s;
}

.quick-actions {
  padding: 16px;
  border-radius: var(--md-sys-shape-corner-medium);
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
  background: var(--md-sys-color-surface-container);
  border: 1px solid var(--md-sys-color-outline-variant);
}

.bottom-row {
  display: flex;
  gap: 12px;
  flex: 1;
  min-height: 0;
}

.section-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--md-sys-color-on-surface);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.actions-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  overflow: hidden;
}


.action-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: var(--md-sys-shape-corner-full);
  background: transparent;
  color: var(--md-sys-color-on-surface);
  cursor: pointer;
  font-family: var(--font-ui);
  font-size: 13px;
  transition: background 0.12s;
  white-space: nowrap;
  flex-shrink: 1;
  min-width: 0;
}

.action-chip:hover {
  background: var(--md-sys-color-surface-container-high);
}

.action-chip .material-symbols-outlined {
  font-size: 16px;
}

.action-chip.add-btn {
  border-style: dashed;
  opacity: 0.6;
  transition: opacity 0.15s;
}

.action-chip.add-btn:hover {
  opacity: 1;
}

.icon-btn {
  width: 32px; height: 32px; border: none; border-radius: var(--md-sys-shape-corner-small);
  background: transparent; color: var(--md-sys-color-outline); cursor: pointer;
  display: flex; align-items: center; justify-content: center;
}
.icon-btn:hover { background: var(--md-sys-color-surface-container-highest); color: var(--md-sys-color-on-surface); }
.icon-btn .material-symbols-outlined { font-size: 18px; }

.recent-logs {
  padding: 16px;
  border-radius: var(--md-sys-shape-corner-medium);
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  min-width: 0;
  background: var(--md-sys-color-surface-container);
  border: 1px solid var(--md-sys-color-outline-variant);
}

.view-more {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--md-sys-color-primary);
  text-decoration: none;
  font-size: 12px;
}

.view-more .material-symbols-outlined {
  font-size: 14px;
}

.log-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}

.log-line {
  display: flex;
  gap: 8px;
  font-family: var(--font-mono);
  font-size: 11px;
  padding: 2px 4px;
  border-radius: 2px;
}

.log-time { color: var(--md-sys-color-outline); }
.log-level { font-weight: 600; }
.log-info .log-level { color: var(--md-sys-color-primary); }
.log-warn .log-level { color: #f4b740; }
.log-error .log-level { color: var(--md-sys-color-error); }
.log-msg { color: var(--md-sys-color-on-surface); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.log-empty {
  font-size: 12px;
  color: var(--md-sys-color-outline);
  text-align: center;
  padding: 16px;
}
</style>