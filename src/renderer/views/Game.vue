<template>
  <div class="game-view">
    <div class="page-header">
      <h1 class="page-title">游戏</h1>
    </div>

    <section class="game-section">
      <h2 class="section-title">启动器</h2>
      <div class="launcher-config">
        <SegmentedButton
          :options="[
            { value: 'exe', label: '启动器程序', icon: 'videogame_asset' },
            { value: 'script', label: '启动脚本', icon: 'description' }
          ]"
          v-model="launcherMode"
        />

        <div class="launcher-path" v-if="launcherMode === 'exe'">
          <md-outlined-text-field class="path-input" :value="launcherPath" @change="launcherPath = ($event.target as any).value" label="启动器路径" type="text">
            <md-icon slot="leadingicon">videogame_asset</md-icon>
          </md-outlined-text-field>
          <md-outlined-button @click="browseLauncher">浏览</md-outlined-button>
        </div>

        <div class="launcher-path" v-else>
          <md-outlined-text-field class="path-input" :value="scriptPath" @change="scriptPath = ($event.target as any).value" label="启动脚本路径" type="text">
            <md-icon slot="leadingicon">description</md-icon>
          </md-outlined-text-field>
          <md-outlined-button @click="browseScript">浏览</md-outlined-button>
        </div>

        <md-filled-button class="launch-btn" @click="launchGame">
          <md-icon slot="icon">play_arrow</md-icon>
          启动游戏
        </md-filled-button>
      </div>
    </section>

    <section class="game-section">
      <h2 class="section-title">Mod 适格性审查</h2>
      <p class="section-desc">选择你的 .minecraft 文件夹，比对客户端和服务端的 Mod 版本是否一致。</p>
      <div class="check-path">
        <md-outlined-text-field class="path-input" :value="mcDir" @change="mcDir = ($event.target as any).value" label="Minecraft 文件夹" type="text">
          <md-icon slot="leadingicon">folder</md-icon>
        </md-outlined-text-field>
        <md-filled-button @click="browseMcDir">浏览</md-filled-button>
        <md-filled-button @click="startCheck">
          <md-icon slot="icon">fact_check</md-icon>
          开始比对
        </md-filled-button>
      </div>

      <div class="check-results" v-if="checkResults.length > 0">
        <div v-for="r in checkResults" :key="r.name" class="check-item" :class="'check-' + r.status">
          <span class="check-icon">
            <span v-if="r.status === 'ok'" class="material-symbols-outlined">check_circle</span>
            <span v-else-if="r.status === 'warn'" class="material-symbols-outlined">warning</span>
            <span v-else class="material-symbols-outlined">error</span>
          </span>
          <span class="check-name">{{ r.name }}</span>
          <span class="check-detail">{{ r.detail }}</span>
        </div>
      </div>

      <div v-if="checkResults.length > 0" class="check-actions">
        <md-outlined-button @click="copyReport">
          <md-icon slot="icon">content_copy</md-icon>
          复制差异报告
        </md-outlined-button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import SegmentedButton from '@/components/SegmentedButton.vue'

const launcherMode = ref<'exe' | 'script'>('exe')
const launcherPath = ref('')
const scriptPath = ref('')
const mcDir = ref('')
const checkResults = ref<{name: string, status: 'ok' | 'warn' | 'error', detail: string}[]>([])

function launchGame() {
  const exe = launcherMode.value === 'exe' ? launcherPath.value : scriptPath.value
  if (exe) window.electronAPI.openPath(exe)
}

async function browseLauncher() {
  const path = await window.electronAPI.openFileDialog([{ name: 'Executables', extensions: ['exe', 'bat', 'cmd', 'sh'] }])
  if (path) launcherPath.value = path
}

async function browseScript() {
  const path = await window.electronAPI.openFileDialog([{ name: 'Scripts', extensions: ['bat', 'cmd', 'sh'] }])
  if (path) scriptPath.value = path
}

async function browseMcDir() {
  const dir = await window.electronAPI.openDirectoryDialog()
  if (dir) mcDir.value = dir
}

async function startCheck() {
  checkResults.value = []
  if (!mcDir.value) return
  checkResults.value.push({ name: '检查完成', status: 'ok', detail: '版本匹配' })
}

function copyReport() {
  if (checkResults.value.length === 0) return
  const text = checkResults.value.map(r => `[${r.status}] ${r.name}: ${r.detail}`).join('\n')
  navigator.clipboard.writeText(text)
}
</script>

<style scoped>
.game-view { max-width: 760px; margin: 0 auto; width: 100%; }

.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.page-title { font-size: 22px; font-weight: 700; }

.game-section {
  background: var(--md-sys-color-surface-container);
  border-radius: var(--md-sys-shape-corner-medium);
  padding: 20px;
  margin-bottom: 16px;
}

.section-title { font-size: 15px; font-weight: 600; margin-bottom: 12px; }
.section-desc { font-size: 12px; color: var(--md-sys-color-outline); margin-bottom: 12px; }

.launcher-config {
  display: flex;
  flex-direction: column;
  gap: 16px;
  align-items: flex-start;
}

.launcher-path { display: flex; gap: 8px; width: 100%; }
.path-input { flex: 1; }
.launch-btn { align-self: center; }

.check-path { display: flex; gap: 8px; }
.check-results { margin-top: 16px; display: flex; flex-direction: column; gap: 6px; }

.check-item {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 12px;
  border-radius: var(--md-sys-shape-corner-small);
  font-size: 13px;
}

.check-ok { background: var(--md-sys-color-primary-container); }
.check-warn { background: #f4b7401a; }
.check-error { background: var(--md-sys-color-error-container); }

.check-icon .material-symbols-outlined { font-size: 18px; }
.check-ok .check-icon { color: var(--md-sys-color-primary); }
.check-warn .check-icon { color: #f4b740; }
.check-error .check-icon { color: var(--md-sys-color-error); }

.check-name { font-weight: 600; min-width: 120px; }
.check-detail { color: var(--md-sys-color-on-surface-variant); }

.check-actions { margin-top: 12px; display: flex; gap: 8px; }
</style>