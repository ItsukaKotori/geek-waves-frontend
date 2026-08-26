<script setup lang="ts">
import { computed } from 'vue'
import type { MemoryMetrics } from '../../types/monitor'
import ResourceBar from './ResourceBar.vue'
import { fmtBytes, fmtPercent } from '../../utils/format'

const props = defineProps<{ memory?: MemoryMetrics }>()

const swapPercent = computed(() => {
  const total = Number(props.memory?.swapTotalBytes ?? 0)
  if (!total) return null
  return (Number(props.memory?.swapUsedBytes ?? 0) / total) * 100
})
</script>

<template>
  <div class="rounded-box border border-base-300 bg-base-100 p-5">
    <div class="flex items-baseline justify-between">
      <h3 class="text-base font-semibold tracking-tight">内存</h3>
      <span v-if="memory" class="text-xl font-semibold tracking-tight tabular-nums">
        {{ fmtPercent(memory.usagePercent) }}
      </span>
    </div>

    <template v-if="memory">
      <div class="mt-4 flex flex-col gap-4">
        <ResourceBar
          label="物理内存"
          :percent="memory.usagePercent"
          :detail="`${fmtBytes(Number(memory.usedBytes))} / ${fmtBytes(Number(memory.totalBytes))}`"
        />
        <ResourceBar
          label="交换分区 Swap"
          :percent="swapPercent"
          :detail="`${fmtBytes(Number(memory.swapUsedBytes))} / ${fmtBytes(Number(memory.swapTotalBytes))}`"
        />
      </div>
    </template>

    <p v-else class="mt-4 text-sm text-base-content/50">采样中…</p>
  </div>
</template>
