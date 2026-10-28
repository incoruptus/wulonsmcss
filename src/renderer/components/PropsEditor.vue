<template>
  <div class="props-editor">
    <div class="props-gutter">
      <div v-for="n in lineCount" :key="n" class="gl" :class="{ active: n === currentLine }">{{ n }}</div>
    </div>
    <div class="props-code" ref="codeRef" contenteditable="true" spellcheck="false"
      @input="onInput" @keydown="onKeydown" @click="onCursorMove" @keyup="onCursorMove" @paste="onPaste"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, onUnmounted } from 'vue'

const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const codeRef = ref<HTMLElement | null>(null)
const currentLine = ref(1)
const lineCount = ref(1)

function esc(s: string) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }

function hl(text: string) {
  return text.split('\n').map(line => {
    // Comment line
    if (line.trim().startsWith('#')) {
      return `<div><span class="cm">${esc(line)}</span></div>`
    }
    const eq = line.indexOf('=')
    if (eq === -1) return `<div>${esc(line)}</div>`
    const key = line.slice(0, eq)
    const val = line.slice(eq + 1)
    let valHtml = esc(val)
    // Color-code true/false values
    if (val.trim() === 'true') valHtml = `<span class="tv">${esc(val)}</span>`
    else if (val.trim() === 'false') valHtml = `<span class="fv">${esc(val)}</span>`
    return `<div><span class="k">${esc(key)}</span><span class="s">=</span>${valHtml}</div>`
  }).join('')
}

function getCaretLine(): number {
  const sel = window.getSelection()
  if (!sel || !sel.rangeCount || !codeRef.value) return 1
  const text = codeRef.value.textContent || ''
  const range = sel.getRangeAt(0)
  const pre = range.cloneRange()
  pre.selectNodeContents(codeRef.value)
  pre.setEnd(range.startContainer, range.startOffset)
  return pre.toString().split('\n').length
}

function getCaretOffset(): number {
  const sel = window.getSelection()
  if (!sel || !sel.rangeCount || !codeRef.value) return 0
  const range = sel.getRangeAt(0)
  const pre = range.cloneRange()
  pre.selectNodeContents(codeRef.value)
  pre.setEnd(range.startContainer, range.startOffset)
  return pre.toString().length
}

function setCaretOffset(off: number) {
  if (!codeRef.value) return
  const el = codeRef.value
  let ci = 0
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null)
  let n: Text | null
  while ((n = walk.nextNode() as Text | null)) {
    const len = (n.textContent || '').length
    if (ci + len >= off) {
      const r = document.createRange()
      r.setStart(n, Math.min(off - ci, len))
      r.collapse(true)
      window.getSelection()?.removeAllRanges()
      window.getSelection()?.addRange(r)
      return
    }
    ci += len
  }
}

function onInput() {
  const text = codeRef.value?.textContent || ''
  emit('update:modelValue', text)
  lineCount.value = Math.max(text.split('\n').length, 1)
  nextTick(() => currentLine.value = getCaretLine())
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Tab') { e.preventDefault(); document.execCommand('insertText', false, '  ') }
}

function onPaste(e: ClipboardEvent) {
  e.preventDefault()
  const text = e.clipboardData?.getData('text/plain') || ''
  document.execCommand('insertText', false, text)
}

function onCursorMove() { currentLine.value = getCaretLine() }

let debounceTimer: ReturnType<typeof setTimeout> | null = null
watch(() => props.modelValue, () => {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    if (!codeRef.value) return
    const off = getCaretOffset()
    codeRef.value.innerHTML = hl(props.modelValue)
    lineCount.value = Math.max(props.modelValue.split('\n').length, 1)
    if (off > 0) nextTick(() => setCaretOffset(Math.min(off, props.modelValue.length)))
  }, 600)
})

onUnmounted(() => { if (debounceTimer) clearTimeout(debounceTimer) })

watch(codeRef, (el) => {
  if (el) { el.innerHTML = hl(props.modelValue); lineCount.value = Math.max(props.modelValue.split('\n').length, 1) }
}, { once: true })
</script>

<style scoped>
.props-editor {
  display: flex; width: 100%; flex: 1; min-height: 0;
  border: 1px solid var(--md-sys-color-outline);
  border-radius: var(--md-sys-shape-corner-small);
  overflow: auto;
  font-family: 'Cascadia Code', 'Fira Code', 'JetBrains Mono', 'Consolas', monospace;
  font-size: 13px;
}

.props-gutter {
  flex-shrink: 0; width: 44px; padding: 0;
  background: var(--md-sys-color-surface-container);
  text-align: right; user-select: none;
  border-right: 1px solid var(--md-sys-color-outline-variant);
  position: sticky; left: 0; z-index: 1;
}

.gl {
  padding: 0 8px; font-size: 13px; line-height: 1.6; white-space: nowrap;
  height: 20.8px; color: var(--md-sys-color-outline);
}
.gl.active { background: var(--md-sys-color-primary-container); color: var(--md-sys-color-primary); font-weight: 700; }

.props-code {
  flex: 1; padding: 0 12px; min-height: 200px;
  outline: none; background: var(--md-sys-color-surface-dim); color: var(--md-sys-color-on-surface);
  font-size: 13px; line-height: 1.6;
}
.props-code:focus { background: var(--md-sys-color-surface-container-low); }
.props-code > div { min-height: 20.8px; }

:deep(.k) { color: #1565c0; font-weight: 600; }
:deep(.s) { color: #f9a825; }
:deep(.cm) { color: #757575; font-style: italic; }
:deep(.tv) { color: #2e7d32; font-weight: 600; }
:deep(.fv) { color: #c62828; font-weight: 600; }
</style>