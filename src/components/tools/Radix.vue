<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { radixFormat, radixParse } from '../../tools/radix'
import { useToolState } from '../../composables/useToolState'
import { watchDebounced } from '../../composables/useDebounce'

const STANDARD_BASES = [2, 8, 10, 16]

interface RowDef {
  /** 展示键固定('b8'/'custom'),防换基残留旧文案 */
  id: string
  base: number
  label: string
}

interface RadixState {
  /** 最近一次编辑行的原文(与注册表一致的持久化语义) */
  input: string
  /** 最近一次编辑行所属进制 */
  from: number
  custom: number
  group: boolean
}

/** 输入与进制选择持久化(key 与注册表一致),刷新后恢复;各行为计算结果不入快照。
 * 旧快照的冗余字段(to)由浅合并自然忽略。 */
const { state } = useToolState<RadixState>('radix', { input: '', from: 10, custom: 12, group: false })

const customOptions = Array.from({ length: 35 }, (_, i) => i + 2).filter((b) => !STANDARD_BASES.includes(b))

/** 4 个标准基址恒显;自定义基数合法(2..36)且与标准不重复时追加一行 */
const rows = computed<RowDef[]>(() => {
  const list: RowDef[] = STANDARD_BASES.map((b) => ({ id: `b${b}`, base: b, label: `${b} 进制` }))
  const c = Number(state.custom)
  if (!STANDARD_BASES.includes(c) && Number.isInteger(c) && c >= 2 && c <= 36) {
    list.push({ id: 'custom', base: c, label: `${c} 进制(自定义)` })
  }
  return list
})

/** 各行展示文本;编辑行保留用户原文(保护光标),其余行输出规范化结果 */
const rowTexts = reactive<Record<string, string>>({})
const error = ref('')

/** 编辑源:最后被操作的行。初始取持久化的 input/from(旧数据无缝接管)。 */
const pending = ref({ base: state.from, text: state.input })

/** 实时式(FE3/FE6):任一进制行输入即联动其余全部行;150ms 防抖收敛连续击键 */
function run(): void {
  error.value = ''
  const current = rows.value.map((r) => r)
  const src = pending.value.text.trim()
  if (!src) {
    for (const r of current) rowTexts[r.id] = ''
    return
  }
  try {
    const parsed = radixParse(pending.value.text, pending.value.base)
    for (const r of current) {
      rowTexts[r.id] = radixFormat(parsed, r.base, { group: state.group })
    }
  } catch (e) {
    // 非法输入清空其余行,避免陈旧数值与新输入错配
    for (const r of current) rowTexts[r.id] = ''
    error.value = (e as Error).message || '转换失败'
  }
}

function recomputeNow(): void {
  runner.flush()
}

const runner = watchDebounced([() => state.custom, () => state.group], () => run())

function onEdit(row: RowDef, event: Event): void {
  const value = (event.target as HTMLInputElement).value
  rowTexts[row.id] = value
  pending.value = { base: row.base, text: value }
  state.from = row.base
  state.input = value
  runner.schedule()
}

/** 任一输入行被清空立即失效全部结果,不等防抖窗口 */
watch(
  () => pending.value.text,
  (v) => {
    if (v !== '') return
    runner.cancel()
    run()
  },
)
</script>

<template>
  <div class="tool-root flex flex-col gap-3" @keydown.ctrl.enter.prevent="recomputeNow">
    <h2 class="text-base font-semibold tracking-tight">进制转换</h2>

    <div class="grid gap-1.5">
      <div v-for="row in rows" :key="row.id" class="flex items-center gap-2">
        <span class="w-24 shrink-0 text-xs opacity-60">{{ row.label }}</span>
        <input
          :aria-label="row.id === 'custom' ? '自定义进制' : row.label"
          :value="rowTexts[row.id] ?? ''"
          placeholder="输入即联动其余进制"
          class="input input-sm min-w-0 flex-1 font-mono"
          @input="onEdit(row, $event)"
        />
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-4">
      <label class="flex items-center gap-2 text-sm">
        自定义基数
        <select v-model.number="state.custom" aria-label="自定义进制基数" class="select select-sm w-24">
          <option v-for="b in customOptions" :key="b" :value="b">{{ b }}</option>
        </select>
      </label>
      <label class="cursor-pointer items-center gap-2 text-sm">
        <input v-model="state.group" type="checkbox" class="checkbox checkbox-sm align-middle" />
        字节分组显示
      </label>
    </div>

    <p v-if="error" class="text-error text-sm">{{ error }}</p>
    <span class="text-xs opacity-50">输入后实时联动,Ctrl+Enter 立即重算</span>
  </div>
</template>
