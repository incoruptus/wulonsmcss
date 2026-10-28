<template>
  <div class="mods-view">
    <div class="page-header">
      <h1 class="page-title">Mod 管理</h1>
      <div class="header-controls">
        <SegmentedButton
          :options="[
            { value: 'grid', label: '网格', icon: 'grid_view' },
            { value: 'list', label: '列表', icon: 'list' }
          ]"
          v-model="viewMode"
        />
        <md-outlined-text-field class="search-input" placeholder="搜索 Mod..." type="search" v-model="searchQuery">
          <md-icon slot="leadingicon">search</md-icon>
        </md-outlined-text-field>
        <md-filled-button @click="installMod">
          <md-icon slot="icon">add</md-icon>
          安装
        </md-filled-button>
      </div>
    </div>

    <div v-if="filteredMods.length === 0 && !searchQuery" class="empty-state">
      <span class="material-symbols-outlined">extension_off</span>
      <p>暂无已安装的 Mod</p>
    </div>
    <div v-else-if="filteredMods.length === 0 && searchQuery" class="empty-state">
      <span class="material-symbols-outlined">search_off</span>
      <p>没有匹配的 Mod</p>
    </div>

    <div class="mods-content" style="position:relative;flex:1;min-height:0">
    <transition :name="transName" mode="out-in">
      <div v-if="viewMode === 'grid'" class="mod-grid" :class="{ 'anim-stagger': loaded }" key="grid">
        <div v-for="mod in filteredMods" :key="mod.fileName" class="mod-card">
          <div class="mod-icon">
            <span class="material-symbols-outlined">extension</span>
          </div>
          <div class="mod-info">
            <span class="mod-name">{{ mod.cnName ? mod.cnName : mod.enName }}</span>
            <span v-if="mod.cnName" class="mod-en">{{ mod.enName }}</span>
            <span class="mod-version">{{ mod.version }}</span>
          </div>
          <button class="mod-delete" @click="deleteMod(mod)" title="删除">
            <span class="material-symbols-outlined">delete</span>
          </button>
        </div>
      </div>

      <div v-else class="mod-list" key="list">
        <table class="mod-table">
        <thead>
          <tr>
            <th>名称</th>
            <th>版本</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="mod in filteredMods" :key="mod.fileName">
            <td class="td-name">
              <span class="td-cn">{{ mod.cnName || mod.enName }}</span>
              <span v-if="mod.cnName" class="td-en">—— {{ mod.enName }}</span>
            </td>
            <td class="td-version">{{ mod.version }}</td>
            <td><button class="icon-btn" @click="deleteMod(mod)"><span class="material-symbols-outlined">delete</span></button></td>
          </tr>
        </tbody>
      </table>
    </div>
    </transition>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue'
import SegmentedButton from '@/components/SegmentedButton.vue'

const viewMode = ref<'grid' | 'list'>('grid')
const transName = ref('tab-slide')
const prevMode = ref(viewMode.value)
watch(viewMode, (val) => {
  const order = ['grid', 'list']
  const prev = order.indexOf(prevMode.value)
  const curr = order.indexOf(val)
  transName.value = curr > prev ? 'slide-left' : 'slide-right'
  prevMode.value = val
})
const searchQuery = ref('')

interface ModInfo {
  fileName: string
  cnName: string
  enName: string
  version: string
}

const mods = ref<ModInfo[]>([])
const loaded = ref(false)

const filteredMods = computed(() => {
  if (!searchQuery.value) return mods.value
  const q = searchQuery.value.toLowerCase()
  return mods.value.filter(m =>
    m.cnName.toLowerCase().includes(q) ||
    m.enName.toLowerCase().includes(q) ||
    m.version.toLowerCase().includes(q)
  )
})

onMounted(async () => {
  await loadMods()
})

async function loadMods() {
  try {
    const cfg = await window.electronAPI.readConfig()
    const modsDir = (cfg.serverPath || '.') + '\\mods'
    const files = await window.electronAPI.readDir(modsDir)
    const jarFiles = files.filter((f: string) => f.endsWith('.jar'))
    const results: ModInfo[] = []
    for (const f of jarFiles) {
      const info = await parseModFile(modsDir, f)
      results.push(info)
    }
    mods.value = results
    loaded.value = true
  } catch(e) {}
}

async function parseModFile(modsDir: string, fileName: string): Promise<ModInfo> {
  let cnName = ''
  let enName = ''
  let version = ''

  const meta = await window.electronAPI.readModMeta(modsDir + '\\' + fileName)
  if (meta) {
    enName = meta.name || ''
    version = meta.version || ''
  }

  const nameOnly = fileName.replace(/\.jar$/, '')
  const bracketMatch = nameOnly.match(/^\[(.+?)\]\s*(.*)/)
  const rawName = bracketMatch ? bracketMatch[2] : nameOnly
  if (bracketMatch) cnName = bracketMatch[1]

  if (!meta) {
    // Split by '-' and find the first segment that starts with a digit → that's the version
    const parts = rawName.split('-')
    let verIdx = -1
    for (let i = 0; i < parts.length; i++) {
      if (/^\d/.test(parts[i])) { verIdx = i; break }
    }
    if (verIdx >= 0) {
      version = parts.slice(verIdx).join('-').replace(/-(?:mc|fabric|neoforge|forge)\d[\d.]*$/i, '')
      enName = parts.slice(0, verIdx).join(' ').replace(/[-_]/g, ' ')
    } else {
      enName = rawName.replace(/[-_]/g, ' ')
    }
    enName = enName.replace(/\b\w/g, c => c.toUpperCase()).trim()
  }

  return { fileName, cnName, enName, version }
}

async function installMod() {
  const path = await window.electronAPI.openFileDialog([{ name: 'Fabric Mod', extensions: ['jar'] }])
  if (!path) return
  try {
    const cfg = await window.electronAPI.readConfig()
    const modsDir = (cfg.serverPath || '.') + '\\mods'
    const fileName = path.split('\\').pop() || path.split('/').pop() || 'mod.jar'
    await window.electronAPI.copyFile(path, modsDir + '\\' + fileName)
    await loadMods()
  } catch(e) {}
}

async function deleteMod(mod: ModInfo) {
  if (!confirm('确定要删除 Mod "' + (mod.cnName || mod.enName) + '" 吗？')) return
  try {
    const cfg = await window.electronAPI.readConfig()
    const modsDir = (cfg.serverPath || '.') + '\\mods'
    await window.electronAPI.deleteFile(modsDir + '\\' + mod.fileName)
    await loadMods()
  } catch(e) {}
}
</script>

<style scoped>
.mods-view { max-width: 960px; margin: 0 auto; width: 100%; height: 100%; display: flex; flex-direction: column; gap: 12px; }

.page-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; }
.page-title { font-size: 22px; font-weight: 700; }
.header-controls { display: flex; align-items: center; gap: 12px; }
.search-input { width: 200px; }

.mod-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
  overflow-y: auto;
  flex: 1;
}

.mod-card {
  background: var(--md-sys-color-surface-container);
  border-radius: var(--md-sys-shape-corner-medium);
  padding: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  position: relative;
  border: 1px solid var(--md-sys-color-outline-variant);
  transition: box-shadow 0.15s;
}

.mod-card:hover { box-shadow: var(--md-elevation-level2); }

.mod-icon {
  width: 48px; height: 48px;
  border-radius: var(--md-sys-shape-corner-medium);
  background: var(--md-sys-color-primary-container);
  display: flex; align-items: center; justify-content: center;
}

.mod-icon .material-symbols-outlined { font-size: 24px; color: var(--md-sys-color-primary); }

.mod-info { text-align: center; }
.mod-name { display: block; font-size: 13px; font-weight: 600; }
.mod-en { display: block; font-size: 11px; color: var(--md-sys-color-outline); }
.mod-version { display: block; font-size: 11px; color: var(--md-sys-color-on-surface-variant); margin-top: 2px; font-family: var(--font-mono); }

.mod-delete {
  position: absolute; top: 8px; right: 8px;
  width: 28px; height: 28px; border: none; border-radius: var(--md-sys-shape-corner-small);
  background: transparent; color: var(--md-sys-color-outline); cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  opacity: 0; transition: opacity 0.12s;
}

.mod-card:hover .mod-delete { opacity: 1; }
.mod-delete:hover { background: var(--md-sys-color-error-container); color: var(--md-sys-color-error); }
.mod-delete .material-symbols-outlined { font-size: 16px; }

.mod-list { flex: 1; overflow-y: auto; }

.mod-table {
  width: 100%; border-collapse: collapse;
  background: var(--md-sys-color-surface-container);
  border-radius: var(--md-sys-shape-corner-medium);
  overflow: hidden;
}

.mod-table th {
  text-align: left; padding: 12px 16px; font-size: 12px;
  color: var(--md-sys-color-outline); font-weight: 600;
  border-bottom: 1px solid var(--md-sys-color-outline-variant);
}

.mod-table td { padding: 10px 16px; font-size: 13px; border-bottom: 1px solid var(--md-sys-color-outline-variant); }

.td-name { font-weight: 600; }
.td-cn { display: inline; }
.td-en { font-size: 11px; color: var(--md-sys-color-outline); }
.td-version { font-family: var(--font-mono); font-size: 12px; color: var(--md-sys-color-on-surface-variant); }

.icon-btn {
  width: 32px; height: 32px; border: none; border-radius: var(--md-sys-shape-corner-small);
  background: transparent; color: var(--md-sys-color-outline); cursor: pointer;
  display: flex; align-items: center; justify-content: center;
}
.icon-btn:hover { background: var(--md-sys-color-error-container); color: var(--md-sys-color-error); }
.icon-btn .material-symbols-outlined { font-size: 18px; }

.empty-state {
  display: flex; flex-direction: column; align-items: center;
  gap: 8px; padding: 48px; color: var(--md-sys-color-outline);
  text-align: center;
}
.empty-state .material-symbols-outlined { font-size: 40px; }
</style>