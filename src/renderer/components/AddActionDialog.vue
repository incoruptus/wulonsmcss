<template>
  <transition name="dialog">
    <div class="dialog-overlay" v-if="visible" @click.self="close">
      <div class="dialog-card" @click.stop>
        <h2 class="dialog-title">添加快捷操作</h2>

        <div class="dialog-body">
          <div class="form-field">
            <md-outlined-text-field v-model="name" label="按钮名称" type="text"></md-outlined-text-field>
          </div>
          <div class="form-field">
            <md-outlined-select v-model="actionType" label="操作类型">
              <md-select-option value="path">打开路径</md-select-option>
              <md-select-option value="section">跳转板块</md-select-option>
            </md-outlined-select>
          </div>

          <div class="form-field" v-if="actionType === 'path'">
            <div class="path-row">
              <md-outlined-text-field class="flex-1" :value="targetPath" label="目标路径" type="text" readonly></md-outlined-text-field>
              <md-outlined-button @click="browsePath">浏览</md-outlined-button>
            </div>
          </div>

          <div class="form-field" v-if="actionType === 'section'">
            <md-outlined-select v-model="sectionPage" label="目标页面">
              <md-select-option v-for="p in sections" :key="p.page" :value="p.page">{{ p.pageLabel }}</md-select-option>
            </md-outlined-select>
          </div>

          <div class="form-field" v-if="actionType === 'section' && currentSubs.length > 0">
            <md-outlined-select v-model="sectionSub" label="目标子板块">
              <md-select-option v-for="s in currentSubs" :key="s.section" :value="s.section">{{ s.label }}</md-select-option>
            </md-outlined-select>
          </div>

          <div class="form-field">
            <md-outlined-select v-model="icon" label="图标">
              <md-select-option v-for="i in icons" :key="i" :value="i">
                <span class="material-symbols-outlined icon-preview">{{ i }}</span>
                {{ i }}
              </md-select-option>
            </md-outlined-select>
          </div>
        </div>

        <div class="dialog-actions">
          <md-text-button @click="close">取消</md-text-button>
          <md-filled-button @click="confirm" :disabled="!name || !icon || (actionType === 'path' && !targetPath) || (actionType === 'section' && !sectionPage)">
            <md-icon slot="icon">add</md-icon>
            添加
          </md-filled-button>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'

const visible = ref(false)
const name = ref('')
const actionType = ref('path')
const targetPath = ref('')
const sectionPage = ref('')
const sectionSub = ref('')
const icon = ref('')
const sections = [
  { page: 'settings', pageLabel: '设置', icon: 'tune', subs: [
    { section: 'section-appearance', label: '外观', icon: 'palette' },
    { section: 'section-performance', label: '性能', icon: 'speed' },
    { section: 'section-paths', label: '服务器路径', icon: 'folder' },
    { section: 'section-backup', label: '自动备份', icon: 'backup' },
    { section: 'section-console', label: '控制台设置', icon: 'terminal' },
    { section: 'section-notifications', label: '通知', icon: 'notifications' },
  ]},
  { page: 'config', pageLabel: '服务器配置', icon: 'settings', subs: [
    { section: 'section-basic', label: '基础信息', icon: 'info' },
    { section: 'section-rules', label: '游戏规则', icon: 'rule' },
    { section: 'section-network', label: '网络与性能', icon: 'wifi' },
    { section: 'section-generation', label: '生成', icon: 'terrain' },
    { section: 'section-security', label: '验证与安全', icon: 'security' },
    { section: 'section-resourcepack', label: '资源包', icon: 'inventory_2' },
    { section: 'section-worlds', label: '多世界', icon: 'public' },
  ]},
  { page: 'dashboard', pageLabel: '仪表盘', icon: 'dashboard', subs: [] },
  { page: 'console', pageLabel: '控制台', icon: 'terminal', subs: [] },
  { page: 'players', pageLabel: '玩家', icon: 'group', subs: [] },
  { page: 'mods', pageLabel: 'Mod 管理', icon: 'extension', subs: [] },
  { page: 'version', pageLabel: '版本比对', icon: 'compare_arrows', subs: [] },
  { page: 'game', pageLabel: '游戏', icon: 'videogame_asset', subs: [] },
  { page: 'frp', pageLabel: 'FRP 隧道', icon: 'router', subs: [] },
  { page: 'worlds', pageLabel: '多世界', icon: 'public', subs: [] },
]
const icons = ['folder_open', 'extension', 'public', 'terminal', 'settings', 'group', 'compare_arrows', 'videogame_asset', 'router', 'tune', 'dashboard', 'search', 'star', 'favorite', 'home', 'link', 'save', 'download', 'upload', 'code']

const currentSubs = computed(() => {
  const p = sections.find(s => s.page === sectionPage.value)
  return p ? p.subs : []
})

watch(sectionPage, (val) => {
  sectionSub.value = ''
  const p = sections.find(s => s.page === val)
  if (p) {
    if (!name.value) name.value = p.pageLabel
    if (!icon.value) icon.value = p.icon
  }
})

watch(sectionSub, (val) => {
  for (const p of sections) {
    const sub = p.subs.find(s => s.section === val)
    if (sub) {
      name.value = sub.label
      icon.value = sub.icon || p.icon
      break
    }
  }
})

const emit = defineEmits<{
  add: [action: { name: string; type: string; path?: string; section?: string; page?: string; icon: string }]
}>()

function show() { visible.value = true }
function close() { visible.value = false; reset() }
function reset() {
  name.value = ''; actionType.value = 'path'; targetPath.value = ''; sectionPage.value = ''; sectionSub.value = ''; icon.value = ''
}

async function browsePath() {
  const dir = await window.electronAPI.openDirectoryDialog()
  if (dir) targetPath.value = dir
}

function confirm() {
  if (!name.value || !icon.value) return
  const isSection = actionType.value === 'section'
  emit('add', {
    name: name.value,
    type: actionType.value,
    path: !isSection ? targetPath.value : undefined,
    section: isSection ? (sectionSub.value || sectionPage.value) : undefined,
    page: isSection ? sectionPage.value : undefined,
    icon: icon.value,
  })
  close()
}

defineExpose({ show })
</script>

<style scoped>
.dialog-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.5);
  display: flex; align-items: center; justify-content: center; z-index: 9999;
}
.dialog-card {
  background: var(--md-sys-color-surface-container-high);
  border-radius: var(--md-sys-shape-corner-large);
  padding: 24px; width: 480px; max-width: 90vw;
  display: flex; flex-direction: column; gap: 20px;
  box-shadow: var(--md-elevation-level5);
}
.dialog-title { font-size: 18px; font-weight: 700; }
.dialog-body { display: flex; flex-direction: column; gap: 16px; }
.form-field { display: flex; flex-direction: column; gap: 6px; }
.path-row { display: flex; gap: 8px; align-items: center; }
.flex-1 { flex: 1; }
.icon-preview { font-size: 16px; vertical-align: middle; margin-right: 4px; }
.dialog-actions { display: flex; justify-content: flex-end; gap: 8px; }
</style>