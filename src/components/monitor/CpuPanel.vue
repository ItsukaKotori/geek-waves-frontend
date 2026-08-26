<script setup lang="ts">
import type { CpuMetrics } from '../../types/monitor'
import { fmtPercent } from '../../utils/format'

defineProps<{ cpu?: CpuMetrics }>()
</script>

<template>
  <div class="rounded-box border border-base-300 bg-base-100 p-5">
    <div class="flex items-baseline justify-between">
      <h3 class="text-base font-semibold tracking-tight">CPU</h3>
      <span v-if="cpu" class="text-xs text-base-content/50">
        {{ cpu.physicalCores }} 物理核 / {{ cpu.logicalCores }} 逻辑核
      </span>
    </div>

    <template v-if="cpu">
      <div class="mt-4 flex items-end gap-6">
        <div class="text-3xl font-semibold tracking-tight tabular-nums">
          {{ fmtPercent(cpu.usagePercent, 1) }}
        </div>
        <div class="pb-1 text-xs text-base-content/60 tabular-nums">
          负载 {{ cpu.load1.toFixed(2) }} / {{ cpu.load5.toFixed(2) }} / {{ cpu.load15.toFixed(2) }}
        </div>
      </div>

      <div v-if="cpu.perCoreUsage.length" class="mt-4 flex flex-wrap gap-1.5">
        <div
          v-for="(u, i) in cpu.perCoreUsage"
          :key="i"
          class="flex h-10 w-2.5 flex-col justify-end overflow-hidden rounded-sm bg-base-200"
          :title="`核心 ${i}:${fmtPercent(u)}`"
        >
          <div
            class="w-full rounded-sm"
            :class="u >= 90 ? 'bg-error' : u >= 70 ? 'bg-warning' : 'bg-primary'"
            :style="{ height: `${Math.max(4, Math.min(100, u))}%` }"
          ></div>
        </div>
      </div>
    </template>

    <p v-else class="mt-4 text-sm text-base-content/50">采样中…</p>
  </div>
</template>
