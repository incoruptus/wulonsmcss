<template>
  <div class="segmented-buttons">
    <button
      v-for="opt in options"
      :key="opt.value"
      class="segment"
      :class="{ selected: modelValue === opt.value }"
      @click="$emit('update:modelValue', opt.value)"
    >
      <span v-if="opt.icon" class="material-symbols-outlined">{{ opt.icon }}</span>
      {{ opt.label }}
    </button>
  </div>
</template>

<script setup lang="ts">
interface SegmentOption {
  value: string
  label: string
  icon?: string
}

defineProps<{
  options: SegmentOption[]
  modelValue: string
}>()

defineEmits<{
  'update:modelValue': [value: string]
}>()
</script>

<style scoped>
.segmented-buttons {
  display: inline-flex;
  border: 1px solid var(--md-sys-color-outline);
  border-radius: var(--md-sys-shape-corner-full);
  overflow: hidden;
  height: 36px;
  width: fit-content;
}

.segment {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 20px;
  border: none;
  background: transparent;
  color: var(--md-sys-color-on-surface-variant);
  font-family: var(--font-ui);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  white-space: nowrap;
  min-width: 0;
  line-height: 1;
}

.segment + .segment {
  border-left: 1px solid var(--md-sys-color-outline);
}

.segment:hover {
  background: var(--md-sys-color-surface-container-high);
}

.segment.selected {
  background: var(--md-sys-color-secondary-container);
  color: var(--md-sys-color-on-secondary-container);
}

.segment.selected:hover {
  background: var(--md-sys-color-secondary-container);
}

.segment .material-symbols-outlined {
  font-size: 16px;
}
</style>