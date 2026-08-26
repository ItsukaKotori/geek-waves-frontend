<script setup lang="ts">
import type { NetMetrics } from '../../types/monitor'
import { fmtSpeed } from '../../utils/format'

defineProps<{ networks: NetMetrics[] }>()
</script>

<template>
  <div class="rounded-box border border-base-300 bg-base-100 p-5">
    <h3 class="text-base font-semibold tracking-tight">网络</h3>

    <div v-if="networks.length" class="mt-3 overflow-x-auto">
      <table class="table table-sm">
        <thead class="text-xs font-medium uppercase tracking-wider text-base-content/50">
          <tr>
            <th>接口</th>
            <th>↓ 下行速率</th>
            <th>↑ 上行速率</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="n in networks" :key="n.name">
            <td class="font-mono text-xs">{{ n.displayName || n.name }}</td>
            <td class="tabular-nums">{{ fmtSpeed(Number(n.rxBytesPerSec)) }}</td>
            <td class="tabular-nums">{{ fmtSpeed(Number(n.txBytesPerSec)) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <p v-else class="mt-3 text-sm text-base-content/50">未检测到活跃网卡。</p>
  </div>
</template>
