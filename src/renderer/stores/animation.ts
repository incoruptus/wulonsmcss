import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useAnimationStore = defineStore('animation', () => {
  const enabled = ref(true)

  function toggle() {
    enabled.value = !enabled.value
    apply()
  }

  function setEnabled(v: boolean) {
    enabled.value = v
    apply()
  }

  function apply() {
    const root = document.documentElement
    if (enabled.value) {
      root.style.removeProperty('--anim-modifier')
    } else {
      root.style.setProperty('--anim-modifier', '0')
    }
  }

  // Load from config
  async function load() {
    try {
      const cfg = await window.electronAPI?.readConfig()
      if (cfg?.animationsEnabled !== undefined) {
        enabled.value = cfg.animationsEnabled
        apply()
      }
    } catch(e) {}
  }

  // Save to config
  async function save() {
    try {
      const cfg = await window.electronAPI?.readConfig() || {}
      cfg.animationsEnabled = enabled.value
      await window.electronAPI?.writeConfig(cfg)
    } catch(e) {}
  }

  return { enabled, toggle, setEnabled, load, save, apply }
})