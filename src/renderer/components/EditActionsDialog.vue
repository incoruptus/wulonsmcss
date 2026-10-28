<template>
  <transition name="dialog">
    <div class="dialog-overlay" v-if="visible" @click.self="close">
      <div class="dialog-card">
        <h2 class="dialog-title">编辑快捷操作</h2>
        <div class="action-list" @dragover.prevent @drop.prevent="onDrop">
          <div v-for="(a, i) in displayList" :key="a.id" class="action-item"
               :class="{ 'is-default': a.isDefault, 'drag-over': dragOverIdx === i }"
               draggable="true"
               @dragstart="onDragStart(i)"
               @dragenter="dragOverIdx = i"
               @dragleave="dragOverIdx = -1">
            <div class="drag-handle" v-if="!a.isDefault">
              <span class="material-symbols-outlined">drag_indicator</span>
            </div>
            <div class="drag-handle placeholder" v-else></div>
            <span class="material-symbols-outlined action-icon">{{ a.icon }}</span>
            <span class="action-name">{{ a.name }}<span v-if="a.isDefault" class="default-badge">默认</span></span>
            <button v-if="!a.isDefault" class="mini-btn del-btn" @click="removeAt(i - defaultCount)" title="删除">
              <span class="material-symbols-outlined">delete</span>
            </button>
          </div>
          <div v-if="customActions.length === 0" class="empty-state">
            <span class="material-symbols-outlined">list</span>
            <p>暂无自定义操作</p>
          </div>
        </div>
        <div class="dialog-actions">
          <md-text-button @click="close">取消</md-text-button>
          <md-filled-button @click="save">保存</md-filled-button>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { QuickAction as QAction } from '@/types'

const defaults: QAction[] = [
  { id: 'def_mods', name: 'Mod 目录', icon: 'extension', isDefault: true },
  { id: 'def_server', name: '服务器目录', icon: 'folder_open', isDefault: true },
  { id: 'def_world', name: '世界存档', icon: 'public', isDefault: true },
]

const visible = ref(false)
const customActions = ref<QAction[]>([])
let onSave: ((items: QAction[]) => void) | null = null
const dragIdx = ref(-1)
const dragOverIdx = ref(-1)
const defaultCount = defaults.length

const displayList = computed(() => [...defaults, ...customActions.value])

function show(items: QAction[], cb: (items: QAction[]) => void) {
  customActions.value = JSON.parse(JSON.stringify(items))
  onSave = cb
  visible.value = true
}

function close() { visible.value = false; dragIdx.value = -1; dragOverIdx.value = -1 }

function onDragStart(i: number) {
  dragIdx.value = i
}

function onDrop() {
  if (dragIdx.value < 0 || dragOverIdx.value < 0) return
  const from = dragIdx.value - defaultCount
  const to = dragOverIdx.value - defaultCount
  if (from >= 0 && to >= 0 && from < customActions.value.length && to < customActions.value.length) {
    const item = customActions.value.splice(from, 1)[0]
    customActions.value.splice(to, 0, item)
  }
  dragIdx.value = -1
  dragOverIdx.value = -1
}

function removeAt(i: number) { customActions.value.splice(i, 1) }
function save() { onSave?.(customActions.value); close() }

defineExpose({ show })
</script>

<style scoped>
.dialog-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 9999; }
.dialog-card { background: var(--md-sys-color-surface-container-high); border-radius: var(--md-sys-shape-corner-large); padding: 24px; width: 520px; max-width: 90vw; display: flex; flex-direction: column; gap: 20px; box-shadow: var(--md-elevation-level5); }
.dialog-title { font-size: 18px; font-weight: 700; }
.action-list { display: flex; flex-direction: column; gap: 4px; max-height: 420px; overflow-y: auto; padding: 4px 0; }
.action-item { display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: var(--md-sys-color-surface-container-high); border-radius: var(--md-sys-shape-corner-small); border: 2px solid transparent; transition: border-color 0.15s, opacity 0.15s; }
.action-item.is-default { opacity: 0.7; }
.action-item.drag-over { border-color: var(--md-sys-color-primary); }
.action-item[draggable="true"] { cursor: default; }
.drag-handle { display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; cursor: grab; color: var(--md-sys-color-outline); flex-shrink: 0; }
.drag-handle:hover { color: var(--md-sys-color-on-surface); }
.drag-handle:active { cursor: grabbing; }
.drag-handle.placeholder { width: 28px; }
.drag-handle .material-symbols-outlined { font-size: 18px; }
.action-icon { font-size: 18px; color: var(--md-sys-color-primary); flex-shrink: 0; }
.action-name { flex: 1; font-size: 14px; display: flex; align-items: center; gap: 6px; }
.default-badge { font-size: 10px; padding: 1px 6px; border-radius: 4px; background: var(--md-sys-color-surface-dim); color: var(--md-sys-color-outline); }
.mini-btn { width: 28px; height: 28px; border: none; border-radius: 4px; background: transparent; color: var(--md-sys-color-outline); cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.mini-btn:hover { background: var(--md-sys-color-surface-container-highest); color: var(--md-sys-color-on-surface); }
.del-btn:hover { background: var(--md-sys-color-error-container); color: var(--md-sys-color-error); }
.mini-btn .material-symbols-outlined { font-size: 16px; }
.empty-state { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 32px; color: var(--md-sys-color-outline); }
.dialog-actions { display: flex; justify-content: flex-end; gap: 8px; }
</style>