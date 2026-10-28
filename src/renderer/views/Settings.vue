<template>
  <div class="settings-view">
    <div class="page-header">
      <h1 class="page-title">设置</h1>
      <span class="auto-save-hint">自动保存</span>
    </div>

    <section id="section-appearance" class="settings-section">
      <h2 class="section-title">外观</h2>
      <div class="settings-grid anim-stagger">
        <div class="setting-item">
          <span class="setting-label">主题</span>
          <SegmentedButton
            :options="[
              { value: 'light', label: '浅色', icon: 'light_mode' },
              { value: 'dark', label: '深色', icon: 'dark_mode' }
            ]"
            v-model="theme"
          />
        </div>
        <div class="setting-item">
          <md-outlined-text-field v-model="title" label="服务器标题" @change="onFieldChange" type="text"></md-outlined-text-field>
        </div>
        <div class="setting-item">
          <span class="setting-label">仪表盘壁纸</span>
          <SegmentedButton
            :options="[
              { value: 'image', label: '图片', icon: 'image' },
              { value: 'gradient', label: '渐变', icon: 'gradient' }
            ]"
            v-model="wpMode"
          />
          <div v-if="wpMode === 'image'" class="wallpaper-picker">
            <div class="wallpaper-preview" :style="previewStyle"></div>
            <div class="wallpaper-actions">
              <md-outlined-button @click="selectWallpaper">选择图片</md-outlined-button>
            </div>
          </div>
          <div v-else class="wallpaper-hint">
            自动跟随主题色渐变
            <span class="color-dot" :style="{ background: primaryColor }"></span>
          </div>
        </div>
        <div class="setting-item">
          <span class="setting-label">主题色</span>
          <div class="color-main-row">
            <div class="color-presets">
              <button
                v-for="c in presetColors"
                :key="c"
                class="color-swatch"
                :class="{ active: primaryColor === c }"
                :style="{ background: c }"
                @click="primaryColor = c"
              ></button>
              <div class="color-custom-wrap">
                <input type="color" :value="primaryColor" @input="onColorInput" class="color-input-mini" />
              </div>
            </div>
          </div>
        </div>
        <div class="setting-item">
          <span class="setting-label">动画效果</span>
          <md-switch :selected="animEnabled" @change="toggleAnim"></md-switch>
        </div>
      </div>
    </section>

    <section id="section-performance" class="settings-section">
      <h2 class="section-title">性能</h2>
      <div class="settings-grid anim-stagger">
        <div class="setting-item">
          <span class="setting-label">最大内存 (Xmx)</span>
          <div class="slider-wrap">
            <input type="range" min="1" max="32" v-model.number="maxMemory" @change="onFieldChange" class="md-slider" />
            <span class="slider-value">{{ maxMemory }} GB</span>
          </div>
        </div>
        <div class="setting-item">
          <span class="setting-label">初始内存 (Xms)</span>
          <div class="slider-wrap">
            <input type="range" min="1" max="32" v-model.number="initMemory" @change="onFieldChange" class="md-slider" />
            <span class="slider-value">{{ initMemory }} GB</span>
          </div>
        </div>
        <div class="setting-item">
          <md-outlined-text-field v-model="jvmArgs" label="JVM 附加参数" @change="onFieldChange" type="text"></md-outlined-text-field>
        </div>

        <div class="setting-item" v-if="autoRestart">
          <md-outlined-text-field v-model="restartInterval" label="重启间隔" @change="onFieldChange" type="number"></md-outlined-text-field>
        </div>
      </div>
    </section>

    <section id="section-paths" class="settings-section">
      <h2 class="section-title">服务器路径</h2>
      <div class="settings-grid anim-stagger">
        <div class="setting-item">
          <div class="path-picker">
            <md-outlined-text-field class="path-input" label="服务端目录" :value="serverPath" type="text" readonly></md-outlined-text-field>
            <md-outlined-button @click="browsePath('server')">浏览</md-outlined-button>
          </div>
        </div>
        <div class="setting-item">
          <div class="path-picker">
            <md-outlined-text-field class="path-input" label="Java 路径" :value="javaPath" type="text" readonly></md-outlined-text-field>
            <md-outlined-button @click="browsePath('java')">浏览</md-outlined-button>
          </div>
        </div>
      </div>
    </section>

    <section id="section-backup" class="settings-section">
      <h2 class="section-title">自动备份</h2>
      <div class="settings-grid anim-stagger">
        <div class="setting-item">
          <span class="setting-label">启用自动备份</span>
          <md-switch :selected="autoBackup" @change="autoBackup = $event.target.selected"></md-switch>
        </div>
        <div class="setting-item" v-if="autoBackup">
          <span class="setting-label">备份间隔</span>
          <md-outlined-select v-model="backupInterval" label="备份间隔">
            <md-select-option value="1h">每小时</md-select-option>
            <md-select-option value="6h">每 6 小时</md-select-option>
            <md-select-option value="12h">每 12 小时</md-select-option>
            <md-select-option value="24h">每天</md-select-option>
          </md-outlined-select>
        </div>
        <div class="setting-item" v-if="autoBackup">
          <span class="setting-label">保留备份数</span>
          <md-outlined-text-field v-model="backupRetention" label="保留备份数" type="number"></md-outlined-text-field>
        </div>
        <div class="setting-item" v-if="autoBackup">
          <span class="setting-label">备份路径</span>
          <div class="path-picker">
            <md-outlined-text-field class="path-input" :value="backupPath" label="备份路径" type="text" readonly></md-outlined-text-field>
            <md-outlined-button @click="browsePath('backup')">浏览</md-outlined-button>
          </div>
        </div>
      </div>
    </section>

    <section id="section-console" class="settings-section">
      <h2 class="section-title">控制台</h2>
      <div class="settings-grid anim-stagger">
        <div class="setting-item">
          <span class="setting-label">默认模式</span>
          <SegmentedButton
            :options="[
              { value: 'bubble', label: '气泡', icon: 'chat' },
              { value: 'code', label: '代码', icon: 'code' }
            ]"
            v-model="consoleDefault"
          />
        </div>
        <div class="setting-item">
          <md-outlined-text-field v-model="maxLogLines" label="最大保留行数" type="number"></md-outlined-text-field>
        </div>
      </div>
    </section>

    <section id="section-notifications" class="settings-section">
      <h2 class="section-title">通知</h2>
      <div class="settings-grid anim-stagger">
        <div class="setting-item">
          <md-outlined-text-field v-model="notificationDays" label="通知保留天数" type="number"></md-outlined-text-field>
        </div>
      </div>
    </section>

    <section id="section-about" class="settings-section about-section">
      <h2 class="section-title">关于</h2>
      <div class="about-body">
        <div class="about-brand">
          <span class="about-icon material-symbols-outlined">local_cafe</span>
          <div class="about-title">乌龙味 MC 开服茶</div>
          <div class="about-sub">Wulon's Minecraft Server Starter</div>
        </div>
        <div class="about-meta">
          <div class="about-line"><span class="about-key">代号</span><span>Caddy Wulon 乌龙罐 · 工具箱 Toolkit</span></div>
          <div class="about-line"><span class="about-key">版本</span><span>Beta 26.7.01</span></div>
          <div class="about-line"><span class="about-key">制作</span><span><a href="https://space.bilibili.com/1422859964" target="_blank" class="about-link">隐刻INCO</a></span></div>
          <div class="about-line"><span class="about-key">编程 AI</span><span>Deepseek V4 Pro</span></div>
        </div>
      </div>
    </section>

    <div class="clear-cache-row">
      <button class="clear-cache-btn" @click="clearLocalCache">
        <span class="material-symbols-outlined">delete_sweep</span>
        清除本地缓存
      </button>
    </div>
    <div style="height: 24px"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useAppStore } from '@/stores/app'
import { useAnimationStore } from '@/stores/animation'
import SegmentedButton from '@/components/SegmentedButton.vue'

const appStore = useAppStore()
const animStore = useAnimationStore()
const route = useRoute()

// Local copies — only committed on save
const theme = ref(appStore.theme)
watch(() => appStore.theme, (v) => { theme.value = v })
const title = ref(appStore.title)
const wpMode = ref<string>(appStore.wallpaperMode ?? 'gradient')
const wpValue = ref(appStore.wallpaperValue)
const primaryColor = ref(appStore.primaryColor)

// Load persisted config on mount + auto-detect Java if missing
onMounted(async () => {
  try {
    const cfg = await window.electronAPI.readConfig()
    if (cfg.theme) theme.value = cfg.theme
    if (cfg.title) title.value = cfg.title
    if (cfg.primaryColor) primaryColor.value = cfg.primaryColor
    if (cfg.wallpaperMode) wpMode.value = cfg.wallpaperMode
    if (cfg.serverPath) serverPath.value = cfg.serverPath
    if (cfg.javaPath) javaPath.value = cfg.javaPath
    // Auto-detect Java if not configured
    if (!javaPath.value) {
      const appData = window.electronAPI.env?.APPDATA
      const mcDir = (appData || '') + '\\.minecraft\\runtime\\java-runtime-epsilon\\bin\\java.exe'
      try {
        await window.electronAPI.readDir(mcDir.substring(0, mcDir.lastIndexOf('\\')))
        javaPath.value = mcDir
      } catch(e) {}
    }
    if (cfg.maxMemory) maxMemory.value = cfg.maxMemory
    if (cfg.initMemory) initMemory.value = cfg.initMemory
    if (cfg.jvmArgs) jvmArgs.value = cfg.jvmArgs
    if (cfg.autoRestart !== undefined) autoRestart.value = cfg.autoRestart
    if (cfg.restartInterval) restartInterval.value = cfg.restartInterval
    if (cfg.autoBackup !== undefined) autoBackup.value = cfg.autoBackup
    if (cfg.backupInterval) backupInterval.value = cfg.backupInterval
    if (cfg.backupRetention) backupRetention.value = cfg.backupRetention
    if (cfg.backupPath) backupPath.value = cfg.backupPath
    if (cfg.consoleDefault) consoleDefault.value = cfg.consoleDefault
    if (cfg.maxLogLines) maxLogLines.value = cfg.maxLogLines
    if (cfg.notificationDays) notificationDays.value = cfg.notificationDays
  } catch(e) {}
})

watch(() => route.query.section, (section) => {
  if (section) {
    setTimeout(() => {
      document.getElementById(section as string)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)
  }
})

const presetColors = [
  '#1a6c4a', '#6750a4', '#1565c0', '#c62828',
  '#e65100', '#00838f', '#2e7d32', '#6d4c41',
  '#546e7a', '#283593', '#ad1457', '#00c853'
]

const maxMemory = ref(4)
const initMemory = ref(2)
const jvmArgs = ref('-javaagent:authlib-injector.jar=littleskin.cn')
const autoRestart = ref(false)
const restartInterval = ref(24)
const serverPath = ref('D:\\Games\\Minecraft\\MCServer')
const javaPath = ref('')
const autoBackup = ref(false)
const backupInterval = ref('24h')
const backupRetention = ref(10)
const backupPath = ref('')
const consoleDefault = ref('bubble')
const maxLogLines = ref(1000)
const notificationDays = ref(7)
const animEnabled = ref(animStore.enabled)

function toggleAnim() {
  animEnabled.value = !animEnabled.value
  animStore.setEnabled(animEnabled.value)
  animStore.save()
}

const previewStyle = computed(() => {
  if (!wpValue.value) return {}
  const v = wpValue.value
  if (v.match(/^[A-Za-z]:\\/)) {
    return { backgroundImage: `url('file:///${v.replace(/\\/g, '/')}')` }
  }
  return { backgroundImage: `url('${v}')` }
})

function onColorInput(e: Event) {
  primaryColor.value = (e.target as HTMLInputElement).value
}

async function selectWallpaper() {
  const path = await window.electronAPI.openFileDialog([{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp'] }])
  if (path) {
    try {
      const result = await window.electronAPI.copyWallpaper(path)
      wpValue.value = result.path
      pendingImageDataUrl = result.dataUrl
      pendingBrightness = result.brightness
    } catch(e) {
      wpValue.value = path
    }
    save()
  }
}

let pendingBrightness = 0.5

let pendingImageDataUrl = ''
let saveTimer: ReturnType<typeof setTimeout> | null = null

// Unified save: writes to store + persists to config.json (debounced)
async function save() {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(async () => {
    saveTimer = null

    if (!javaPath.value) {
      const candidates = [
        (window.electronAPI.env?.APPDATA || '') + '\\.minecraft\\runtime\\java-runtime-epsilon\\bin\\java.exe',
        'C:\\Users\\' + (window.electronAPI.env?.USERNAME || '') + '\\AppData\\Roaming\\.minecraft\\runtime\\java-runtime-epsilon\\bin\\java.exe',
      ]
      for (const mcDir of candidates) {
        try {
          const dir = mcDir.substring(0, mcDir.lastIndexOf('\\'))
          await window.electronAPI.readDir(dir)
          javaPath.value = mcDir
          break
        } catch(e) {}
      }
    }
    appStore.theme = theme.value
    appStore.title = title.value
    if (wpValue.value) {
      appStore.setWallpaper(wpValue.value, wpMode.value as any, pendingImageDataUrl || undefined, pendingBrightness)
      pendingImageDataUrl = ''
    } else {
      appStore.clearWallpaper()
    }
    appStore.setPrimaryColor(primaryColor.value)
    try {
      const brightness = pendingBrightness || appStore.wallpaperBrightness
      pendingBrightness = 0.5
      await window.electronAPI.writeConfig({
        theme: theme.value,
        title: title.value,
        serverPath: serverPath.value,
        javaPath: javaPath.value,
        maxMemory: maxMemory.value,
        initMemory: initMemory.value,
        jvmArgs: jvmArgs.value,
        autoRestart: autoRestart.value,
        restartInterval: restartInterval.value,
        autoBackup: autoBackup.value,
        backupInterval: backupInterval.value,
        backupRetention: backupRetention.value,
        backupPath: backupPath.value,
        consoleDefault: consoleDefault.value,
        maxLogLines: maxLogLines.value,
        notificationDays: notificationDays.value,
        wallpaperMode: wpMode.value,
        wallpaperValue: wpValue.value,
        wallpaperBrightness: brightness,
        primaryColor: primaryColor.value,
      })
    } catch(e) {}
  }, 300)
}

// Instant-save watchers for non-text controls
watch(theme, save)
watch(wpMode, save)
watch(primaryColor, save)
watch(autoRestart, save)
watch(backupInterval, save)
watch(consoleDefault, save)

// Handle text-field changes on blur
function onFieldChange() { save() }

async function clearLocalCache() {
  await window.electronAPI.clearCache()
  // Reset all local refs to defaults
  theme.value = 'light'
  title.value = '乌龙味开服茶'
  wpMode.value = 'gradient'
  wpValue.value = ''
  primaryColor.value = '#6d4c41'
  maxMemory.value = 4
  initMemory.value = 2
  jvmArgs.value = '-javaagent:authlib-injector.jar=littleskin.cn'
  autoRestart.value = false
  restartInterval.value = 24
  serverPath.value = 'D:\\Games\\Minecraft\\MCServer'
  javaPath.value = ''
  autoBackup.value = false
  backupInterval.value = '24h'
  backupRetention.value = 10
  backupPath.value = ''
  consoleDefault.value = 'bubble'
  maxLogLines.value = 1000
  notificationDays.value = 7
  // Apply to store
  save()
}

async function browsePath(type: string) {
  const dir = await window.electronAPI.openDirectoryDialog()
  if (!dir) return
  switch(type) {
    case 'server': serverPath.value = dir; break
    case 'java': javaPath.value = dir; break
    case 'backup': backupPath.value = dir; break
  }
}

// Scroll to section from route query
const _route2 = useRoute()
watch(() => _route2.query.section, (section) => {
  if (section) {
    setTimeout(() => {
      document.getElementById(section as string)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 200)
  }
}, { immediate: true })
</script>

<style scoped>
.settings-view { max-width: 760px; margin: 0 auto; width: 100%; }

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}
.page-title { font-size: 22px; font-weight: 700; }

.settings-section {
  background: var(--md-sys-color-surface-container);
  border-radius: var(--md-sys-shape-corner-medium);
  padding: 20px;
  margin-bottom: 16px;
}

.section-title { font-size: 15px; font-weight: 600; margin-bottom: 16px; }

.settings-grid { display: flex; flex-direction: column; gap: 16px; }

.setting-item { display: flex; flex-direction: column; gap: 8px; }
.setting-label { font-size: 13px; color: var(--md-sys-color-on-surface-variant); }

.wallpaper-picker { display: flex; gap: 12px; align-items: center; margin-top: 8px; }

.wallpaper-preview {
  width: 120px; height: 68px;
  background: var(--md-sys-color-surface-container-high);
  border-radius: var(--md-sys-shape-corner-small);
  border: 2px dashed var(--md-sys-color-outline-variant);
  background-size: cover;
  background-position: center;
}

.wallpaper-actions { display: flex; flex-direction: column; gap: 4px; }

.wallpaper-hint {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
  font-size: 13px;
  color: var(--md-sys-color-outline);
}

.color-dot {
  width: 20px; height: 20px;
  border-radius: var(--md-sys-shape-corner-full);
  border: 2px solid var(--md-sys-color-outline-variant);
}

.color-swatch {
  width: 32px; height: 32px;
  border-radius: var(--md-sys-shape-corner-full);
  border: 2px solid transparent;
  cursor: pointer;
  transition: transform 0.15s, border-color 0.15s;
  padding: 0; outline: none;
}

.color-swatch:hover { transform: scale(1.2); }

.color-swatch.active {
  border-color: var(--md-sys-color-primary);
  box-shadow: 0 0 0 2px var(--md-sys-color-surface), 0 0 0 4px var(--md-sys-color-primary);
}

.color-custom-wrap {
  width: 32px; height: 32px;
  border-radius: var(--md-sys-shape-corner-full);
  overflow: hidden;
  border: 2px dashed var(--md-sys-color-outline-variant);
  position: relative;
}

.color-input-mini {
  width: 100%; height: 100%;
  border: none; cursor: pointer; padding: 0;
  position: absolute; inset: 0;
}

.color-input-mini::-webkit-color-swatch-wrapper { padding: 0; }
.color-input-mini::-webkit-color-swatch { border: none; }

.color-main-row { display: flex; align-items: center; }

.color-presets {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  align-items: center;
}

.slider-wrap { display: flex; align-items: center; gap: 12px; }

.md-slider {
  -webkit-appearance: none; appearance: none;
  height: 4px;
  background: var(--md-sys-color-surface-container-highest);
  border-radius: 2px; outline: none; flex: 1;
}

.md-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 16px; height: 16px;
  border-radius: 50%;
  background: var(--md-sys-color-primary);
  cursor: pointer;
  box-shadow: var(--md-elevation-level1);
}

.slider-value { font-size: 13px; font-weight: 600; min-width: 50px; }

.path-picker { display: flex; gap: 8px; }
.path-input { flex: 1; }

.auto-save-hint {
  font-size: 12px;
  color: var(--md-sys-color-outline);
  display: flex;
  align-items: center;
  gap: 6px;
}

.auto-save-hint::before {
  content: '';
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--md-sys-color-primary);
}

.clear-cache-row {
  display: flex;
  justify-content: center;
  border-top: 1px solid var(--md-sys-color-outline-variant);
  padding-top: 16px;
}

.clear-cache-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 20px;
  border: 1px solid var(--md-sys-color-error);
  border-radius: var(--md-sys-shape-corner-full);
  background: transparent;
  color: var(--md-sys-color-error);
  cursor: pointer;
  font-family: var(--font-ui);
  font-size: 13px;
  transition: background 0.15s;
}

.clear-cache-btn:hover {
  background: var(--md-sys-color-error-container);
}

.clear-cache-btn .material-symbols-outlined {
  font-size: 16px;
}

.about-section .about-body {
  display: flex;
  flex-direction: column;
  gap: 20px;
  align-items: center;
  padding: 24px 0 12px;
}

.about-brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.about-icon {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--md-sys-color-primary-container);
  color: var(--md-sys-color-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 4px;
}

.about-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--md-sys-color-on-surface);
}

.about-sub {
  font-size: 13px;
  color: var(--md-sys-color-outline);
}

.about-meta {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  max-width: 360px;
}

.about-line {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  font-size: 13px;
  color: var(--md-sys-color-on-surface);
}

.about-key {
  color: var(--md-sys-color-outline);
  flex-shrink: 0;
}

.about-link {
  color: var(--md-sys-color-primary);
  text-decoration: none;
}

.about-link:hover {
  text-decoration: underline;
}
</style>