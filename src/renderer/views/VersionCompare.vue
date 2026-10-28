<template>
  <div class="version-view">
    <div class="page-header">
      <h1 class="page-title">版本比对</h1>
      <div class="header-actions">
        <md-outlined-button @click="exportManifest">
          <md-icon slot="icon">upload</md-icon>
          导出清单
        </md-outlined-button>
        <md-filled-button @click="importManifest">
          <md-icon slot="icon">download</md-icon>
          导入比对照
        </md-filled-button>
      </div>
    </div>

    <div class="compare-layout" v-if="currentManifest || importedManifest">
      <div class="compare-side">
        <h3 class="side-title">当前服务端</h3>
        <div class="side-body">
          <div class="manifest-field"><span class="field-key">应用版本</span><span class="field-val">{{ currentManifest?.appVersion || '—' }}</span></div>
          <div class="manifest-field"><span class="field-key">MC 版本</span><span class="field-val">{{ currentManifest?.mcVersion || '—' }}</span></div>
          <div class="manifest-field"><span class="field-key">更新时间</span><span class="field-val">{{ currentManifest?.updatedAt || '—' }}</span></div>
          <div class="manifest-field"><span class="field-key">Mod 数量</span><span class="field-val">{{ currentManifest?.mods?.length || 0 }}</span></div>
          <div class="manifest-field"><span class="field-key">世界数量</span><span class="field-val">{{ currentManifest?.worlds?.length || 0 }}</span></div>
        </div>
        <div class="export-actions" v-if="!exportedAt">
          <span class="export-hint">尚未导出当前清单</span>
        </div>
        <div class="export-actions" v-else>
          <span class="export-date">已导出：{{ exportedAt }}</span>
        </div>
      </div>

      <div class="compare-vs">
        <div class="vs-badge" v-if="!importedManifest">VS</div>
        <div class="vs-badge" v-else :class="compareResult.class">{{ compareResult.label[0] }}</div>
        <div class="vs-result" v-if="importedManifest" :class="compareResult.class">{{ compareResult.label }}</div>
        <div class="vs-result hint" v-else>导入一个清单开始比对</div>
      </div>

      <div class="compare-side reference" :class="{ empty: !importedManifest }">
        <h3 class="side-title">参照服务端</h3>
        <div v-if="importedManifest" class="side-body">
          <div class="manifest-field"><span class="field-key">应用版本</span><span class="field-val">{{ importedManifest.appVersion || '—' }}</span></div>
          <div class="manifest-field"><span class="field-key">MC 版本</span><span class="field-val">{{ importedManifest.mcVersion || '—' }}</span></div>
          <div class="manifest-field"><span class="field-key">更新时间</span><span class="field-val">{{ importedManifest.updatedAt || '—' }}</span></div>
          <div class="manifest-field"><span class="field-key">Mod 数量</span><span class="field-val">{{ importedManifest.mods?.length || 0 }}</span></div>
          <div class="manifest-field"><span class="field-key">世界数量</span><span class="field-val">{{ importedManifest.worlds?.length || 0 }}</span></div>
        </div>
        <div v-else class="empty-hint">暂无参照数据</div>
      </div>
    </div>

    <div class="empty-state" v-if="!currentManifest && !importedManifest">
      <span class="material-symbols-outlined">compare_arrows</span>
      <p>点击「导出清单」保存当前服务端参数</p>
      <p>或点击「导入比对照」加载其他服务端清单</p>
    </div>

    <section class="diff-section" v-if="diffItems.length > 0">
      <h2 class="section-title">差异详情</h2>
      <div class="diff-list">
        <div v-for="(item, i) in diffItems" :key="i" class="diff-item" :class="'diff-' + item.type">
          <span class="material-symbols-outlined diff-icon">{{ item.icon }}</span>
          <span>{{ item.text }}</span>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'

interface Manifest {
  appVersion?: string
  mcVersion?: string
  updatedAt?: string
  mods?: { name: string; version: string }[]
  worlds?: { name: string; lastPlayed: string }[]
}

const currentManifest = ref<Manifest | null>(null)
const importedManifest = ref<Manifest | null>(null)

onMounted(async () => {
  try {
    const cfg = await window.electronAPI.readConfig()
    if (cfg.serverPath) {
      const manifest = await window.electronAPI.generateManifest(cfg.serverPath)
      currentManifest.value = manifest
    }
  } catch(e) {}
})
const exportedAt = ref('')

const compareResult = computed(() => {
  if (!importedManifest.value) return { label: '', class: '' }
  const cur = currentManifest.value
  const imp = importedManifest.value
  const curVer = (cur?.appVersion || '0').split('.').map(n => parseInt(n) || 0)
  const impVer = (imp?.appVersion || '0').split('.').map(n => parseInt(n) || 0)
  const cmp = compareVersionArrays(curVer, impVer)
  if (cmp > 0) return { label: '当前更新', class: 'ahead' }
  if (cmp < 0) return { label: '参照更新', class: 'behind' }
  return { label: '版本一致', class: 'same' }
})

function compareVersionArrays(a: number[], b: number[]) {
  const len = Math.max(a.length, b.length)
  for (let i = 0; i < len; i++) {
    const diff = (a[i] || 0) - (b[i] || 0)
    if (diff !== 0) return diff
  }
  return 0
}

const diffItems = computed(() => {
  const items: { type: string; icon: string; text: string }[] = []
  const cur = currentManifest.value
  const imp = importedManifest.value
  if (!cur || !imp) return items

  if (cur.mcVersion !== imp.mcVersion) {
    items.push({ type: 'change', icon: 'info', text: `MC 版本不同：${cur.mcVersion || '?'} vs ${imp.mcVersion || '?'}` })
  }

  const curMods = cur.mods || []
  const impMods = imp.mods || []

  for (const m of impMods) {
    const found = curMods.find(cm => cm.name === m.name)
    if (!found) {
      items.push({ type: 'new', icon: 'add_circle', text: `新增 Mod：${m.name} v${m.version}` })
    } else if (found.version !== m.version) {
      items.push({ type: 'upgrade', icon: 'arrow_circle_up', text: `${m.name} ${found.version} → ${m.version}` })
    }
  }

  for (const m of curMods) {
    if (!impMods.find(im => im.name === m.name)) {
      items.push({ type: 'removed', icon: 'remove_circle', text: `移除 Mod：${m.name}` })
    }
  }

  if (items.length === 0) {
    items.push({ type: 'same', icon: 'check_circle', text: '两个服务端完全一致' })
  }

  return items
})

async function exportManifest() {
  if (!currentManifest.value) return
  const path = await window.electronAPI.saveFileDialog({
    defaultPath: `server-manifest-${Date.now()}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }]
  })
  if (!path) return
  const content = JSON.stringify(currentManifest.value, null, 2)
  await window.electronAPI.writeFile(path, content)
  exportedAt.value = new Date().toLocaleString('zh-CN')
}

async function importManifest() {
  const path = await window.electronAPI.openFileDialog([
    { name: 'JSON', extensions: ['json'] },
    { name: 'Any', extensions: ['*'] }
  ])
  if (!path) return
  const content = await window.electronAPI.readFile(path)
  try {
    importedManifest.value = JSON.parse(content)
  } catch {
    alert('无效的清单文件')
  }
}
</script>

<style scoped>
.version-view { max-width: 840px; margin: 0 auto; width: 100%; }

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}
.page-title { font-size: 22px; font-weight: 700; }

.header-actions { display: flex; gap: 8px; }

.compare-layout {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 20px;
  align-items: start;
  margin-bottom: 20px;
}

.compare-side {
  background: var(--md-sys-color-surface-container);
  border-radius: var(--md-sys-shape-corner-medium);
  padding: 20px;
}

.compare-side.reference.empty {
  opacity: 0.5;
}

.side-title { font-size: 14px; font-weight: 600; margin-bottom: 12px; }

.side-body { display: flex; flex-direction: column; gap: 8px; }

.manifest-field { display: flex; justify-content: space-between; font-size: 13px; }
.field-key { color: var(--md-sys-color-outline); }
.field-val { font-weight: 600; }

.export-actions { margin-top: 12px; }
.export-hint { font-size: 11px; color: var(--md-sys-color-outline); }
.export-date { font-size: 11px; color: var(--md-sys-color-primary); }

.compare-vs {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding-top: 40px;
}

.vs-badge {
  width: 48px; height: 48px;
  border-radius: 50%;
  background: var(--md-sys-color-primary-container);
  color: var(--md-sys-color-on-primary-container);
  display: flex; align-items: center; justify-content: center;
  font-weight: 700; font-size: 14px;
}

.vs-badge.ahead { background: var(--md-sys-color-primary); color: var(--md-sys-color-on-primary); }
.vs-badge.behind { background: var(--md-sys-color-error-container); color: var(--md-sys-color-on-error-container); }
.vs-badge.same { background: var(--md-sys-color-secondary-container); color: var(--md-sys-color-on-secondary-container); }

.vs-result { font-size: 13px; font-weight: 600; }
.vs-result.ahead { color: var(--md-sys-color-primary); }
.vs-result.behind { color: var(--md-sys-color-error); }
.vs-result.same { color: var(--md-sys-color-secondary); }
.vs-result.hint { color: var(--md-sys-color-outline); font-weight: 400; }

.empty-state {
  display: flex; flex-direction: column; align-items: center;
  gap: 8px; padding: 64px; color: var(--md-sys-color-outline); text-align: center;
}
.empty-state .material-symbols-outlined { font-size: 48px; }

.empty-hint {
  text-align: center; padding: 24px 0;
  font-size: 13px; color: var(--md-sys-color-outline);
}

.diff-section {
  background: var(--md-sys-color-surface-container);
  border-radius: var(--md-sys-shape-corner-medium);
  padding: 20px;
  margin-bottom: 16px;
}

.section-title { font-size: 15px; font-weight: 600; margin-bottom: 12px; }

.diff-list { display: flex; flex-direction: column; gap: 8px; }

.diff-item {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 12px;
  background: var(--md-sys-color-surface-container-high);
  border-radius: var(--md-sys-shape-corner-small);
  font-size: 13px;
}

.diff-icon { font-size: 18px; }
.diff-new .diff-icon { color: var(--md-sys-color-primary); }
.diff-upgrade .diff-icon { color: var(--md-sys-color-primary); }
.diff-removed .diff-icon { color: var(--md-sys-color-error); }
.diff-change .diff-icon { color: var(--md-sys-color-secondary); }
.diff-same .diff-icon { color: var(--md-sys-color-primary); }
</style>