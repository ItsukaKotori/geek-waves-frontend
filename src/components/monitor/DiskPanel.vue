<script setup lang="ts">
import type { DiskMetrics } from '../../types/monitor'
import { fmtBytes, fmtPercent } from '../../utils/format'

defineProps<{ disks: DiskMetrics[] }>()

function tone(p: number): string {
  if (p >= 90) return 'badge-error'
  if (p >= 70) return 'badge-warning'
  return 'badge-ghost'
}
</script>

<template>
  <div class="rounded-box border border-base-300 bg-base-100 p-5">
    <h3 class="text-base font-semibold tracking-tight">磁盘</h3>

    <div v-if="disks.length" class="mt-3 overflow-x-auto">
      <table class="table table-sm">
        <thead class="text-xs font-medium uppercase tracking-wider text-base-content/50">
          <tr>
            <th>挂载点</th>
            <th>文件系统</th>
            <th>已用 / 总量</th>
            <th>可用</th>
            <th>使用率</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="d in disks" :key="d.mount + d.name">
            <td class="font-mono text-xs">{{ d.mount }}</td>
            <td class="text-xs text-base-content/60">{{ d.fsType || '—' }}</td>
            <td class="whitespace-nowrap tabular-nums">
              {{ fmtBytes(Number(d.totalBytes) - Number(d.availableBytes)) }} / {{ fmtBytes(Number(d.totalBytes)) }}
            </td>
            <td class="tabular-nums">{{ fmtBytes(Number(d.availableBytes)) }}</td>
            <td>
              <span class="badge badge-sm" :class="tone(d.usagePercent)">
                {{ fmtPercent(d.usagePercent, 0) }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <p v-else class="mt-3 text-sm text-base-content/50">未检测到磁盘挂载点(容器环境常见)。</p>
  </div>
</template>
