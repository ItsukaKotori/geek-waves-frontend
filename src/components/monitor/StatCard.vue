<script setup lang="ts">
defineProps<{
  label: string
  value: string
  hint?: string
}>()
</script>

<template>
  <div class="rounded-box border border-base-300 bg-base-100 p-4">
    <div class="text-xs font-medium uppercase tracking-wider text-base-content/50">
      {{ label }}
    </div>
    <div class="mt-1.5 text-2xl font-semibold tracking-tight tabular-nums">{{ value }}</div>
    <div v-if="hint" class="mt-1 text-xs text-base-content/50">{{ hint }}</div>
  </div>
</template>
