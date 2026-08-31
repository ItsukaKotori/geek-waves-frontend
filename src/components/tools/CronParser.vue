<script setup lang="ts">
import { ref } from 'vue'
import {
  describeCron,
  formatCronRun,
  nextCronRuns,
  parseCron,
  type CronExpr,
} from '../../tools/cronParse'
import { useToolState } from '../../composables/useToolState'
import { watchDebounced } from '../../composables/useDebounce'
import ErrorBanner from '../ui/ErrorBanner.vue'
import PaneShell from '../tools-ui/PaneShell.vue'
import PaneSeam from '../tools-ui/PaneSeam.vue'

/**
 * crontab 解析(FE10 T2 批次一):5 段表达式 → 中文描述 + 未来 5 次运行时间。
 * 支持范围:标准 5 段 cron(星号/列表/范围/步长/英文缩写);不支持 @宏、
 * 秒级与 Quartz 特殊符(?/L/W/#)——输入即报错。实时范式:150ms 防抖解析。
 */

interface CronState {
  expr: string
}

/** 输入经 localStorage 持久化(key 与注册表一致),刷新后恢复 */
const { state } = useToolState<CronState>('cron', { expr: '*/5 * * * *' })

const parsed = ref<CronExpr | null>(null)
const description = ref('')
const runs = ref<Date[]>([])
const errorMessage = ref('')

/** 5 个字段的展示(归一化值集合,逗号连接;通配显示 *) */
function fieldSummary(expr: CronExpr, key: 'minute' | 'hour' | 'dom' | 'month' | 'dow'): string {
  const f = expr[key]
  return f.wildcard ? '*' : [...f.values].sort((a, b) => a - b).join(',')
}

const fieldLabels = [
  { key: 'minute', label: '分' },
  { key: 'hour', label: '时' },
  { key: 'dom', label: '日' },
  { key: 'month', label: '月' },
  { key: 'dow', label: '周' },
] as const

function run(): void {
  const src = state.expr.trim()
  if (src === '') {
    parsed.value = null
    description.value = ''
    runs.value = []
    errorMessage.value = ''
    return
  }
  try {
    const expr = parseCron(src)
    parsed.value = expr
    description.value = describeCron(expr)
    runs.value = nextCronRuns(expr, 5, new Date())
    errorMessage.value = ''
  } catch (e) {
    parsed.value = null
    description.value = ''
    runs.value = []
    errorMessage.value = (e as Error).message || '表达式解析失败'
  }
}

const runner = watchDebounced(() => state.expr, run)

function recomputeNow(): void {
  runner.flush()
}
</script>

<template>
  <div class="flex flex-col gap-3" @keydown.ctrl.enter.prevent="recomputeNow" @keydown.meta.enter.prevent="recomputeNow">
    <ErrorBanner :message="errorMessage" />

    <div class="grid items-start gap-3 lg:grid-cols-[1fr_auto_1fr]">
      <PaneShell label="表达式" badge="5 段" class="lg:h-full">
        <div class="flex h-full flex-col gap-2 p-3">
          <input
            v-model="state.expr"
            data-testid="cron-expr"
            placeholder="如 30 8 * * 1-5"
            aria-label="crontab 表达式(分 时 日 月 周)"
            class="input input-sm font-mono"
            spellcheck="false"
          />
          <p class="text-xs text-base-content/50">
            支持范围:标准 5 段 cron(星号 / 逗号列表 / 范围 / 步长 / 英文月与星期缩写,周日 0 或 7);
            不支持 @hourly 等宏、秒级字段与 Quartz 的 ?/L/W/#;日与周同时受限按「或」
          </p>
        </div>
      </PaneShell>

      <PaneSeam direction="lr" />

      <PaneShell label="执行计划" class="lg:h-full">
        <div class="h-full overflow-auto">
          <template v-if="parsed">
            <div class="flex flex-col gap-3 p-3">
              <div>
                <p class="text-xs font-medium tracking-wider text-base-content/50">描述</p>
                <p data-testid="cron-description" class="mt-1 text-base font-medium">{{ description }}</p>
                <div class="mt-2 flex flex-wrap gap-1">
                  <span
                    v-for="f in fieldLabels"
                    :key="f.key"
                    class="badge badge-ghost badge-sm font-mono"
                    :title="`${f.label}字段取值`"
                  >
                    {{ f.label }}={{ fieldSummary(parsed, f.key) }}
                  </span>
                </div>
              </div>

              <div>
                <p class="text-xs font-medium tracking-wider text-base-content/50">未来 5 次运行(按本机时区逐次推算)</p>
                <ol data-testid="cron-next-runs" class="mt-1 list-inside list-decimal font-mono text-sm">
                  <li v-for="(d, i) in runs" :key="i" class="py-0.5">{{ formatCronRun(d) }}</li>
                </ol>
              </div>
            </div>
          </template>
          <p v-else class="flex h-full min-h-20 items-center justify-center font-mono text-xs text-base-content/35">
            输入表达式实时解析
          </p>
        </div>
        <template #footer>
          <span class="text-base-content/40">Ctrl+Enter 立即重算</span>
        </template>
      </PaneShell>
    </div>
  </div>
</template>
