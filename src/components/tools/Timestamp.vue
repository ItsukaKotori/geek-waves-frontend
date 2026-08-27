<script setup lang="ts">
import { ref, watch } from 'vue'
import { tsToDate, dateToTs } from '../../tools/timestamp'
import { useCopy } from '../../composables/useCopy'
import { useToolState } from '../../composables/useToolState'
import { watchDebounced } from '../../composables/useDebounce'

interface TimestampState {
  /** 时间戳 → 日期 的输入(v-model 遇 type=number 会自动转数值) */
  tsText: number | string
  /** 日期 → 时间戳 的输入(datetime-local 值) */
  localInput: string
}

/** 输入经 localStorage 持久化(key 与注册表一致),刷新后恢复;输出为临时结果不入快照 */
const { state } = useToolState<TimestampState>('ts', { tsText: '', localInput: '' })

/** 统一字符串化(type=number 输入运行期可能已是 number) */
function tsTextStr(): string {
  const v = state.tsText
  return typeof v === 'number' ? String(v) : (v ?? '')
}

const d1 = ref<{ value: string; note: string } | null>(null)
const d1Err = ref('')
const d2 = ref<{ s: number; ms: number } | null>(null)
const d2Err = ref('')
const { copied, copy } = useCopy()

/** 实时式(FE3):输入即出结果、变化即失效旧结果;150ms 防抖收敛连续击键 */
function run(): void {
  // 方向一:时间戳 → 日期
  d1.value = null
  d1Err.value = ''
  const tsRaw = tsTextStr()
  if (!tsRaw.trim()) {
    // 空输入保持空闲态,不刷错误
  } else {
    const n = Number(tsRaw)
    if (!Number.isFinite(n)) {
      d1Err.value = '请输入有效的时间戳数值'
    } else {
      d1.value = {
        value: tsToDate(n),
        note: n < 1e12 ? '(按毫秒为 0.001 倍的秒级时间戳解释)' : '(按毫秒时间戳解释)',
      }
    }
  }

  // 方向二:日期 → 时间戳
  d2.value = null
  d2Err.value = ''
  if (!state.localInput) {
    // 空输入保持空闲态
  } else {
    const date = new Date(state.localInput)
    if (Number.isNaN(date.getTime())) {
      d2Err.value = '日期无法解析'
    } else {
      d2.value = dateToTs(date)
    }
  }
}

function recomputeNow(): void {
  runner.flush()
}

const runner = watchDebounced([tsTextStr, () => state.localInput], run)

/** 清空输入立即失效对应方向的旧结果,不等防抖窗口 */
watch(tsTextStr, (v) => {
  if (!v.trim()) {
    d1.value = null
    d1Err.value = ''
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
</script>

<template>
  <div class="flex flex-col gap-4" @keydown.ctrl.enter.prevent="recomputeNow">
    <h2 class="text-base font-semibold tracking-tight">时间戳</h2>

    <section class="flex flex-col gap-2">
      <h3 class="text-sm font-semibold opacity-80">时间戳 → 日期时间</h3>
      <input v-model="state.tsText" type="number" placeholder="1700000000 或 1700000000000" class="input input-sm font-mono" />
      <p v-if="d1Err" class="text-error text-sm">{{ d1Err }}</p>
      <div v-if="d1" class="flex items-center gap-2">
        <pre class="flex-1 whitespace-pre-wrap rounded-box border border-base-300 bg-base-200/60 p-3">{{ d1.value }}</pre>
        <button class="btn btn-sm btn-ghost" @click="copy(d1.value)">
          {{ copied ? '已复制' : '复制' }}
        </button>
      </div>
      <p v-if="d1" class="text-xs opacity-60">{{ d1.note }}</p>
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
    <span class="text-xs opacity-50">输入后实时转换,Ctrl+Enter 立即重算</span>
  </div>
</template>
