<template>
  <div class="worlds-view">
    <div class="page-header">
      <h1 class="page-title">多世界管理</h1>
      <div class="header-actions">
        <md-outlined-button @click="scanWorlds">
          <md-icon slot="icon">refresh</md-icon>
          扫描
        </md-outlined-button>
        <md-filled-button @click="showCreate = true">
          <md-icon slot="icon">add</md-icon>
          创建世界
        </md-filled-button>
      </div>
    </div>

    <section class="worlds-section">
      <h2 class="section-subtitle">原版世界</h2>
      <div class="worlds-list">
        <div class="pack-card">
          <div class="world-list">
            <div class="world-item">
              <span class="material-symbols-outlined world-icon">public</span>
              <div class="world-info">
                <span class="world-id">minecraft:overworld</span>
                <span class="world-type">主世界</span>
              </div>
              <span class="world-status active">已加载</span>
            </div>
            <div class="world-item">
              <span class="material-symbols-outlined world-icon">public</span>
              <div class="world-info">
                <span class="world-id">minecraft:the_nether</span>
                <span class="world-type">下界</span>
              </div>
              <span class="world-status active">已加载</span>
            </div>
            <div class="world-item">
              <span class="material-symbols-outlined world-icon">public</span>
              <div class="world-info">
                <span class="world-id">minecraft:the_end</span>
                <span class="world-type">末地</span>
              </div>
              <span class="world-status active">已加载</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="worlds-section">
      <h2 class="section-subtitle">自定义世界</h2>
      <div class="worlds-list">
        <div v-for="pack in packs" :key="pack.name" class="pack-card">
          <div class="pack-header">
            <span class="pack-name">{{ pack.name }}</span>
            <span class="pack-desc">{{ pack.description || '' }}</span>
          </div>
          <div class="world-list">
            <div v-for="w in pack.worlds" :key="w.id" class="world-item">
              <span class="material-symbols-outlined world-icon">public</span>
              <div class="world-info">
                <span class="world-id">{{ w.id }}</span>
                <span class="world-type">{{ w.generator }}</span>
              </div>
            </div>
          </div>
          <div class="pack-actions">
            <md-text-button @click="deletePack(pack.name)" style="--md-text-button-label-text-color: var(--md-sys-color-error);">
              <md-icon slot="icon">delete</md-icon>
              删除
            </md-text-button>
          </div>
        </div>
        <div v-if="packs.length === 0" class="empty-state">
          <span class="material-symbols-outlined">public</span>
          <p>尚未创建任何多世界数据包</p>
          <p class="hint">点击「创建世界」开始添加</p>
        </div>
      </div>
    </section>

    <transition name="dialog">
      <div class="dialog-overlay" v-if="showCreate" @click.self="showCreate = false">
        <div class="dialog-card" @click.stop>
          <h2 class="dialog-title">创建新世界</h2>
          <div class="dialog-body">
            <md-outlined-text-field v-model="newWorld.name" label="世界名称（英文）" type="text" style="width:100%"></md-outlined-text-field>
            <md-outlined-text-field v-model="newWorld.label" label="显示名称" type="text" style="width:100%"></md-outlined-text-field>
            <md-outlined-select v-model="newWorld.type" label="世界类型" style="width:100%">
              <md-select-option value="overworld">主世界风格</md-select-option>
              <md-select-option value="nether">下界风格</md-select-option>
              <md-select-option value="the_end">末地风格</md-select-option>
              <md-select-option value="superflat">超平坦</md-select-option>
              <md-select-option value="void">虚空</md-select-option>
            </md-outlined-select>
            <md-outlined-text-field v-model="newWorld.description" label="描述" type="text" style="width:100%"></md-outlined-text-field>
          </div>
          <div class="dialog-actions">
            <md-text-button @click="showCreate = false">取消</md-text-button>
            <md-filled-button @click="confirmCreate" :disabled="!newWorld.name">创建</md-filled-button>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

const packs = ref<any[]>([])
const showCreate = ref(false)
const newWorld = ref({ name: '', label: '', type: 'overworld', description: '', namespace: 'wulons' })
let serverDir = ''

onMounted(async () => {
  try {
    const cfg = await window.electronAPI.readConfig()
    if (cfg.serverPath) serverDir = cfg.serverPath
  } catch(e) {}
  await loadWorlds()
})

async function loadWorlds() {
  if (!serverDir) return
  try {
    packs.value = await window.electronAPI.scanWorlds(serverDir)
  } catch(e) {}
}

async function scanWorlds() {
  await loadWorlds()
}

async function confirmCreate() {
  if (!newWorld.value.name) return
  try {
    const result = await window.electronAPI.createWorld(serverDir, {
      name: newWorld.value.name,
      label: newWorld.value.label || newWorld.value.name,
      type: newWorld.value.type,
      description: newWorld.value.description || '',
      namespace: newWorld.value.namespace
    })
    if (result.success) {
      await window.electronAPI.reloadWorlds()
      await loadWorlds()
      showCreate.value = false
      newWorld.value = { name: '', label: '', type: 'overworld', description: '', namespace: 'wulons' }
    }
  } catch(e) {}
}

async function deletePack(packName: string) {
  if (!confirm(`确定要删除数据包「${packName}」吗？世界存档文件不会丢失。`)) return
  try {
    const result = await window.electronAPI.deleteWorld(serverDir, packName)
    if (result.success) {
      await window.electronAPI.reloadWorlds()
      await loadWorlds()
    }
  } catch(e) {}
}
</script>

<style scoped>
.worlds-view { max-width: 840px; margin: 0 auto; width: 100%; }

.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.page-title { font-size: 22px; font-weight: 700; }
.section-subtitle { font-size: 15px; font-weight: 600; margin-bottom: 10px; color: var(--md-sys-color-outline); }
.header-actions { display: flex; gap: 8px; }

.worlds-list { display: flex; flex-direction: column; gap: 12px; }

.pack-card {
  background: var(--md-sys-color-surface-container);
  border-radius: var(--md-sys-shape-corner-medium);
  padding: 20px;
}

.pack-header { margin-bottom: 12px; }
.pack-name { font-size: 15px; font-weight: 700; display: block; }
.pack-desc { font-size: 12px; color: var(--md-sys-color-outline); }

.world-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }

.world-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: var(--md-sys-color-surface-container-high);
  border-radius: var(--md-sys-shape-corner-small);
}

.world-icon { font-size: 18px; color: var(--md-sys-color-primary); }
.world-info { display: flex; flex-direction: column; }
.world-id { font-size: 13px; font-weight: 600; }
.world-type { font-size: 11px; color: var(--md-sys-color-outline); }

.world-status { font-size: 11px; padding: 2px 8px; border-radius: 8px; margin-left: auto; }
.world-status.active { background: var(--md-sys-color-primary-container); color: var(--md-sys-color-primary); }

.pack-actions { display: flex; gap: 8px; }

.empty-state { text-align: center; padding: 48px; color: var(--md-sys-color-outline); }
.empty-state .material-symbols-outlined { font-size: 48px; }
.empty-state p { margin: 8px 0; }
.hint { font-size: 12px; }

.dialog-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.5);
  display: flex; align-items: center; justify-content: center; z-index: 9999;
}
.dialog-card {
  background: var(--md-sys-color-surface-container-high);
  border-radius: var(--md-sys-shape-corner-large);
  padding: 24px; width: 460px; max-width: 90vw;
  display: flex; flex-direction: column; gap: 20px;
  box-shadow: var(--md-elevation-level5);
}
.dialog-title { font-size: 18px; font-weight: 700; }
.dialog-body { display: flex; flex-direction: column; gap: 16px; }
.dialog-actions { display: flex; justify-content: flex-end; gap: 8px; }
</style>