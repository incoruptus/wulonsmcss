<template>
  <div class="frp-view">
    <div class="page-header">
      <h1 class="page-title">FRP 隧道</h1>
    </div>

    <section class="frp-section">
      <h2 class="section-title">配置</h2>
      <div class="frp-config">
        <md-outlined-text-field v-model="accessKey" label="SAKURA FRP 访问密钥" type="password">
          <md-icon slot="leadingicon">key</md-icon>
        </md-outlined-text-field>
        <md-outlined-text-field v-model="frpPath" label="FRP 可执行文件路径" type="text">
          <md-icon slot="leadingicon">folder</md-icon>
        </md-outlined-text-field>
        <md-filled-button @click="saveFrpConfig">
          <md-icon slot="icon">save</md-icon>
          保存
        </md-filled-button>
      </div>
    </section>

    <section class="frp-section">
      <h2 class="section-title">状态</h2>
      <div class="frp-status-card">
        <div class="status-indicator">
          <span class="status-dot" :class="frpConnected ? 'connected' : 'disconnected'"></span>
          <span class="status-label">{{ frpConnected ? '已连接' : '未连接' }}</span>
        </div>
        <div v-if="frpConnected" class="status-details">
          <div class="detail-row">
            <span class="detail-key">连接地址</span>
            <span class="detail-val code">{{ frpAddress }}</span>
            <button class="copy-btn" @click="copyAddress" title="复制">
              <span class="material-symbols-outlined">content_copy</span>
            </button>
          </div>
          <div class="detail-row">
            <span class="detail-key">本地端口</span>
            <span class="detail-val">25565 → MC 服务器</span>
          </div>
        </div>
      </div>
      <div class="frp-actions">
        <md-filled-button v-if="!frpConnected" @click="connectFrp">
          <md-icon slot="icon">power_settings_new</md-icon>
          连接
        </md-filled-button>
        <md-filled-button v-else @click="disconnectFrp" style="--md-filled-button-container-color: var(--md-sys-color-error);">
          <md-icon slot="icon">power_off</md-icon>
          断开
        </md-filled-button>
        <md-outlined-button @click="refreshStatus">
          <md-icon slot="icon">refresh</md-icon>
          刷新状态
        </md-outlined-button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const accessKey = ref('')
const frpPath = ref('')
const frpConnected = ref(false)
const frpAddress = ref('')

async function saveFrpConfig() {
  try {
    await window.electronAPI.writeConfig({ frpAccessKey: accessKey.value, frpPath: frpPath.value })
  } catch(e) {}
}

async function connectFrp() {
  await window.electronAPI.startFrp({ accessKey: accessKey.value, frpPath: frpPath.value })
  frpConnected.value = true
}

async function disconnectFrp() {
  await window.electronAPI.stopFrp()
  frpConnected.value = false
  frpAddress.value = ''
}

async function refreshStatus() {
}
function copyAddress() {
  navigator.clipboard.writeText(frpAddress.value)
}
</script>

<style scoped>
.frp-view { max-width: 600px; margin: 0 auto; width: 100%; }

.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.page-title { font-size: 22px; font-weight: 700; }

.frp-section {
  background: var(--md-sys-color-surface-container);
  border-radius: var(--md-sys-shape-corner-medium);
  padding: 20px;
  margin-bottom: 16px;
}

.section-title { font-size: 15px; font-weight: 600; margin-bottom: 12px; }

.frp-config { display: flex; flex-direction: column; gap: 12px; }

.frp-status-card {
  display: flex; flex-direction: column; gap: 12px;
  padding: 16px;
  background: var(--md-sys-color-surface-container-high);
  border-radius: var(--md-sys-shape-corner-medium);
}

.status-indicator { display: flex; align-items: center; gap: 8px; }

.status-dot {
  width: 10px; height: 10px;
  border-radius: 50%;
}

.status-dot.connected { background: var(--md-sys-color-primary); box-shadow: 0 0 8px var(--md-sys-color-primary); }
.status-dot.disconnected { background: var(--md-sys-color-outline); }

.status-label { font-size: 14px; font-weight: 600; }

.status-details { display: flex; flex-direction: column; gap: 8px; }

.detail-row { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.detail-key { color: var(--md-sys-color-outline); min-width: 80px; }
.detail-val { font-weight: 600; }
.detail-val.code { font-family: var(--font-mono); font-size: 12px; }

.copy-btn {
  width: 28px; height: 28px; border: none; border-radius: var(--md-sys-shape-corner-small);
  background: transparent; color: var(--md-sys-color-outline); cursor: pointer;
  display: flex; align-items: center; justify-content: center;
}

.copy-btn:hover { background: var(--md-sys-color-surface-container-highest); color: var(--md-sys-color-on-surface); }
.copy-btn .material-symbols-outlined { font-size: 16px; }

.frp-actions { display: flex; gap: 8px; margin-top: 12px; }
</style>