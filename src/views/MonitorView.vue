<script setup lang="ts">
import { computed, ref } from 'vue'
import { fetchOverview, fetchProcesses, fetchTaskStatus } from '../api/monitor'
import PageHeader from '../components/ui/PageHeader.vue'
import UnderlineTabs from '../components/ui/UnderlineTabs.vue'
import CpuPanel from '../components/monitor/CpuPanel.vue'
import DiskPanel from '../components/monitor/DiskPanel.vue'
import JvmPanel from '../components/monitor/JvmPanel.vue'
import MemoryPanel from '../components/monitor/MemoryPanel.vue'
import NetworkPanel from '../components/monitor/NetworkPanel.vue'
import ProcessTable from '../components/monitor/ProcessTable.vue'
import ProbeTargetManager from '../components/monitor/ProbeTargetManager.vue'
import StatCard from '../components/monitor/StatCard.vue'
import TaskStatusPanel from '../components/monitor/TaskStatusPanel.vue'
import { usePolling } from '../composables/usePolling'
import type { Overview, ProcessSnapshot, TaskStatus } from '../types/monitor'
import { fmtBytes, fmtDuration, fmtPercent } from '../utils/format'

const TABS = [
  { key: 'overview', label: '概览' },
  { key: 'processes', label: '进程' },
  { key: 'tasks', label: '任务' },
  { key: 'probes', label: '服务探测' },
] as const

const tab = ref<string>('overview')

const overview = ref<Overview | null>(null)
const processes = ref<ProcessSnapshot | null>(null)
const tasks = ref<TaskStatus | null>(null)
const fatalError = ref('')

const overviewPoller = usePolling(async () => {
  overview.value = await fetchOverview()
}, {
  intervalMs: 5000,
  onHalted: (e) => (fatalError.value = e.message),
})

const processPoller = usePolling(async () => {
  processes.value = await fetchProcesses()
}, {
  intervalMs: 10_000,
  onHalted: (e) => (fatalError.value = e.message),
})

const taskPoller = usePolling(async () => {
  tasks.value = await fetchTaskStatus()
}, {
  intervalMs: 10_000,
  onHalted: (e) => (fatalError.value = e.message),
})

async function retry() {
  fatalError.value = ''
  await Promise.all([overviewPoller.refresh(), processPoller.refresh(), taskPoller.refresh()])
}

const system = computed(() => overview.value?.system)
const jvm = computed(() => overview.value?.jvm)

const sysInfo = computed(() => {
  const s = system.value
  if (!s?.osName) return ''
  return [s.hostName, `${s.osName} ${s.osVersion ?? ''}`.trim(), s.arch]
    .filter(Boolean)
    .join(' · ')
})

const degraded = computed(() => system.value?.error || overview.value?.system == null && overview.value != null)
</script>

<template>
  <div class="flex flex-col gap-6">
    <PageHeader title="服务器监控" :description="sysInfo || '系统资源、JVM、进程与端口服务状态'">
      <template #actions>
        <span
          v-if="system"
          class="text-xs text-base-content/50 tabular-nums"
          :title="`系统已运行 ${fmtDuration(Number(system.uptimeSeconds) * 1000)}`"
        >
          采样于 {{ fmtDuration(Date.now() - Number(system.sampledAt)) }}前
        </span>
      </template>
    </PageHeader>

    <div
      v-if="fatalError"
      class="flex items-center justify-between rounded-box border border-error/30 bg-error/5 px-4 py-3 text-sm text-error"
    >
      <span>轮询失败:{{ fatalError }}(连续失败已暂停,页面切回或点击重试后恢复)</span>
      <button class="btn btn-ghost btn-sm text-error" @click="retry">重试</button>
    </div>

    <div
      v-if="degraded && !fatalError"
      class="rounded-box border border-warning/30 bg-warning/5 px-4 py-2.5 text-sm text-warning"
    >
      系统指标采样降级:{{ system?.error ?? '等待采样' }}
    </div>

    <UnderlineTabs v-model="tab" :tabs="TABS" />

    <!-- 概览 -->
    <div v-if="tab === 'overview'" class="flex flex-col gap-6">
      <div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="CPU"
          :value="system?.cpu ? fmtPercent(system.cpu.usagePercent) : '—'"
          :hint="system?.cpu ? `负载 ${system.cpu.load1.toFixed(2)}` : ''"
        />
        <StatCard
          label="内存"
          :value="system?.memory ? fmtPercent(system.memory.usagePercent) : '—'"
          :hint="system?.memory ? `${fmtBytes(Number(system.memory.usedBytes))} / ${fmtBytes(Number(system.memory.totalBytes))}` : ''"
        />
        <StatCard
          label="JVM 堆"
          :value="jvm ? fmtPercent(jvm.heap.usagePercent) : '—'"
          :hint="jvm ? `${fmtBytes(Number(jvm.heap.usedBytes))} / ${fmtBytes(Number(jvm.heap.maxBytes))}` : ''"
        />
        <StatCard
          label="运行时长"
          :value="system ? fmtDuration(Number(system.uptimeSeconds) * 1000) : '—'"
          :hint="`JVM ${jvm ? fmtDuration(Number(jvm.uptimeMs)) : '—'}`"
        />
      </div>

      <div class="grid gap-6 lg:grid-cols-2">
        <CpuPanel :cpu="system?.cpu" />
        <MemoryPanel :memory="system?.memory" />
      </div>
      <DiskPanel :disks="system?.disks ?? []" />
      <NetworkPanel :networks="system?.networks ?? []" />
      <JvmPanel :jvm="jvm" />
    </div>

    <!-- 进程 -->
    <ProcessTable v-else-if="tab === 'processes'" :snapshot="processes" />

    <!-- 任务 -->
    <TaskStatusPanel v-else-if="tab === 'tasks'" :status="tasks" />

    <!-- 服务探测 -->
    <ProbeTargetManager v-else-if="tab === 'probes'" />
  </div>
</template>
