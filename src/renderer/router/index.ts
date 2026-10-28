import { createRouter, createWebHashHistory } from 'vue-router'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'dashboard', component: () => import('@/views/Dashboard.vue'), meta: { title: '仪表盘', icon: 'dashboard' } },
    { path: '/console', name: 'console', component: () => import('@/views/Console.vue'), meta: { title: '控制台', icon: 'terminal' } },
    { path: '/config', name: 'config', component: () => import('@/views/ServerConfig.vue'), meta: { title: '服务器配置', icon: 'settings' } },
    { path: '/players', name: 'players', component: () => import('@/views/Players.vue'), meta: { title: '玩家', icon: 'group' } },
    { path: '/mods', name: 'mods', component: () => import('@/views/Mods.vue'), meta: { title: 'Mod 管理', icon: 'extension' } },
    { path: '/version', name: 'version', component: () => import('@/views/VersionCompare.vue'), meta: { title: '版本比对', icon: 'compare_arrows' } },
    { path: '/game', name: 'game', component: () => import('@/views/Game.vue'), meta: { title: '游戏', icon: 'videogame_asset' } },
    { path: '/frp', name: 'frp', component: () => import('@/views/Frp.vue'), meta: { title: 'FRP 隧道', icon: 'router' } },
    { path: '/worlds', name: 'worlds', component: () => import('@/views/Worlds.vue'), meta: { title: '多世界', icon: 'public' } },
    { path: '/settings', name: 'settings', component: () => import('@/views/Settings.vue'), meta: { title: '设置', icon: 'tune' } }
  ]
})

export default router