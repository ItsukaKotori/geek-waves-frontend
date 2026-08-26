<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ProcessSnapshot } from '../../types/monitor'
import { fmtBytes, fmtPercent } from '../../utils/format'

const props = defineProps<{ snapshot?: ProcessSnapshot | null }>()

const keyword = ref('')
const sortKey = ref<'cpuPercent' | 'rssBytes' | 'pid' | 'name'>('cpuPercent')
const sortAsc = ref(false)

interface Row {
  pid: number
  name: string
  user: string
  state: string
  cpuPercent: number
  rssBytes: number
}

const rows = computed<Row[]>(() =>
  (props.snapshot?.processes ?? []).map((p) => ({
    pid: Number(p.pid),
    name: p.name,
    user: p.user ?? '',
    state: p.state ?? '',
    cpuPercent: p.cpuPercent,
    rssBytes: Number(p.rssBytes),
  })),
)

const filtered = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  const list = kw
    ? rows.value.filter(
        (r) =>
          r.name.toLowerCase().includes(kw) ||
          String(r.pid).includes(kw) ||
          r.user.toLowerCase().includes(kw),
      )
    : rows.value
  const dir = sortAsc.value ? 1 : -1
  return [...list].sort((a, b) => {
    const va = a[sortKey.value]
    const vb = b[sortKey.value]
    if (typeof va === 'string' && typeof vb === 'string') return va.localeCompare(vb) * dir
    return ((va as number) - (vb as number)) * dir
  })
})

function sortBy(key: 'cpuPercent' | 'rssBytes' | 'pid' | 'name') {
  if (sortKey.value === key) sortAsc.value = !sortAsc.value
  else {
    sortKey.value = key
    sortAsc.value = key === 'name' || key === 'pid'
  }
}

function arrow(key: string): string {
  if (sortKey.value !== key) return ''
  return sortAsc.value ? ' ↑' : ' ↓'
}

const STATE_BADGE: Record<string, string> = {
  RUNNING: 'badge-success',
  SLEEPING: 'badge-ghost',
  STOPPED: 'badge-warning',
  ZOMBIE: 'badge-error',
  OTHER: 'badge-ghost',
}
</script>

<template>
  <div class="rounded-box border border-base-300 bg-base-100 p-5">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h3 class="text-base font-semibold tracking-tight">
        进程
        <span v-if="snapshot" class="ml-1 text-xs font-normal text-base-content/50">
          Top {{ rows.length }} / 共 {{ snapshot.total }} 个
        </span>
      </h3>
      <input
        v-model="keyword"
        class="input input-sm w-56"
        placeholder="按名称 / PID / 用户过滤"
      />
    </div>

    <div v-if="snapshot?.error" class="mt-3 rounded-box border border-error/30 bg-error/5 px-4 py-3 text-sm text-error">
      {{ snapshot.error }}
    </div>

    <div v-else-if="filtered.length" class="mt-3 overflow-x-auto">
      <table class="table table-sm">
        <thead class="text-xs font-medium uppercase tracking-wider text-base-content/50">
          <tr>
            <th class="cursor-pointer select-none" @click="sortBy('pid')">PID{{ arrow('pid') }}</th>
            <th class="cursor-pointer select-none" @click="sortBy('name')">进程名{{ arrow('name') }}</th>
            <th>用户</th>
            <th>状态</th>
            <th class="cursor-pointer select-none text-right" @click="sortBy('cpuPercent')">
              CPU{{ arrow('cpuPercent') }}
            </th>
            <th class="cursor-pointer select-none text-right" @click="sortBy('rssBytes')">
              内存{{ arrow('rssBytes') }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in filtered" :key="r.pid" class="hover:bg-base-200/50">
            <td class="tabular-nums">{{ r.pid }}</td>
            <td class="max-w-[16rem] truncate font-medium" :title="r.name">{{ r.name }}</td>
            <td class="text-xs text-base-content/60">{{ r.user || '—' }}</td>
            <td>
              <span
                v-if="r.state"
                class="badge badge-sm"
                :class="STATE_BADGE[r.state] ?? 'badge-ghost'"
                >{{ r.state }}</span
              >
              <span v-else class="text-base-content/40">—</span>
            </td>
            <td class="text-right tabular-nums">
              <span
                :class="r.cpuPercent >= 70 ? 'font-medium text-warning' : r.cpuPercent >= 90 ? 'font-medium text-error' : ''"
              >
                {{ fmtPercent(r.cpuPercent) }}
              </span>
            </td>
            <td class="text-right tabular-nums">{{ fmtBytes(r.rssBytes) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <p v-else-if="snapshot && !filtered.length" class="mt-6 text-center text-sm text-base-content/50">
      没有匹配「{{ keyword }}」的进程。
    </p>

    <div v-else class="flex justify-center py-10">
      <span class="loading loading-spinner loading-lg text-base-content/30"></span>
    </div>
  </div>
</template>
