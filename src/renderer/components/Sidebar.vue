<template>
  <nav class="sidebar">
    <div class="nav-items">
      <router-link
        v-for="item in navItems"
        :key="item.path"
        :to="item.path"
        class="nav-item"
        :class="{ active: $route.path === item.path }"
      >
        <span class="material-symbols-outlined nav-icon">{{ item.icon }}</span>
        <span class="nav-label">{{ item.label }}</span>
      </router-link>
    </div>

    <div class="nav-footer">
      <div class="nav-divider"></div>
      <router-link to="/settings" class="nav-item" :class="{ active: $route.path === '/settings' }">
        <span class="material-symbols-outlined nav-icon">tune</span>
        <span class="nav-label">设置</span>
      </router-link>
      <button class="nav-item" @click="appStore.toggleTheme()">
        <span class="material-symbols-outlined nav-icon">
          {{ appStore.theme === 'light' ? 'dark_mode' : 'light_mode' }}
        </span>
        <span class="nav-label">{{ appStore.theme === 'light' ? '深色模式' : '浅色模式' }}</span>
      </button>
      <button class="nav-item" @click="refresh">
        <span class="material-symbols-outlined nav-icon">refresh</span>
        <span class="nav-label">刷新</span>
      </button>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'

const router = useRouter()
const appStore = useAppStore()

const navItems = [
  { path: '/', label: '仪表盘', icon: 'dashboard' },
  { path: '/console', label: '控制台', icon: 'terminal' },
  { path: '/config', label: '服务器配置', icon: 'settings' },
  { path: '/players', label: '玩家', icon: 'group' },
  { path: '/mods', label: 'Mod 管理', icon: 'extension' },
  { path: '/version', label: '版本比对', icon: 'compare_arrows' },
  { path: '/game', label: '游戏', icon: 'videogame_asset' },
  { path: '/frp', label: 'FRP 隧道', icon: 'router' },
  { path: '/worlds', label: '多世界', icon: 'public' }
]

const refresh = () => {
  router.go(0)
}
</script>

<style scoped>
.sidebar {
  width: 200px;
  background: var(--md-sys-color-surface-container);
  border-right: 1px solid var(--md-sys-color-outline-variant);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.nav-items {
  flex: 1;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.nav-footer {
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.nav-divider {
  height: 1px;
  background: var(--md-sys-color-outline-variant);
  margin: 6px 0;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 12px;
  border-radius: var(--md-sys-shape-corner-medium);
  color: var(--md-sys-color-on-surface);
  text-decoration: none;
  cursor: pointer;
  border: none;
  background: transparent;
  font-family: var(--font-ui);
  font-size: 14px;
  transition: background 0.12s;
  width: 100%;
  text-align: left;
}

.nav-item:hover {
  background: var(--md-sys-color-surface-container-high);
}

.nav-item.active {
  background: var(--md-sys-color-secondary-container);
  color: var(--md-sys-color-on-secondary-container);
}

.nav-icon {
  font-size: 20px;
  width: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.nav-label {
  font-size: 13px;
  font-weight: 500;
}
</style>