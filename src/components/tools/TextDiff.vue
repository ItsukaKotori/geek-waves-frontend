<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  MAX_DIFF_LINES,
  alignDiff,
  splitDiffLines,
  withinDiffLimit,
  type DiffRow,
} from '../../tools/textDiff'
import { useToolState } from '../../composables/useToolState'
import { watchDebounced } from '../../composables/useDebounce'
import ErrorBanner from '../ui/ErrorBanner.vue'
import PaneShell from '../tools-ui/PaneShell.vue'
import CodeEditor from '../tools-ui/CodeEditor.vue'
import PaneSeam from '../tools-ui/PaneSeam.vue'

/**
 * 文本 diff(FE10 T2 批次一):行级 LCS(Hirschberg 线性空间)双栏对照。
 * 实时范式:两侧任一输入变化即重算(150ms 防抖,Ctrl+Enter 冲刷),无计算按钮。
 */

interface TextDiffState {
  oldText: string
  newText: string
}

/** 输入经 localStorage 持久化(key 与注册表一致),刷新后恢复 */
const { state } = useToolState<TextDiffState>('diff', { oldText: '', newText: '' })

const rows = ref<DiffRow[]>([])
/** 超阈值护栏提示(常量插值,避免文案与 MAX_DIFF_LINES 漂移) */
const tooLarge = ref('')

/** 统计:未变/新增/删除行数 */
const stats = computed(() => {
  let equal = 0
  let add = 0
  let del = 0
  for (const r of rows.value) {
    if (r.type === 'equal') equal++
    else if (r.type === 'add') add++
    else del++
  }
  return { equal, add, del }
})

const hasResult = computed(() => rows.value.length > 0)

function run(): void {
  const a = splitDiffLines(state.oldText)
  const b = splitDiffLines(state.newText)
  if (a.length === 0 && b.length === 0) {
    rows.value = []
    tooLarge.value = ''
    return
  }
  if (!withinDiffLimit(a, b)) {
    // 大文本保护:不静默截断,直接停止并提示阈值
    rows.value = []
    tooLarge.value = `文本超过 ${MAX_DIFF_LINES} 行(旧 ${a.length} 行 / 新 ${b.length} 行),已停止对比,请缩减输入`
    return
  }
  tooLarge.value = ''
  rows.value = alignDiff(a, b)
}

const runner = watchDebounced([() => state.oldText, () => state.newText], run)

function recomputeNow(): void {
  runner.flush()
}

/** 防抖窗口内清空输入立即回到引导态,不等 150ms */
watch(
  [() => state.oldText, () => state.newText],
  ([a, b]) => {
    if (a === '' && b === '') {
      runner.cancel()
      rows.value = []
      tooLarge.value = ''
    }
  },
)

/** 中缝动作:交换两侧文本 */
function swapSides(): void {
  ;[state.oldText, state.newText] = [state.newText, state.oldText]
}
</script>

<template>
  <div class="flex flex-col gap-3" @keydown.ctrl.enter.prevent="recomputeNow" @keydown.meta.enter.prevent="recomputeNow">
    <!-- 双输入工作台:旧 / 新两栏,中缝可交换两侧 -->
    <div class="grid items-stretch gap-3 lg:grid-cols-[1fr_auto_1fr]">
      <PaneShell label="旧文本" class="h-64">
        <template #actions>
          <button v-if="state.oldText" type="button" class="btn btn-ghost btn-xs" @click="state.oldText = ''">清空</button>
        </template>
        <CodeEditor v-model="state.oldText" testid="diff-old" placeholder="原始文本" aria-label="原始文本" />
        <template #footer>
          <span>{{ state.oldText.length }} 字符</span>
        </template>
      </PaneShell>

      <PaneSeam swap swap-title="交换两侧文本" @swap="swapSides" />

      <PaneShell label="新文本" class="h-64">
        <template #actions>
          <button v-if="state.newText" type="button" class="btn btn-ghost btn-xs" @click="state.newText = ''">清空</button>
        </template>
        <CodeEditor v-model="state.newText" testid="diff-new" placeholder="修改后文本" aria-label="修改后文本" />
        <template #footer>
          <span>{{ state.newText.length }} 字符</span>
        </template>
      </PaneShell>
    </div>

    <ErrorBanner :message="tooLarge" variant="warning" />

    <PaneShell label="对比结果" :badge="hasResult ? `${stats.add + stats.del} 处差异` : undefined">
      <template v-if="hasResult">
        <div data-testid="diff-stats" class="flex flex-wrap items-center gap-2 border-b border-base-300 px-3 py-2 text-sm">
          <span class="badge badge-ghost badge-sm">未变 {{ stats.equal }}</span>
          <span class="badge badge-success badge-soft badge-sm">新增 {{ stats.add }}</span>
          <span class="badge badge-error badge-soft badge-sm">删除 {{ stats.del }}</span>
        </div>
        <div
          data-testid="diff-rows"
          class="max-h-96 overflow-auto bg-base-200/40 font-mono text-xs leading-5"
        >
          <div
            v-for="(row, i) in rows"
            :key="i"
            class="grid grid-cols-[3rem_1fr_3rem_1fr]"
            :data-row-type="row.type"
            :class="row.type === 'del' ? 'bg-error/10 text-error' : row.type === 'add' ? 'bg-success/10 text-success' : 'text-base-content/60'"
          >
            <span class="select-none border-r border-base-300 px-1 text-right opacity-50">{{ row.aNo ?? '' }}</span>
            <span class="whitespace-pre-wrap break-all border-r border-base-300 px-2">{{ row.type === 'add' ? '' : row.text }}</span>
            <span class="select-none border-r border-base-300 px-1 text-right opacity-50">{{ row.bNo ?? '' }}</span>
            <span class="whitespace-pre-wrap break-all px-2">{{ row.type === 'del' ? '' : row.text }}</span>
          </div>
        </div>
      </template>
      <p v-else-if="!tooLarge" class="flex h-full min-h-20 items-center justify-center px-3 text-center font-mono text-xs text-base-content/35">
        两侧输入文本后实时对比,行级 LCS 对齐,新增 / 删除 / 未变分色区分
      </p>
      <template #footer>
        <span v-if="!hasResult && !tooLarge" class="text-base-content/40">Ctrl+Enter 立即重算</span>
      </template>
    </PaneShell>
  </div>
</template>
