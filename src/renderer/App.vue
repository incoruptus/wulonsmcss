<template>
  <div class="app-shell">
    <TitleBar />
    <div class="app-body">
      <Sidebar />
      <main class="main-content">
        <router-view v-slot="{ Component }">
          <transition :name="transName" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </main>
    </div>
    <ToastContainer />
    <SetupDialog />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useAppStore } from '@/stores/app'
import { useAnimationStore } from '@/stores/animation'
import TitleBar from '@/components/TitleBar.vue'
import Sidebar from '@/components/Sidebar.vue'
import ToastContainer from '@/components/ToastContainer.vue'
import SetupDialog from '@/components/SetupDialog.vue'

const app = useAppStore()
const anim = useAnimationStore()

onMounted(async () => {
  try {
    await anim.load()
    await app.loadConfig()
  } catch(e) {
    console.error('Failed to load config:', e)
  }
  document.documentElement.setAttribute('data-theme', app.theme)
  app.setPrimaryColor(app.primaryColor)
})

const transName = computed(() => anim.enabled ? 'page' : 'fade')
</script>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--md-sys-color-surface);
}

.app-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  padding: 24px;
  padding-right: 16px;
  background: var(--md-sys-color-surface-container-low);
  scrollbar-gutter: stable;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>