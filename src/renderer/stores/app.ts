import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export type WallpaperMode = 'image' | 'gradient'

export const useAppStore = defineStore('app', () => {
  const theme = ref<'light' | 'dark'>('light')
  const title = ref('乌龙味开服茶')
  const subtitle = 'Wulon\'s Minecraft Server Starter'
  const sidebarCollapsed = ref(false)

  // Wallpaper - only for custom override; null = use default theme gradient
  const wallpaperMode = ref<WallpaperMode | null>(null)
  const wallpaperValue = ref('')

  const primaryColor = ref('#6d4c41')

  const hasCustomWallpaper = computed(() => !!wallpaperValue.value)
  const wallpaperBrightness = ref(0.5) // 0=dark, 1=light
  const wallpaperIsDark = computed(() => hasCustomWallpaper.value && wallpaperBrightness.value < 0.5)

  // Base64 cached wallpaper data for immediate display
  const wallpaperDataUrl = ref('')

  // Convert local file path to proper URL for CSS background-image
  const wallpaperUrl = computed(() => {
    if (wallpaperDataUrl.value) return wallpaperDataUrl.value
    const v = wallpaperValue.value
    if (!v) return ''
    if (v.startsWith('linear-gradient') || v.startsWith('url(') || v.startsWith('data:')) return v
    if (v.startsWith('file://')) return v
    const abs = v.replace(/\\/g, '/')
    if (abs.match(/^[A-Za-z]:\//)) {
      return 'file:///' + abs
    }
    return v
  })

  function hexToRgb(hex: string) {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    return { r, g, b }
  }

  function rgbToHex(r: number, g: number, b: number) {
    return '#' + [r, g, b].map(c => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('')
  }

  function lighten(hex: string, amount: number) {
    const { r, g, b } = hexToRgb(hex)
    return rgbToHex(r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount)
  }

  function darken(hex: string, amount: number) {
    const { r, g, b } = hexToRgb(hex)
    return rgbToHex(r * (1 - amount), g * (1 - amount), b * (1 - amount))
  }

  function setPrimaryColor(color: string) {
    primaryColor.value = color

    const p = color

    // Accent palette — used by buttons, switches, tabs (always full-strength primary)
    const lightPc = lighten(p, 0.72)  // primary-container (very subtle tint)
    const darkPc = darken(p, 0.55)    // on-primary-container (text on light container)
    const lightSc = lighten(p, 0.55)  // secondary-container (subtle, but visible)
    const darkSc = darken(p, 0.35)    // on-secondary-container

    // Dark mode accent palette — containers stay near-neutral
    const pDark = lighten(p, 0.35)
    const onPd = '#ffffff'
    const pcDark = lighten(p, 0.10)   // primary-container in dark (very muted)
    const opcDark = lighten(p, 0.70)
    const sDark = lighten(p, 0.30)    // secondary (muted)
    const onSd = '#ffffff'
    const scDark = darken(p, 0.05)    // secondary-container (barely tinted)
    const onScDark = lighten(p, 0.55)
    // Light mode: near white
    const surf = '#fcfdf7'
    const onSurf = '#1a1c1a'
    const onSurfVar = '#484b48'
    const surfCont = '#f0f1eb'
    const surfContHigh = '#e8e9e3'
    const surfContHighest = '#dee0da'
    const surfContLow = '#f6f7f1'
    const surfContLowest = '#ffffff'
    const surfDim = '#dadbd5'
    const surfBright = '#fcfdf7'
    const outline = '#6f7670'
    const outlineVar = '#b9c0b9'

    // Dark mode: near black
    const surfDark = '#1a1c1a'
    const onSurfDark = '#e2e3dd'
    const onSurfVarDark = '#c2c7bd'
    const surfContDark = '#262826'
    const surfContHighDark = '#303230'
    const surfContHighestDark = '#3b3d3b'
    const surfContLowDark = '#1e201e'
    const surfContLowestDark = '#121412'
    const surfDimDark = '#1a1c1a'
    const surfBrightDark = '#434541'
    const outlineDark = '#8b9389'
    const outlineVarDark = '#43483e'

    let style = document.getElementById('theme-override')
    if (!style) {
      style = document.createElement('style')
      style.id = 'theme-override'
      document.head.appendChild(style)
    }

    style.textContent = `
      :root, [data-theme="light"] {
        --md-sys-color-primary: ${p} !important;
        --md-sys-color-on-primary: #ffffff !important;
        --md-sys-color-primary-container: ${lightPc} !important;
        --md-sys-color-on-primary-container: ${darkPc} !important;
        --md-sys-color-secondary: ${p} !important;
        --md-sys-color-on-secondary: #ffffff !important;
        --md-sys-color-secondary-container: ${lightSc} !important;
        --md-sys-color-on-secondary-container: ${darkSc} !important;
        --md-sys-color-tertiary: ${p} !important;
        --md-sys-color-on-tertiary: #ffffff !important;
        --md-sys-color-tertiary-container: ${lightSc} !important;
        --md-sys-color-on-tertiary-container: ${darkSc} !important;
        --md-sys-color-error: #ba1a1a !important;
        --md-sys-color-on-error: #ffffff !important;
        --md-sys-color-error-container: #ffdad6 !important;
        --md-sys-color-on-error-container: #410002 !important;
        --md-sys-color-surface: ${surf} !important;
        --md-sys-color-on-surface: ${onSurf} !important;
        --md-sys-color-surface-container: ${surfCont} !important;
        --md-sys-color-surface-container-high: ${surfContHigh} !important;
        --md-sys-color-surface-container-highest: ${surfContHighest} !important;
        --md-sys-color-surface-container-low: ${surfContLow} !important;
        --md-sys-color-surface-container-lowest: ${surfContLowest} !important;
        --md-sys-color-surface-dim: ${surfDim} !important;
        --md-sys-color-surface-bright: ${surfBright} !important;
        --md-sys-color-on-surface-variant: ${onSurfVar} !important;
        --md-sys-color-outline: ${outline} !important;
        --md-sys-color-outline-variant: ${outlineVar} !important;
        --md-sys-color-shadow: #000000 !important;
        --md-sys-color-scrim: #000000 !important;
        --md-sys-color-inverse-surface: ${onSurf} !important;
        --md-sys-color-inverse-on-surface: ${surf} !important;
        --md-sys-color-inverse-primary: ${lighten(p, 0.25)} !important;
        --md-filled-button-container-color: ${p} !important;
        --md-outlined-button-container-color: ${p} !important;
        --md-switch-selected-track-color: ${p} !important;
        --md-switch-selected-hover-track-color: ${p} !important;
        --md-switch-selected-pressed-track-color: ${p} !important;
        --md-switch-selected-focus-track-color: ${p} !important;
        --md-switch-selected-handle-color: #ffffff !important;
        --md-switch-selected-hover-handle-color: #ffffff !important;
        --md-switch-selected-pressed-handle-color: #ffffff !important;
        --md-switch-selected-focus-handle-color: #ffffff !important;
        --md-outlined-text-field-focus-outline-color: ${p} !important;
        --md-outlined-select-text-field-focus-outline-color: ${p} !important;
      }
      [data-theme="dark"] {
        --md-sys-color-primary: ${pDark} !important;
        --md-sys-color-on-primary: ${onPd} !important;
        --md-sys-color-primary-container: ${pcDark} !important;
        --md-sys-color-on-primary-container: ${opcDark} !important;
        --md-sys-color-secondary: ${sDark} !important;
        --md-sys-color-on-secondary: ${onSd} !important;
        --md-sys-color-secondary-container: ${scDark} !important;
        --md-sys-color-on-secondary-container: ${onScDark} !important;
        --md-sys-color-tertiary: ${sDark} !important;
        --md-sys-color-on-tertiary: ${onSd} !important;
        --md-sys-color-tertiary-container: ${scDark} !important;
        --md-sys-color-on-tertiary-container: ${onScDark} !important;
        --md-sys-color-error: #ffb4ab !important;
        --md-sys-color-on-error: #690005 !important;
        --md-sys-color-error-container: #93000a !important;
        --md-sys-color-on-error-container: #ffdad6 !important;
        --md-sys-color-surface: ${surfDark} !important;
        --md-sys-color-on-surface: ${onSurfDark} !important;
        --md-sys-color-surface-container: ${surfContDark} !important;
        --md-sys-color-surface-container-high: ${surfContHighDark} !important;
        --md-sys-color-surface-container-highest: ${surfContHighestDark} !important;
        --md-sys-color-surface-container-low: ${surfContLowDark} !important;
        --md-sys-color-surface-container-lowest: ${surfContLowestDark} !important;
        --md-sys-color-surface-dim: ${surfDimDark} !important;
        --md-sys-color-surface-bright: ${surfBrightDark} !important;
        --md-sys-color-on-surface-variant: ${onSurfVarDark} !important;
        --md-sys-color-outline: ${outlineDark} !important;
        --md-sys-color-outline-variant: ${outlineVarDark} !important;
        --md-sys-color-shadow: #000000 !important;
        --md-sys-color-scrim: #000000 !important;
        --md-sys-color-inverse-surface: ${onSurfDark} !important;
        --md-sys-color-inverse-on-surface: ${surfDark} !important;
        --md-sys-color-inverse-primary: ${lighten(p, 0.25)} !important;
        --md-filled-button-container-color: ${pDark} !important;
        --md-outlined-button-container-color: ${pDark} !important;
        --md-switch-selected-track-color: ${lighten(p, 0.4)} !important;
        --md-switch-selected-hover-track-color: ${lighten(p, 0.45)} !important;
        --md-switch-selected-pressed-track-color: ${lighten(p, 0.35)} !important;
        --md-switch-selected-focus-track-color: ${lighten(p, 0.4)} !important;
        --md-switch-selected-handle-color: ${onSurfDark} !important;
        --md-switch-selected-hover-handle-color: ${onSurfDark} !important;
        --md-switch-selected-pressed-handle-color: ${onSurfDark} !important;
        --md-switch-selected-focus-handle-color: ${onSurfDark} !important;
        --md-outlined-text-field-focus-outline-color: ${pDark} !important;
        --md-outlined-select-text-field-focus-outline-color: ${pDark} !important;
      }
    `
  }

  function setWallpaper(value: string, mode?: WallpaperMode, dataUrl?: string, brightness?: number) {
    wallpaperValue.value = value
    if (mode) wallpaperMode.value = mode
    if (dataUrl) wallpaperDataUrl.value = dataUrl
    if (brightness !== undefined) wallpaperBrightness.value = brightness
  }

  function clearWallpaper() {
    wallpaperValue.value = ''
    wallpaperMode.value = null
  }

  async function loadConfig() {
    try {
      const cfg = await (window as any).electronAPI?.readConfig()
      if (!cfg) return
      if (cfg.theme) theme.value = cfg.theme
      if (cfg.title) title.value = cfg.title
      if (cfg.primaryColor) setPrimaryColor(cfg.primaryColor)
      if (cfg.wallpaperMode) wallpaperMode.value = cfg.wallpaperMode
      if (cfg.wallpaperValue) wallpaperValue.value = cfg.wallpaperValue
      if (cfg.wallpaperBrightness !== undefined) wallpaperBrightness.value = cfg.wallpaperBrightness
    } catch(e) {}
  }

  async function toggleTheme() {
    theme.value = theme.value === 'light' ? 'dark' : 'light'
    document.documentElement.setAttribute('data-theme', theme.value)
    setPrimaryColor(primaryColor.value) // re-inject CSS with correct data-theme
    try {
      const cfg = await (window as any).electronAPI?.readConfig() || {}
      cfg.theme = theme.value
      await (window as any).electronAPI?.writeConfig(cfg)
    } catch(e) {}
  }

  return {
    theme, title, subtitle, sidebarCollapsed,
    wallpaperMode, wallpaperValue, wallpaperDataUrl, wallpaperUrl, hasCustomWallpaper, wallpaperBrightness, wallpaperIsDark,
    primaryColor,
    toggleTheme, setWallpaper, clearWallpaper, setPrimaryColor, loadConfig
  }
})