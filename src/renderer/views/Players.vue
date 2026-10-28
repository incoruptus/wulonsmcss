<template>
  <div class="players-view">
    <div class="page-header">
      <h1 class="page-title">玩家管理</h1>
    </div>

    <section class="player-section">
      <h2 class="section-title">在线玩家 ({{ onlinePlayers.length }})</h2>
      <div class="player-list">
        <div v-for="p in onlinePlayers" :key="p.name" class="player-card">
          <div class="player-avatar">{{ p.name[0].toUpperCase() }}</div>
          <div class="player-info">
            <span class="player-name">{{ p.name }}</span>
            <span v-if="p.isOp" class="op-badge">OP</span>
          </div>
          <div class="player-health">
            <div class="health-bar" :style="{ width: (p.health / 20 * 100) + '%' }"></div>
          </div>
          <md-outlined-button class="kick-btn" @click="kickPlayer(p.name)">
            <md-icon slot="icon">logout</md-icon>
            踢出
          </md-outlined-button>
        </div>
        <div v-if="onlinePlayers.length === 0" class="empty-state">
          <span class="material-symbols-outlined">person_off</span>
          <p>暂无在线玩家</p>
        </div>
      </div>
    </section>

    <section class="player-section">
      <div class="op-header">
        <h2 class="section-title">OP 管理</h2>
        <md-filled-button @click="showAddOp = true">
          <md-icon slot="icon">add</md-icon>
          添加 OP
        </md-filled-button>
      </div>
      <div class="table-list">
        <div v-for="op in ops" :key="op" class="table-row">
          <span class="table-cell">{{ op }}</span>
          <button class="icon-btn" @click="removeOp(op)">
            <span class="material-symbols-outlined">delete</span>
          </button>
        </div>
      </div>
    </section>

    <section class="player-section">
      <h2 class="section-title">白名单</h2>
      <div class="switch-row">
        <span class="field-label">启用白名单</span>
        <md-switch :selected="whitelistEnabled" @change="whitelistEnabled = $event.target.selected"></md-switch>
      </div>
      <div class="table-list">
        <div v-for="wl in whitelist" :key="wl" class="table-row">
          <span class="table-cell">{{ wl }}</span>
          <button class="icon-btn" @click="removeWhitelist(wl)">
            <span class="material-symbols-outlined">delete</span>
          </button>
        </div>
      </div>
    </section>

    <transition name="dialog">
      <div class="dialog-overlay" v-if="showAddOp" @click.self="showAddOp = false" key="op-dialog">
        <div class="dialog-card" @click.stop>
          <div style="font-size:18px;font-weight:700;margin-bottom:16px">添加 OP</div>
          <md-outlined-text-field label="玩家名" v-model="newOpName" type="text" style="width:100%"></md-outlined-text-field>
          <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px">
            <md-text-button @click="showAddOp = false">取消</md-text-button>
            <md-filled-button @click="confirmAddOp">
              <md-icon slot="icon">add</md-icon>
              添加
            </md-filled-button>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useServerStore } from '@/stores/server'

const serverStore = useServerStore()

const onlinePlayers = computed(() =>
  serverStore.onlinePlayers.map(name => ({
    name,
    health: 20,
    isOp: ops.value.includes(name)
  }))
)
const ops = ref<string[]>(['Alice'])
const whitelist = ref<string[]>([])
const whitelistEnabled = ref(false)
const showAddOp = ref(false)
const newOpName = ref('')

const serverDir = ref('')

async function getServerDir(): Promise<string> {
  if (serverDir.value) return serverDir.value
  try {
    const cfg = await window.electronAPI.readConfig()
    if (cfg.serverPath) serverDir.value = cfg.serverPath
  } catch(e) {}
  return serverDir.value
}

async function loadPlayers() {
  const dir = await getServerDir()
  if (!dir) return
  try {
    const opsRaw = await window.electronAPI.readFile(dir + '\\ops.json')
    ops.value = JSON.parse(opsRaw).map((o: any) => o.name)
  } catch(e) {}
  try {
    const wlRaw = await window.electronAPI.readFile(dir + '\\whitelist.json')
    whitelist.value = JSON.parse(wlRaw).map((o: any) => o.name)
  } catch(e) {}
}

async function saveOps() {
  const dir = await getServerDir()
  if (!dir) return
  const data = ops.value.map(name => ({ name, uuid: '', level: 4, bypassesPlayerLimit: false }))
  await window.electronAPI.writeFile(dir + '\\ops.json', JSON.stringify(data, null, 2))
}

async function saveWhitelist() {
  const dir = await getServerDir()
  if (!dir) return
  const data = whitelist.value.map(name => ({ name, uuid: '' }))
  await window.electronAPI.writeFile(dir + '\\whitelist.json', JSON.stringify(data, null, 2))
}

function kickPlayer(name: string) {
  window.electronAPI.sendCommand(`kick ${name}`)
}

async function removeOp(name: string) {
  ops.value = ops.value.filter(o => o !== name)
  await saveOps()
}

async function removeWhitelist(name: string) {
  whitelist.value = whitelist.value.filter(w => w !== name)
  await saveWhitelist()
}

async function confirmAddOp() {
  if (newOpName.value.trim()) {
    ops.value.push(newOpName.value.trim())
    newOpName.value = ''
    showAddOp.value = false
    await saveOps()
  }
}

onMounted(async () => {
  await loadPlayers()
})
</script>

<style scoped>
.players-view { max-width: 760px; margin: 0 auto; width: 100%; }

.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.page-title { font-size: 22px; font-weight: 700; }

.player-section {
  background: var(--md-sys-color-surface-container);
  border-radius: var(--md-sys-shape-corner-medium);
  padding: 20px;
  margin-bottom: 16px;
}

.section-title { font-size: 15px; font-weight: 600; margin-bottom: 12px; }

.player-list { display: flex; flex-direction: column; gap: 8px; }

.player-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  background: var(--md-sys-color-surface-container-high);
  border-radius: var(--md-sys-shape-corner-small);
}

.player-avatar {
  width: 36px; height: 36px;
  border-radius: 50%;
  background: var(--md-sys-color-primary-container);
  color: var(--md-sys-color-on-primary-container);
  display: flex; align-items: center; justify-content: center;
  font-weight: 700; font-size: 14px;
}

.player-info { display: flex; align-items: center; gap: 6px; min-width: 120px; }
.player-name { font-size: 14px; font-weight: 600; }
.op-badge { font-size: 10px; padding: 1px 6px; border-radius: 4px; background: #f4b740; color: #000; font-weight: 700; }

.player-health { flex: 1; max-width: 120px; }
.health-bar { height: 6px; background: var(--md-sys-color-primary); border-radius: 3px; }

.kick-btn { --md-filled-button-container-height: 32px; --md-filled-button-horizontal-padding: 12px; }

.op-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.op-header .section-title {
  margin-bottom: 0;
}

.table-header { display: flex; justify-content: flex-end; margin-bottom: 8px; }
.table-list { display: flex; flex-direction: column; gap: 4px; }
.table-row { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: var(--md-sys-color-surface-container-high); border-radius: var(--md-sys-shape-corner-small); }
.table-cell { font-size: 13px; }

.switch-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.field-label { font-size: 13px; color: var(--md-sys-color-on-surface-variant); }

.icon-btn {
  width: 32px; height: 32px; border: none; border-radius: var(--md-sys-shape-corner-small);
  background: transparent; color: var(--md-sys-color-outline); cursor: pointer;
  display: flex; align-items: center; justify-content: center;
}
.icon-btn:hover { background: var(--md-sys-color-error-container); color: var(--md-sys-color-error); }
.icon-btn .material-symbols-outlined { font-size: 18px; }

.empty-state {
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  padding: 32px; color: var(--md-sys-color-outline);
  text-align: center;
}
.empty-state .material-symbols-outlined { font-size: 40px; }

.dialog-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.5);
  display: flex; align-items: center; justify-content: center; z-index: 9999;
}

.dialog-card {
  background: var(--md-sys-color-surface-container-high);
  border-radius: var(--md-sys-shape-corner-large);
  padding: 24px; width: 400px; max-width: 90vw;
  box-shadow: var(--md-elevation-level5);
}
</style>