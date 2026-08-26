<script setup lang="ts">
import type { JvmMetrics } from '../../types/monitor'
import ResourceBar from './ResourceBar.vue'
import { fmtBytes, fmtDuration } from '../../utils/format'

defineProps<{ jvm?: JvmMetrics }>()
</script>

<template>
  <div class="rounded-box border border-base-300 bg-base-100 p-5">
    <div class="flex items-baseline justify-between">
      <h3 class="text-base font-semibold tracking-tight">JVM</h3>
      <span v-if="jvm" class="text-xs text-base-content/50">
        {{ jvm.jvmName }} · {{ jvm.javaVersion }}
      </span>
    </div>

    <template v-if="jvm">
      <div class="mt-4 flex flex-col gap-4">
        <ResourceBar
          label="堆内存"
          :percent="jvm.heap.usagePercent"
          :detail="`${fmtBytes(Number(jvm.heap.usedBytes))} / ${fmtBytes(Number(jvm.heap.maxBytes))}`"
        />
        <ResourceBar
          label="非堆(Metaspace 等)"
          :percent="Number(jvm.nonHeapCommittedBytes) ? (Number(jvm.nonHeapUsedBytes) / Number(jvm.nonHeapCommittedBytes)) * 100 : null"
          :detail="`${fmtBytes(Number(jvm.nonHeapUsedBytes))} / ${fmtBytes(Number(jvm.nonHeapCommittedBytes))}`"
        />
      </div>

      <div class="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:grid-cols-4">
        <div>
          <div class="text-xs text-base-content/50">运行时长</div>
          <div class="tabular-nums">{{ fmtDuration(Number(jvm.uptimeMs)) }}</div>
        </div>
        <div>
          <div class="text-xs text-base-content/50">线程(活跃/峰值)</div>
          <div class="tabular-nums">{{ jvm.threads.live }} / {{ jvm.threads.peak }}</div>
        </div>
        <div>
          <div class="text-xs text-base-content/50">守护线程</div>
          <div class="tabular-nums">{{ jvm.threads.daemon }}</div>
        </div>
        <div>
          <div class="text-xs text-base-content/50">累计启动</div>
          <div class="tabular-nums">{{ Number(jvm.threads.started) }}</div>
        </div>
      </div>

      <div v-if="jvm.gcs.length" class="mt-4 flex flex-wrap gap-2">
        <span
          v-for="g in jvm.gcs"
          :key="g.collector"
          class="badge badge-ghost badge-sm font-normal"
          :title="`GC 次数 ${Number(g.count)},累计耗时 ${Number(g.totalTimeMs)}ms`"
        >
          {{ g.collector }}:{{ Number(g.count) }} 次 · {{ fmtDuration(Number(g.totalTimeMs)) }}
        </span>
      </div>

      <div v-if="jvm.pools.length" class="mt-4 flex flex-wrap gap-2">
        <span
          v-for="p in jvm.pools"
          :key="p.name"
          class="badge badge-outline badge-sm font-normal"
          :title="`${fmtBytes(Number(p.usedBytes))} / ${fmtBytes(Number(p.maxBytes))}`"
        >
          {{ p.name }}
        </span>
      </div>
    </template>

    <p v-else class="mt-4 text-sm text-base-content/50">加载中…</p>
  </div>
</template>
