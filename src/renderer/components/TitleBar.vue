<template>
  <header class="titlebar">
    <div class="drag-region" @dblclick="maximize">
      <span class="title">{{ appStore.title }}</span>
      <span class="subtitle">{{ appStore.subtitle }}</span>
    </div>
    <div class="window-controls">
      <button class="control-btn" @click="minimize" title="最小化">
        <span class="material-symbols-outlined">minimize</span>
      </button>
      <button class="control-btn" @click="maximize" title="最大化">
        <span class="material-symbols-outlined">check_box_outline_blank</span>
      </button>
      <button class="control-btn close-btn" @click="close" title="关闭">
        <span class="material-symbols-outlined">close</span>
      </button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { useAppStore } from '@/stores/app'

const appStore = useAppStore()

const minimize = () => window.electronAPI.minimize()
const maximize = () => window.electronAPI.maximize()
const close = () => window.electronAPI.close()
</script>

<style scoped>
.titlebar {
  display: flex;
  align-items: center;
  height: 40px;
  background: var(--md-sys-color-surface-container);
  border-bottom: 1px solid var(--md-sys-color-outline-variant);
  user-select: none;
  flex-shrink: 0;
}

.drag-region {
  flex: 1;
  height: 100%;
  -webkit-app-region: drag;
  display: flex;
  align-items: center;
  gap: 8px;
  padding-left: 16px;
}

.title {
  font-size: 14px;
  font-weight: 600;
  color: var(--md-sys-color-on-surface);
}

.subtitle {
  font-size: 11px;
  color: var(--md-sys-color-outline);
}

.window-controls {
  display: flex;
  height: 100%;
  -webkit-app-region: no-drag;
}

.control-btn {
  width: 46px;
  height: 100%;
  border: none;
  background: transparent;
  color: var(--md-sys-color-on-surface);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.12s;
}

.control-btn:hover {
  background: var(--md-sys-color-surface-container-high);
}

.control-btn .material-symbols-outlined {
  font-size: 18px;
}

.close-btn:hover {
  background: #e81123;
  color: white;
}
</style>