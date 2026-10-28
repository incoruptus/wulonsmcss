import { defineConfig, presetUno, transformerDirectives } from 'unocss'

export default defineConfig({
  presets: [presetUno()],
  transformers: [transformerDirectives()],
  shortcuts: {
    'flex-center': 'flex items-center justify-center',
    'flex-between': 'flex items-center justify-between',
    'glass-card': 'bg-white/10 backdrop-blur-2xl rounded-2xl border border-white/20 shadow-lg'
  }
})