<script setup lang="ts">
import { onActivated, onBeforeUnmount, onDeactivated, ref, watch } from 'vue'
import {
  tsToDate,
  dateToTs,
  dateDiff,
  dateAdd,
  parseTsNumber,
  formatInstant,
  parseRelative,
  COMMON_ZONES,
  type DateCalcUnit,
  type InstantFormats,
} from '../../tools/timestamp'
import { useCopy } from '../../composables/useCopy'
import { useToolState } from '../../composables/useToolState'
import { watchDebounced } from '../../composables/useDebounce'
import PaneShell from '../tools-ui/PaneShell.vue'
import PaneSeam from '../tools-ui/PaneSeam.vue'

interface TimestampState {
  /** 时间戳 → 日期 的输入(v-model 遇 type=number 会自动转数值) */
  tsText: number | string
  /** 日期 → 时间戳 的输入(datetime-local 值) */
  localInput: string
  /** 多格式显示所用时区:'local' | 'utc' | IANA 区名 */
  zone: string
  /** 相对时间解析输入(「3 天前」/「in 2 hours」) */
  relText: string
  /** 日期计算模式:差值 / 加减 */
  dcMode: 'diff' | 'add'
  /** 差值模式两端(datetime-local 值) */
  dcFrom: string
  dcTo: string
  /** 加减模式:基准日期、数量与单位 */
  dcBase: string
  dcAmount: number
  dcUnit: DateCalcUnit
  /** 当前时间戳自动刷新 */
  autoNow: boolean
}

/** 输入经 localStorage 持久化(key 与注册表一致),刷新后恢复;输出为临时结果不入快照 */
const { state } = useToolState<TimestampState>('ts', {
  tsText: '',
  localInput: '',
  zone: 'local',
  relText: '',
  dcMode: 'diff',
  dcFrom: '',
  dcTo: '',
  dcBase: '',
  dcAmount: 1,
  dcUnit: 'day',
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

const dcOut = ref<string>('')
const dcErr = ref('')

const DC_UNITS: Array<{ id: DateCalcUnit; label: string }> = [
  { id: 'minute', label: '分' },
  { id: 'hour', label: '时' },
  { id: 'day', label: '天' },
  { id: 'week', label: '周' },
  { id: 'month', label: '月' },
  { id: 'year', label: '年' },
]

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

function runDateCalc(): void {
  dcOut.value = ''
  dcErr.value = ''
  try {
    if (state.dcMode === 'diff') {
      if (!state.dcFrom || !state.dcTo) return
      const d = dateDiff(state.dcFrom, state.dcTo)
      dcOut.value =
        `${d.days} 天 ${d.hours} 时 ${d.minutes} 分${d.negative ? '(后者更早)' : ''}\n` +
        `总计 ${d.totalDays} 天(约 ${d.totalWeeks} 周)`
    } else {
      if (!state.dcBase) return
      const r = dateAdd(state.dcBase, Number(state.dcAmount) || 0, state.dcUnit)
      dcOut.value = `${r.iso}\ns=${r.ts.s} ms=${r.ts.ms}`
    }
  } catch (e) {
    dcErr.value = (e as Error).message || '日期无法解析'
  }
}

function run(): void {
  runDirection1()
  runDirection2()
  runRelative()
  runDateCalc()
}

function recomputeNow(): void {
  runner.flush()
}

const runner = watchDebounced(
  [
    tsTextStr,
    () => state.localInput,
    () => state.zone,
    () => state.relText,
    () => state.dcMode,
    () => state.dcFrom,
    () => state.dcTo,
    () => state.dcBase,
    () => state.dcAmount,
    () => state.dcUnit,
  ],
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
/** 日期计算清空端点立即失效旧结果,不等防抖窗口 */
watch(
  [() => state.dcMode, () => state.dcFrom, () => state.dcTo, () => state.dcBase],
  () => {
    const empty =
      state.dcMode === 'diff' ? !state.dcFrom || !state.dcTo : !state.dcBase
    if (empty) {
      dcOut.value = ''
      dcErr.value = ''
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
  <div class="grid items-start gap-3 lg:grid-cols-[1fr_auto_1fr]" @keydown.ctrl.enter.prevent="recomputeNow">
    <!-- 输入侧:三个方向各一个输入;顺序即测试契约(checkbox 一律排在最后) -->
    <PaneShell label="输入" class="lg:h-full">
      <div class="flex flex-col divide-y divide-base-300">
        <section class="flex flex-col gap-1.5 p-3">
          <label for="ts-in" class="text-xs font-medium tracking-wider text-base-content/50">时间戳 → 日期时间</label>
          <div class="flex gap-2">
            <input
              id="ts-in"
              v-model="state.tsText"
              type="number"
              placeholder="1700000000 或 1700000000000"
              class="input input-sm min-w-0 flex-1 font-mono"
            />
            <button type="button" class="btn btn-sm btn-primary" @click="fillNow">现在</button>
          </div>
          <p v-if="unitNote" class="text-xs opacity-60">{{ unitNote }}</p>
          <p v-if="d1Err" class="text-error text-sm">{{ d1Err }}</p>
        </section>

        <section class="flex flex-col gap-1.5 p-3">
          <label for="ts-local" class="text-xs font-medium tracking-wider text-base-content/50">日期时间 → 时间戳</label>
          <input id="ts-local" v-model="state.localInput" type="datetime-local" class="input input-sm flex-1" />
          <p v-if="d2Err" class="text-error text-sm">{{ d2Err }}</p>
        </section>

        <section class="flex flex-col gap-1.5 p-3">
          <label for="ts-rel" class="text-xs font-medium tracking-wider text-base-content/50">相对时间解析(中文优先)</label>
          <input
            id="ts-rel"
            v-model="state.relText"
            placeholder="如:3 天前 / 半小时后 / in 2 hours"
            class="input input-sm font-mono"
          />
          <p v-if="relErr" class="text-error text-sm">{{ relErr }}</p>
        </section>

        <section class="flex flex-col gap-1.5 p-3">
          <span class="text-xs font-medium tracking-wider text-base-content/50">日期计算(差值 / 加减)</span>
          <div class="join self-start">
            <button
              v-for="m in [{ id: 'diff', label: '差值' }, { id: 'add', label: '加减' }] as const"
              :key="m.id"
              type="button"
              class="btn btn-xs join-item"
              :class="state.dcMode === m.id ? 'btn-primary' : 'btn-ghost'"
              @click="state.dcMode = m.id"
            >
              {{ m.label }}
            </button>
          </div>
          <div v-if="state.dcMode === 'diff'" class="flex items-center gap-2">
            <input v-model="state.dcFrom" type="datetime-local" aria-label="差值起点" class="input input-sm min-w-0 flex-1" />
            <span class="text-xs opacity-40">→</span>
            <input v-model="state.dcTo" type="datetime-local" aria-label="差值终点" class="input input-sm min-w-0 flex-1" />
          </div>
          <div v-else class="flex items-center gap-2">
            <input v-model="state.dcBase" type="datetime-local" aria-label="加减基准日期" class="input input-sm min-w-0 flex-1" />
            <input
              v-model.number="state.dcAmount"
              type="number"
              aria-label="加减数量"
              class="input input-sm w-20"
            />
            <div class="join">
              <button
                v-for="u in DC_UNITS"
                :key="u.id"
                type="button"
                class="btn btn-xs join-item"
                :class="state.dcUnit === u.id ? 'btn-primary' : 'btn-ghost'"
                @click="state.dcUnit = u.id"
              >
                {{ u.label }}
              </button>
            </div>
          </div>
          <p class="text-xs opacity-50">月/年按日历语义,月末自动收敛(1/31 + 1 月 → 2/28)</p>
          <p v-if="dcErr" class="text-error text-sm">{{ dcErr }}</p>
        </section>
      </div>
    </PaneShell>

    <PaneSeam direction="lr" />

    <!-- 输出侧:多格式同显 + 各方向结果 + 实时钟表 -->
    <PaneShell label="输出" class="lg:h-full">
      <template #actions>
        <select v-model="state.zone" class="select select-xs w-36" aria-label="显示时区">
          <option v-for="opt in ZONE_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </select>
        <button v-if="mf" type="button" class="btn btn-ghost btn-xs" @click="copy(mf.iso)">
          {{ copied ? '已复制' : '复制' }}
        </button>
      </template>
      <div class="h-full overflow-auto p-3">
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

        <div v-if="d2" class="mt-3">
          <p class="pb-1 text-xs font-medium tracking-wider text-base-content/50">日期 → 时间戳</p>
          <pre class="whitespace-pre-wrap rounded border border-base-300 bg-base-200/60 p-3 font-mono text-sm">s={{ d2.s }}
ms={{ d2.ms }}</pre>
        </div>

        <div v-if="relOut" class="mt-3">
          <p class="pb-1 text-xs font-medium tracking-wider text-base-content/50">相对时间 → 时间戳</p>
          <pre class="whitespace-pre-wrap rounded border border-base-300 bg-base-200/60 p-3 font-mono text-sm">s={{ relOut.s }}
ms={{ relOut.ms }}
{{ relOut.text }}</pre>
        </div>

        <div v-if="dcOut" class="mt-3">
          <p class="pb-1 text-xs font-medium tracking-wider text-base-content/50">日期计算</p>
          <pre class="whitespace-pre-wrap rounded border border-base-300 bg-base-200/60 p-3 font-mono text-sm">{{ dcOut }}</pre>
        </div>

        <p
          v-if="!mf && !d2 && !relOut && !dcOut"
          class="flex h-full min-h-20 items-center justify-center font-mono text-xs text-base-content/35"
        >
          输入任意一侧,实时换算
        </p>
      </div>
      <template #footer>
        <span class="now-clock">s={{ nowS }} · ms={{ nowMs }}</span>
        <label class="ml-auto flex cursor-pointer items-center gap-1.5" title="每秒刷新当前时间戳">
          <input v-model="state.autoNow" type="checkbox" class="checkbox checkbox-xs align-middle" />
          实时时钟
        </label>
      </template>
    </PaneShell>
  </div>
</template>
