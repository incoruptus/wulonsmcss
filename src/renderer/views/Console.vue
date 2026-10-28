<template>
  <div class="console-view">
    <div class="page-header">
      <h1 class="page-title">控制台</h1>
      <div class="header-controls">
        <SegmentedButton
          :options="[
            { value: 'bubble', label: '气泡', icon: 'chat' },
            { value: 'code', label: '代码', icon: 'code' }
          ]"
          v-model="viewMode"
        />
        <button class="icon-btn" @click="serverStore.clearLogs()" title="清空">
          <span class="material-symbols-outlined">delete_sweep</span>
        </button>
      </div>
    </div>

    <div class="filter-bar">
      <div class="filter-search">
        <span class="material-symbols-outlined filter-search-icon">search</span>
        <input
          class="filter-input"
          type="text"
          v-model="searchText"
          placeholder="搜索日志内容..."
        />
        <button v-if="searchText" class="filter-clear" @click="searchText = ''">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>
      <div class="filter-levels">
        <button
          v-for="lv in levels"
          :key="lv.key"
          class="level-chip"
          :class="[`level-${lv.key}`, { active: activeLevels.has(lv.key) }]"
          @click="toggleLevel(lv.key)"
        >
          {{ lv.label }}
        </button>
      </div>
      <span v-if="activeLevels.size < 4 || searchText" class="filter-summary">
        {{ filteredLogs.length }} / {{ serverStore.logs.length }} 条
      </span>
    </div>

    <div class="console-output" ref="consoleRef" style="position:relative">
      <div v-if="filteredLogs.length === 0" class="empty-state">
        <span class="material-symbols-outlined">search_off</span>
        <p>没有匹配的日志</p>
      </div>

      <transition :name="transName" mode="out-in">
        <div v-if="viewMode === 'bubble'" class="bubble-mode" key="bubble">
          <div v-for="(log, i) in filteredLogs" :key="i" class="log-bubble" :class="'bubble-' + log.level.toLowerCase()">
            <div class="bubble-header">
              <span class="bubble-time">{{ log.timestamp }}</span>
              <span class="bubble-badge" :class="'badge-' + log.level.toLowerCase()">{{ log.level }}</span>
              <button class="copy-btn" @click="copyLog(log)" title="复制">
                <span class="material-symbols-outlined">content_copy</span>
              </button>
            </div>
            <div class="bubble-message">{{ log.message }}</div>
            <div v-if="log.stack" class="bubble-stack" @click="log._expanded = !log._expanded">
              <div v-if="log._expanded" class="stack-content">{{ log.stack }}</div>
              <span v-else class="stack-hint">点击查看详情</span>
            </div>
          </div>
        </div>

        <div v-else class="code-mode" key="code">
          <div v-for="(log, i) in filteredLogs" :key="i" class="code-line" :class="'code-' + log.level.toLowerCase()">
            <span class="line-number">{{ i + 1 }}</span>
            <span class="line-time">[{{ log.timestamp }}]</span>
            <span class="line-level">[{{ log.level }}]</span>
            <span class="line-message">{{ log.message }}</span>
          </div>
        </div>
      </transition>
    </div>

    <div class="console-input">
      <md-outlined-text-field
        class="cmd-input"
        placeholder="输入指令... (回车发送)"
        type="text"
        v-model="command"
        @keydown.enter="sendCommand"
      >
        <md-icon slot="leadingicon">terminal</md-icon>
      </md-outlined-text-field>
      <md-filled-button @click="sendCommand" :disabled="!command.trim()">
        <md-icon slot="icon">send</md-icon>
        发送
      </md-filled-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick, watch } from 'vue'
import { useServerStore } from '@/stores/server'
import SegmentedButton from '@/components/SegmentedButton.vue'

const serverStore = useServerStore()
const viewMode = ref<'bubble' | 'code'>('bubble')
const transName = ref('tab-slide')
const prevMode = ref(viewMode.value)
watch(viewMode, (val) => {
  const order = ['bubble', 'code']
  const prev = order.indexOf(prevMode.value)
  const curr = order.indexOf(val)
  transName.value = curr > prev ? 'slide-left' : 'slide-right'
  prevMode.value = val
})
// Persist view mode on change
watch(viewMode, async (v) => {
  try {
    const cfg = await window.electronAPI.readConfig() || {}
    cfg.consoleViewMode = v
    await window.electronAPI.writeConfig(cfg)
  } catch(e) {}
})
const command = ref('')
const searchText = ref('')
const consoleRef = ref<HTMLElement | null>(null)

const levels = [
  { key: 'info', label: 'INFO' },
  { key: 'warn', label: 'WARN' },
  { key: 'error', label: 'ERROR' },
  { key: 'chat', label: 'CHAT' },
]
const activeLevels = ref(new Set(['info', 'warn', 'error', 'chat']))

function toggleLevel(key: string) {
  if (activeLevels.value.has(key)) {
    if (activeLevels.value.size > 1) activeLevels.value.delete(key)
  } else {
    activeLevels.value.add(key)
  }
  activeLevels.value = new Set(activeLevels.value)
}

const filteredLogs = computed(() => {
  return serverStore.logs.filter(log => {
    if (!activeLevels.value.has(log.level.toLowerCase())) return false
    if (searchText.value) {
      const q = searchText.value.toLowerCase()
      if (!log.message.toLowerCase().includes(q)) return false
    }
    return true
  })
})

function sendCommand() {
  if (!command.value.trim()) return
  window.electronAPI.sendCommand(command.value)
  command.value = ''
}

function copyLog(log: any) {
  navigator.clipboard.writeText(`[${log.timestamp}] [${log.level}] ${log.message}`)
}

// Auto-scroll to bottom only when entering Console page
onMounted(() => {
  nextTick(() => {
    const el = consoleRef.value
    if (el) el.scrollTop = el.scrollHeight
  })
})

watch(
  () => serverStore.logs.length,
  async () => {
    await nextTick()
    if (consoleRef.value) {
      consoleRef.value.scrollTop = consoleRef.value.scrollHeight
    }
  },
  { flush: 'post' }
)
</script>

<style scoped>
.console-view {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 960px;
  margin: 0 auto;
  width: 100%;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.page-title { font-size: 22px; font-weight: 700; }

.header-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* ── Filter bar ── */
.filter-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.filter-search {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 200px;
  padding: 0 12px;
  height: 40px;
  border: 1px solid var(--md-sys-color-outline);
  border-radius: var(--md-sys-shape-corner-full);
  background: var(--md-sys-color-surface-container);
  transition: border-color 0.15s;
}

.filter-search:focus-within {
  border-color: var(--md-sys-color-primary);
}

.filter-search-icon {
  font-size: 18px;
  color: var(--md-sys-color-outline);
}

.filter-input {
  flex: 1;
  border: none;
  background: none;
  outline: none;
  font-family: var(--font-ui);
  font-size: 14px;
  color: var(--md-sys-color-on-surface);
}

.filter-input::placeholder {
  color: var(--md-sys-color-outline);
}

.filter-clear {
  width: 24px; height: 24px;
  border: none; background: none;
  cursor: pointer; color: var(--md-sys-color-outline);
  display: flex; align-items: center; justify-content: center;
  border-radius: 50%;
}

.filter-clear:hover {
  background: var(--md-sys-color-surface-container-high);
  color: var(--md-sys-color-on-surface);
}

.filter-clear .material-symbols-outlined { font-size: 16px; }

.filter-levels {
  display: flex;
  gap: 4px;
}

.level-chip {
  padding: 4px 12px;
  border: 1px solid var(--md-sys-color-outline);
  border-radius: var(--md-sys-shape-corner-full);
  background: transparent;
  color: var(--md-sys-color-on-surface-variant);
  font-family: var(--font-ui);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
  white-space: nowrap;
}

.level-chip:hover {
  background: var(--md-sys-color-surface-container-high);
}

.level-chip.active.level-info {
  background: var(--md-sys-color-primary-container);
  color: var(--md-sys-color-on-primary-container);
  border-color: var(--md-sys-color-primary);
}

.level-chip.active.level-warn {
  background: #f4b74020;
  color: #b07d00;
  border-color: #f4b740;
}

.level-chip.active.level-error {
  background: var(--md-sys-color-error-container);
  color: var(--md-sys-color-on-error-container);
  border-color: var(--md-sys-color-error);
}

.level-chip.active.level-chat {
  background: #5b9bd520;
  color: #2b6ba0;
  border-color: #5b9bd5;
}

.filter-summary {
  font-size: 12px;
  color: var(--md-sys-color-outline);
  white-space: nowrap;
}

/* ── Icons ── */
.icon-btn {
  width: 36px; height: 36px;
  border: none; border-radius: var(--md-sys-shape-corner-small);
  background: transparent; color: var(--md-sys-color-on-surface);
  cursor: pointer; display: flex; align-items: center; justify-content: center;
}

.icon-btn:hover { background: var(--md-sys-color-surface-container-high); }

/* ── Output ── */
.console-output {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  background: var(--md-sys-color-surface-dim);
  border-radius: var(--md-sys-shape-corner-medium);
  border: 1px solid var(--md-sys-color-outline-variant);
}

.empty-state {
  display: flex; flex-direction: column; align-items: center;
  gap: 8px; padding: 48px; color: var(--md-sys-color-outline);
}

.empty-state .material-symbols-outlined { font-size: 40px; }

.bubble-mode {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.log-bubble {
  padding: 10px 12px;
  border-radius: var(--md-sys-shape-corner-medium);
  background: var(--md-sys-color-surface-container);
  border-left: 3px solid var(--md-sys-color-outline);
}

.bubble-info { border-left-color: var(--md-sys-color-primary); }
.bubble-warn { border-left-color: #f4b740; background: #f4b7400d; }
.bubble-error { border-left-color: var(--md-sys-color-error); background: var(--md-sys-color-error-container); }
.bubble-chat { border-left-color: #5b9bd5; background: #5b9bd50d; }

.bubble-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.bubble-time { font-size: 11px; color: var(--md-sys-color-outline); font-family: var(--font-mono); }

.bubble-badge {
  font-size: 10px; font-weight: 700; padding: 1px 6px;
  border-radius: var(--md-sys-shape-corner-extra-small);
  text-transform: uppercase;
}

.badge-info { background: var(--md-sys-color-primary-container); color: var(--md-sys-color-on-primary-container); }
.badge-warn { background: #f4b740; color: #000; }
.badge-error { background: var(--md-sys-color-error); color: var(--md-sys-color-on-error); }
.badge-chat { background: #5b9bd5; color: #fff; }

.copy-btn {
  margin-left: auto; width: 24px; height: 24px;
  border: none; background: transparent; cursor: pointer;
  color: var(--md-sys-color-outline); display: flex; align-items: center; justify-content: center;
  border-radius: var(--md-sys-shape-corner-extra-small);
  opacity: 0; transition: opacity 0.12s;
}

.log-bubble:hover .copy-btn { opacity: 1; }
.copy-btn:hover { color: var(--md-sys-color-on-surface); }
.copy-btn .material-symbols-outlined { font-size: 14px; }

.bubble-message { font-size: 13px; line-height: 1.4; overflow-wrap: break-word; word-break: break-word; }
.bubble-stack { margin-top: 4px; }

.stack-hint { font-size: 11px; color: var(--md-sys-color-primary); cursor: pointer; }

.stack-content {
  padding: 8px; font-family: var(--font-mono); font-size: 11px;
  background: var(--md-sys-color-surface-dim); border-radius: var(--md-sys-shape-corner-extra-small);
  white-space: pre-wrap; line-height: 1.5;
}

.code-mode {
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
}

.code-line {
  display: flex;
  gap: 12px;
  padding: 1px 8px;
  white-space: pre-wrap;
  word-break: break-all;
}

.code-line:hover { background: var(--md-sys-color-surface-container-highest); }

.line-number {
  color: var(--md-sys-color-outline);
  min-width: 32px;
  text-align: right;
  user-select: none;
}

.line-time { color: var(--md-sys-color-outline); }
.line-level { font-weight: 700; }
.code-info .line-level { color: var(--md-sys-color-primary); }
.code-warn .line-level { color: #f4b740; }
.code-error .line-level { color: var(--md-sys-color-error); }
.code-chat .line-level { color: #5b9bd5; }
.line-message { flex: 1; }

.console-input {
  display: flex;
  gap: 8px;
  align-items: center;
}

.cmd-input { flex: 1; }
</style>