<template>
  <div class="toast-container">
    <transition-group name="toast">
      <div
        v-for="n in visibleNotifications"
        :key="n.id"
        class="toast-item"
        :class="'toast-' + n.type"
      >
        <div class="toast-header">
          <span class="material-symbols-outlined toast-icon">{{ iconMap[n.type] }}</span>
          <span class="toast-title">{{ n.title }}</span>
          <span class="toast-time">{{ formatTime(n.timestamp) }}</span>
        </div>
        <div class="toast-body">
          <p class="toast-message">{{ n.message }}</p>
          <div v-if="n.details" class="toast-details">
            <button class="detail-toggle" @click="n._expanded = !n._expanded">
              {{ n._expanded ? '收起详情' : '展开详情' }}
            </button>
            <pre v-if="n._expanded" class="detail-content">{{ n.details }}</pre>
          </div>
        </div>
        <div class="toast-actions">
          <button class="action-btn" @click="copyToast(n)" title="复制">
            <span class="material-symbols-outlined">content_copy</span>
          </button>
          <button class="action-btn" @click="notificationStore.dismiss(n.id)" title="关闭">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
      </div>
    </transition-group>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useNotificationStore, type Notification } from '@/stores/notifications'

const notificationStore = useNotificationStore()

const visibleNotifications = computed(() =>
  notificationStore.notifications.filter(n => !n.dismissed)
)

const iconMap: Record<string, string> = {
  info: 'info',
  success: 'check_circle',
  warning: 'warning',
  error: 'error'
}

function formatTime(date: Date) {
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

function copyToast(n: Notification) {
  const text = `[${n.title}] ${n.message}${n.details ? '\n' + n.details : ''}`
  navigator.clipboard.writeText(text)
}
</script>

<style scoped>
.toast-container {
  position: fixed;
  top: 52px;
  right: 16px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 400px;
  pointer-events: none;
}

.toast-item {
  background: var(--md-sys-color-surface-container-high);
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: var(--md-sys-shape-corner-medium);
  padding: 12px 16px;
  box-shadow: var(--md-elevation-level3);
  pointer-events: auto;
  min-width: 320px;
}

.toast-item.toast-error {
  border-left: 3px solid var(--md-sys-color-error);
}

.toast-item.toast-warning {
  border-left: 3px solid #f4b740;
}

.toast-item.toast-success {
  border-left: 3px solid var(--md-sys-color-primary);
}

.toast-item.toast-info {
  border-left: 3px solid var(--md-sys-color-outline);
}

.toast-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.toast-icon {
  font-size: 18px;
}

.toast-error .toast-icon { color: var(--md-sys-color-error); }
.toast-warning .toast-icon { color: #f4b740; }
.toast-success .toast-icon { color: var(--md-sys-color-primary); }

.toast-title {
  flex: 1;
  font-size: 13px;
  font-weight: 600;
}

.toast-time {
  font-size: 11px;
  color: var(--md-sys-color-outline);
}

.toast-message {
  font-size: 12px;
  color: var(--md-sys-color-on-surface-variant);
  line-height: 1.4;
}

.toast-details {
  margin-top: 4px;
}

.detail-toggle {
  background: none;
  border: none;
  color: var(--md-sys-color-primary);
  font-size: 12px;
  cursor: pointer;
  font-family: var(--font-ui);
  padding: 2px 0;
}

.detail-content {
  margin-top: 6px;
  padding: 8px;
  background: var(--md-sys-color-surface-dim);
  border-radius: var(--md-sys-shape-corner-extra-small);
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.5;
  overflow-x: auto;
  white-space: pre-wrap;
  color: var(--md-sys-color-on-surface);
}

.toast-actions {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
  margin-top: 6px;
}

.action-btn {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  border-radius: var(--md-sys-shape-corner-small);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--md-sys-color-outline);
  transition: background 0.12s, color 0.12s;
}

.action-btn:hover {
  background: var(--md-sys-color-surface-container-highest);
  color: var(--md-sys-color-on-surface);
}

.action-btn .material-symbols-outlined {
  font-size: 16px;
}

.toast-enter-active {
  transition: all 0.25s ease;
}

.toast-leave-active {
  transition: all 0.2s ease;
}

.toast-enter-from {
  opacity: 0;
  transform: translateX(40px);
}

.toast-leave-to {
  opacity: 0;
  transform: translateX(40px);
}
</style>