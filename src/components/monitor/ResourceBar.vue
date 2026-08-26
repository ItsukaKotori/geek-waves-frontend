<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  label: string
  /** 0-100;null/undefined 显示占位灰条 */
  percent?: number | null
  detail?: string
}>()

const value = computed(() =>
  props.percent == null || !Number.isFinite(props.percent) ? 0 : props.percent,
)

const tone = computed(() => {
  if (props.percent == null || !Number.isFinite(props.percent)) return 'progress-ghost'
  if (props.percent >= 90) return 'progress-error'
  if (props.percent >= 70) return 'progress-warning'
  return 'progress-primary'
})
</script>

<template>
  <div>
    <div class="flex items-baseline justify-between text-sm">
      <span class="font-medium">{{ label }}</span>
      <span v-if="detail" class="text-xs text-base-content/60 tabular-nums">{{ detail }}</span>
    </div>
    <progress
      class="progress mt-1.5 h-1.5 w-full"
      :class="tone"
      :value="value"
      max="100"
    ></progress>
  </div>
</template>
