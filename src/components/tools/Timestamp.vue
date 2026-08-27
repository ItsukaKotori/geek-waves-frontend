<script setup lang="ts">
import { onActivated, onBeforeUnmount, onDeactivated, ref, watch } from 'vue'
import {
  tsToDate,
  dateToTs,
  parseTsNumber,
  formatInstant,
  parseRelative,
  COMMON_ZONES,
  type InstantFormats,
} from '../../tools/timestamp'
import { useCopy } from '../../composables/useCopy'
import { useToolState } from '../../composables/useToolState'
import { watchDebounced } from '../../composables/useDebounce'

interface TimestampState {
  /** 时间戳 → 日期 的输入(v-model 遇 type=number 会自动转数值) */
  tsText: number | string
  /** 日期 → 时间戳 的输入(datetime-local 值) */
  localInput: string
  /** 多格式显示所用时区:'local' | 'utc' | IANA 区名 */
  zone: string
  /** 相对时间解析输入(「3 天前」/「in 2 hours」) */
  relText: string
  /** 当前时间戳自动刷新 */
  autoNow: boolean
}

/** 输入经 localStorage 持久化(key 与注册表一致),刷新后恢复;输出为临时结果不入快照 */
const { state } = useToolState<TimestampState>('ts', {
  tsText: '',
  localInput: '',
  zone: 'local',
  relText: '',
  autoNow: false,
})

/** 统一字符串化(type=number 输入运行期可能已是 number) */
function tsTextStr(): string {
  const v = state.tsText
  return typeof v === 'number' ? String(v) : (v ?? '')
}

const ZONE_OPTIONS = [
  { value: 'local', label: '本地时区' },
  { value: 'utc', label: 'UTC' },
  ...COMMON_ZONES.map((z) => ({ value: z, label: z })),
]

const mf = ref<InstantFormats | null>(null)
const unitNote = ref('')
const d1Err = ref('')
const d2 = ref<{ s: number; ms: number } | null>(null)
const d2Err = ref('')
const relOut = ref<{ s: number; ms: number; text: string } | null>(null)
const relErr = ref('')

const nowS = ref(Math.floor(Date.now() / 1000))
const nowMs = ref(Date.now())

const { copied, copy } = useCopy()

function zoneLabel(): string {
  if (state.zone === 'utc') return 'UTC 时间'
  return `区内时间(${state.zone})`
}

function runDirection1(): void {
  mf.value = null
  d1Err.value = ''
  unitNote.value = ''
  const tsRaw = tsTextStr()
  if (!tsRaw.trim()) {
    // 空输入保持空闲态,不刷错误
    return
  }
  try {
    const parsed = parseTsNumber(tsRaw)
    unitNote.value =
      parsed.unit === 's' ? '(按毫秒为 0.001 倍的秒级时间戳解释)' : '(按毫秒时间戳解释)'
    mf.value = formatInstant(parsed.ms, state.zone)
  } catch (e) {
    d1Err.value = (e as Error).message || '请输入有效的时间戳数值'
  }
}

function runDirection2(): void {
  d2.value = null
  d2Err.value = ''
  if (!state.localInput) {
    // 空输入保持空闲态
    return
  }
  const date = new Date(state.localInput)
  if (Number.isNaN(date.getTime())) {
    d2Err.value = '日期无法解析'
    return
  }
  d2.value = dateToTs(date)
}

function runRelative(): void {
  relOut.value = null
  relErr.value = ''
  const raw = state.relText.trim()
  if (!raw) return
  const ms = parseRelative(raw)
  if (ms === null) {
    relErr.value = '无法识别的相对时间表述'
    return
  }
  const s = Math.floor(ms / 1000)
  relOut.value = { s, ms, text: tsToDate(s) }
}

function run(): void {
  runDirection1()
  runDirection2()
  runRelative()
}

function recomputeNow(): void {
  runner.flush()
}

const runner = watchDebounced(
  [tsTextStr, () => state.localInput, () => state.zone, () => state.relText],
  run,
)

/** 清空输入立即失效对应方向的旧结果,不等防抖窗口 */
watch(tsTextStr, (v) => {
  if (!v.trim()) {
    mf.value = null
    d1Err.value = ''
    unitNote.value = ''
  }
})
watch(
  () => state.localInput,
  (v) => {
    if (!v) {
      d2.value = null
      d2Err.value = ''
    }
  },
)
watch(
  () => state.relText,
  (v) => {
    if (!v.trim()) {
      relOut.value = null
      relErr.value = ''
    }
  },
)

/* 「现在」按钮 + 实时时钟(可选自动刷新) */

function tick(): void {
  if (document.hidden) return
  const t = Date.now()
  nowS.value = Math.floor(t / 1000)
  nowMs.value = t
}

let clockTimer: ReturnType<typeof setInterval> | undefined

function syncClockLoop(): void {
  if (clockTimer !== undefined) clearInterval(clockTimer)
  clockTimer = undefined
  if (state.autoNow) {
    tick()
    clockTimer = setInterval(tick, 1000)
  }
}

watch(
  () => state.autoNow,
  () => syncClockLoop(),
)

onActivated(syncClockLoop)
onDeactivated(() => {
  if (clockTimer !== undefined) clearInterval(clockTimer)
  clockTimer = undefined
})
onBeforeUnmount(() => {
  if (clockTimer !== undefined) clearInterval(clockTimer)
  clockTimer = undefined
})

function fillNow(): void {
  state.tsText = Math.floor(Date.now() / 1000)
}
</script>

<template>
  <div class="flex flex-col gap-4" @keydown.ctrl.enter.prevent="recomputeNow">
    <h2 class="text-base font-semibold tracking-tight">时间戳</h2>

    <section class="flex flex-col gap-2">
      <h3 class="text-sm font-semibold opacity-80">时间戳 → 日期时间</h3>
      <input v-model="state.tsText" type="number" placeholder="1700000000 或 1700000000000" class="input input-sm font-mono" />
      <p v-if="d1Err" class="text-error text-sm">{{ d1Err }}</p>
      <!-- 多格式同显:同一输入并列 ISO8601 / UTC 字符串 / 本地格式 / 选定时区 / 相对时间 -->
      <div v-if="mf" class="grid gap-1">
        <div class="flex items-center gap-2">
          <span class="w-20 shrink-0 text-xs opacity-60">ISO8601</span>
          <code class="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded border border-base-300 bg-base-200/60 px-2 py-1 font-mono text-xs">{{ mf.iso }}</code>
        </div>
        <div class="flex items-center gap-2">
          <span class="w-20 shrink-0 text-xs opacity-60">UTC</span>
          <code class="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded border border-base-300 bg-base-200/60 px-2 py-1 font-mono text-xs">{{ mf.utc }}</code>
        </div>
        <div class="flex items-start gap-2">
          <span class="w-20 shrink-0 pt-1 text-xs opacity-60">本地</span>
          <pre class="flex-1 whitespace-pre-wrap rounded border border-base-300 bg-base-200/60 p-1 font-mono text-xs">{{ mf.local }}</pre>
          <button class="btn btn-sm btn-ghost" @click="copy(mf.iso)">
            {{ copied ? '已复制' : '复制' }}
          </button>
        </div>
        <div v-if="mf.zoneTime" class="flex items-center gap-2">
          <span class="w-20 shrink-0 truncate text-xs opacity-60">{{ zoneLabel() }}</span>
          <code class="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded border border-base-300 bg-base-200/60 px-2 py-1 font-mono text-xs">{{ mf.zoneTime }}</code>
        </div>
        <div class="flex items-center gap-2">
          <span class="w-20 shrink-0 text-xs opacity-60">相对</span>
          <code class="rounded px-2 py-1 font-mono text-xs text-primary">{{ mf.relative }}</code>
        </div>
      </div>
      <p v-if="unitNote" class="text-xs opacity-60">{{ unitNote }}</p>
      <select v-model="state.zone" class="select select-sm w-fit" aria-label="显示时区">
        <option v-for="opt in ZONE_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
      </select>
    </section>

    <section class="flex flex-col gap-2">
      <h3 class="text-sm font-semibold opacity-80">日期时间 → 时间戳</h3>
      <input v-model="state.localInput" type="datetime-local" class="input input-sm flex-1" />
      <p v-if="d2Err" class="text-error text-sm">{{ d2Err }}</p>
      <div v-if="d2" class="flex items-center gap-2">
        <pre class="flex-1 whitespace-pre-wrap rounded-box border border-base-300 bg-base-200/60 p-3">s={{ d2.s }}
ms={{ d2.ms }}</pre>
        <button class="btn btn-sm btn-ghost" @click="copy(`s=${d2?.s}\nms=${d2?.ms}`)">
          {{ copied ? '已复制' : '复制' }}
        </button>
      </div>
    </section>

    <section class="flex flex-col gap-2">
      <h3 class="text-sm font-semibold opacity-80">相对时间解析(中文优先)</h3>
      <input v-model="state.relText" placeholder="如:3 天前 / 半小时后 / in 2 hours" class="input input-sm font-mono" />
      <p v-if="relErr" class="text-error text-sm">{{ relErr }}</p>
      <div v-if="relOut" class="flex items-center gap-2">
        <pre class="flex-1 whitespace-pre-wrap rounded-box border border-base-300 bg-base-200/60 p-3">s={{ relOut.s }}
ms={{ relOut.ms }}
{{ relOut.text }}</pre>
        <button class="btn btn-sm btn-ghost" @click="copy(`s=${relOut?.s}\nms=${relOut?.ms}`)">
          {{ copied ? '已复制' : '复制' }}
        </button>
      </div>
    </section>

    <section class="flex items-center gap-4">
      <button class="btn btn-sm btn-primary" @click="fillNow">现在</button>
      <label class="cursor-pointer items-center gap-2 text-sm">
        <input v-model="state.autoNow" type="checkbox" class="checkbox checkbox-sm align-middle" />
        实时时钟
      </label>
      <span class="now-clock font-mono text-sm opacity-80">s={{ nowS }} · ms={{ nowMs }}</span>
    </section>

    <span class="text-xs opacity-50">输入后实时转换,Ctrl+Enter 立即重算</span>
  </div>
</template>
