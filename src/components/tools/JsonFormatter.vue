<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { converters, findConverter } from '../../tools/jsonConvert'
import {
  MAX_JSONPATH_MATCHES,
  TREE_DEFAULT_EXPAND_DEPTH,
  TREE_LARGE_BYTES,
  buildJsonTree,
  evalJsonPathText,
  type JsonNode,
} from '../../tools/jsonInspect'
import { useCopy } from '../../composables/useCopy'
import { useToolState } from '../../composables/useToolState'
import { watchDebounced } from '../../composables/useDebounce'
import PaneShell from '../tools-ui/PaneShell.vue'
import CodeEditor from '../tools-ui/CodeEditor.vue'
import CodeOutput from '../tools-ui/CodeOutput.vue'
import PaneSeam from '../tools-ui/PaneSeam.vue'

/** 输出视图:'convert' 实时转换;'pretty' 美化;'minify' 压缩;'tree' 折叠树 */
type OutputView = 'convert' | 'pretty' | 'minify' | 'tree'

interface JsonState {
  input: string
  targetId: string
  /** true: JSON → 目标格式;false: 目标格式 → JSON */
  toJson: boolean
  view: OutputView
  /** JSONPath 查询表达式(常用子集,支持范围见组件内提示与报告) */
  pathExpr: string
}

/** 输入经 localStorage 持久化(key 与注册表一致),刷新后恢复;旧快照缺省字段回落默认值 */
const { state } = useToolState<JsonState>('json', {
  input: '',
  targetId: 'yaml',
  toJson: true,
  view: 'convert',
  pathExpr: '',
})

const convertOut = ref('')
const convertErr = ref('')
const prettyOut = ref('')
const prettyErr = ref('')
const minifyOut = ref('')
/** 树根(输入非合法 JSON 时为 null)与折叠集合(按节点数字 id 记录) */
const treeRoot = ref<JsonNode | null>(null)
const collapsed = ref<Set<number>>(new Set())
const { copied, copy } = useCopy()

/* ----------------------------- JSONPath 查询区 ---------------------------- */

const qOut = ref('')
const qErr = ref('')
const qCount = ref(-1)
const qTruncated = ref(false)

function runQuery(): void {
  qErr.value = ''
  qOut.value = ''
  qTruncated.value = false
  if (!state.input.trim() || !state.pathExpr.trim()) {
    qCount.value = -1
    return
  }
  try {
    const matches = evalJsonPathText(state.input, state.pathExpr)
    qCount.value = matches.length
    qTruncated.value = matches.length >= MAX_JSONPATH_MATCHES
    qOut.value = JSON.stringify(matches, null, 2)
  } catch (e) {
    qCount.value = -1
    qErr.value = (e as Error).message || '查询失败'
  }
}

const queryRunner = watchDebounced([() => state.input, () => state.pathExpr], runQuery)

/* ------------------------------- 主转换管道 -------------------------------- */

const target = computed(() => findConverter(state.targetId))
const targetLabel = computed(() => target.value?.label ?? '')
/** 仅支持 JSON → 目标(生成),不支持反向解析的格式 */
const oneWayOnly = computed(() => ['ts', 'sql', 'kotlin', 'rust'].includes(state.targetId))

/** 输出视图只读快照(写入走 state.view,保持持久化一致性) */
const view = computed<OutputView>(() => state.view)
/** 转换方向只读快照(写入走 state.toJson) */
const toJson = computed(() => state.toJson)

const placeholder = computed(() =>
  toJson.value ? '{"name":"GeekWaves","tags":["vue","daisyui"]}' : `${targetLabel.value} 源文本`,
)

function clearOutputs(): void {
  convertOut.value = ''
  convertErr.value = ''
  prettyOut.value = ''
  prettyErr.value = ''
  minifyOut.value = ''
  treeRoot.value = null
  collapsed.value = new Set()
}

function onTargetChange() {
  if (oneWayOnly.value) state.toJson = true
}

/** 浅层展开、深层折叠的初始状态;大 JSON 除根外全折叠(TREE_LARGE_BYTES) */
function initialCollapsed(root: JsonNode, large: boolean): Set<number> {
  const hidden = new Set<number>()
  const walk = (n: JsonNode): void => {
    if (!n.children.length) return
    const expand = large ? n.depth < 1 : n.depth < TREE_DEFAULT_EXPAND_DEPTH
    if (!expand) hidden.add(n.id)
    else for (const c of n.children) walk(c)
  }
  walk(root)
  return hidden
}

function toggle(id: number): void {
  const next = new Set(collapsed.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  collapsed.value = next
}

const treeRows = computed<Array<{ node: JsonNode; indent: number }>>(() => {
  const root = treeRoot.value
  if (!root) return []
  const out: Array<{ node: JsonNode; indent: number }> = []
  const stack: Array<{ node: JsonNode; indent: number }> = [{ node: root, indent: 0 }]
  while (stack.length) {
    const cur = stack.pop()!
    out.push(cur)
    if (cur.node.children.length && !collapsed.value.has(cur.node.id)) {
      for (let i = cur.node.children.length - 1; i >= 0; i--) {
        stack.push({ node: cur.node.children[i]!, indent: cur.indent + 1 })
      }
    }
  }
  return out
})

/** 实时式(FE3/FE6):输入即出结果、变化即失效旧结果;150ms 防抖收敛连续击键 */
function run(): void {
  const src = state.input
  if (!src.trim()) {
    clearOutputs()
    return
  }
  const conv = target.value
  try {
    convertOut.value = conv ? (toJson.value ? conv.fromJson(src) : conv.toJson(src)) : ''
    convertErr.value = ''
  } catch (e) {
    convertOut.value = ''
    convertErr.value = (e as Error).message || '转换失败'
  }
  try {
    const parsed: unknown = JSON.parse(src)
    prettyOut.value = JSON.stringify(parsed, null, 2)
    minifyOut.value = JSON.stringify(parsed)
    prettyErr.value = ''
    const root = buildJsonTree(src)
    collapsed.value = initialCollapsed(root, src.length > TREE_LARGE_BYTES)
    treeRoot.value = root
  } catch {
    prettyOut.value = ''
    minifyOut.value = ''
    treeRoot.value = null
    collapsed.value = new Set()
    prettyErr.value = 'JSON 语法错误,无法解析'
  }
}

function recomputeNow(): void {
  runner.flush()
  queryRunner.flush()
}

const runner = watchDebounced([() => state.input, () => state.targetId, () => state.toJson], run)

/** 清空输入立即失效全部结果(含查询区),不等防抖窗口 */
watch(
  () => state.input,
  (v) => {
    if (v.trim() !== '') return
    runner.cancel()
    queryRunner.cancel()
    clearOutputs()
    qOut.value = ''
    qErr.value = ''
    qCount.value = -1
    qTruncated.value = false
    run()
  },
)

const shownOutput = computed(() => {
  if (view.value === 'convert') return convertOut.value
  if (view.value === 'minify') return minifyOut.value
  return prettyOut.value
})

const shownError = computed(() => {
  if (view.value === 'tree') return ''
  if (view.value === 'minify') return prettyErr.value
  // 转换视图并显两类错误(转换失败 + JSON 美化失败),便于排障
  return [convertErr.value, prettyErr.value].find(Boolean) ?? ''
})

function swap(): void {
  if (!shownOutput.value) return
  state.input = shownOutput.value
}

/* ------------------------------ 展示层派生(纯 UI) ----------------------------- */

const inputLines = computed(() => (state.input === '' ? 0 : state.input.split('\n').length))

const VIEW_LABELS: Record<OutputView, string> = {
  convert: '',
  pretty: '美化',
  minify: '压缩',
  tree: '树视图',
}

/** 输出面板徽标:转换视图给方向,其余视图给视图名 */
const outputBadge = computed(() => {
  if (view.value === 'convert') {
    return toJson.value ? `JSON → ${targetLabel.value}` : `${targetLabel.value} → JSON`
  }
  return VIEW_LABELS[view.value]
})
</script>

<template>
  <div class="flex flex-col gap-3" @keydown.ctrl.enter.prevent="recomputeNow">
    <!-- 工具栏:转换方向与目标格式 + 输出视图切换 -->
    <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div class="flex items-center gap-1.5">
        <button
          type="button"
          class="btn btn-xs"
          :class="toJson ? 'btn-primary' : 'btn-ghost'"
          :disabled="oneWayOnly && !toJson"
          @click="state.toJson = true"
        >
          →
        </button>
        <select v-model="state.targetId" class="select select-sm w-40" @change="onTargetChange">
          <option v-for="c in converters" :key="c.id" :value="c.id">{{ c.label }}</option>
        </select>
        <button
          type="button"
          class="btn btn-xs"
          :class="!toJson ? 'btn-primary' : 'btn-ghost'"
          :disabled="oneWayOnly"
          :title="oneWayOnly ? `${targetLabel} 不支持反向解析` : '反向转换'"
          @click="state.toJson = false"
        >
          ←
        </button>
        <span v-if="oneWayOnly" class="text-xs text-base-content/50">{{ targetLabel }} 仅支持 JSON → {{ targetLabel }}</span>
      </div>
      <div class="tabs tabs-box tabs-sm ml-auto w-fit">
        <button class="tab" :class="{ 'tab-active': view === 'convert' }" @click="state.view = 'convert'">
          转换视图
        </button>
        <button class="tab" :class="{ 'tab-active': view === 'pretty' }" @click="state.view = 'pretty'">美化视图</button>
        <button class="tab" :class="{ 'tab-active': view === 'minify' }" @click="state.view = 'minify'">压缩视图</button>
        <button class="tab" :class="{ 'tab-active': view === 'tree' }" @click="state.view = 'tree'">树视图</button>
      </div>
    </div>

    <!-- 双栏工作台 -->
    <div class="grid items-stretch gap-3 lg:grid-cols-[1fr_auto_1fr]">
      <PaneShell label="输入" :badge="toJson ? 'JSON' : targetLabel" class="h-80">
        <template #actions>
          <button v-if="state.input" type="button" class="btn btn-ghost btn-xs" @click="state.input = ''">清空</button>
        </template>
        <CodeEditor v-model="state.input" :placeholder="placeholder" aria-label="JSON 或目标格式源文本" />
        <template #footer>
          <span>{{ state.input.length }} 字符</span>
          <span v-if="inputLines > 1">{{ inputLines }} 行</span>
          <span class="ml-auto text-base-content/40">Ctrl+Enter 立即重算</span>
        </template>
      </PaneShell>

      <PaneSeam :direction="toJson ? 'lr' : 'rl'" :swap="!!shownOutput" swap-title="结果作为输入" @swap="swap" />

      <PaneShell label="输出" :badge="outputBadge" class="h-80">
        <template #actions>
          <button
            v-if="view === 'tree' ? !!treeRoot : !!shownOutput"
            type="button"
            class="btn btn-ghost btn-xs"
            @click="copy(view === 'tree' ? prettyOut : shownOutput)"
          >
            {{ copied ? '已复制' : '复制' }}
          </button>
        </template>
        <CodeOutput v-if="view !== 'tree'" :text="shownOutput" empty-hint="输入后实时出结果" />
        <div v-else class="h-full overflow-auto">
          <div v-if="treeRoot" class="tree-pane p-2 font-mono text-sm">
            <div
              v-for="row in treeRows"
              :key="row.node.id"
              class="flex items-start gap-1 rounded px-1 py-0.5 hover:bg-base-200/60"
              :style="{ paddingLeft: `${row.indent * 1.25}rem` }"
            >
              <button
                v-if="row.node.childCount"
                class="tree-toggle btn btn-xs btn-ghost h-5 min-h-0 px-1 leading-none"
                :aria-label="`切换 ${row.node.keyLabel}`"
                @click="toggle(row.node.id)"
              >
                {{ collapsed.has(row.node.id) ? '▸' : '▾' }}
              </button>
              <span v-else class="w-5 shrink-0" />
              <span class="shrink-0 opacity-70">{{ row.node.keyLabel }}:</span>
              <span class="break-all">{{ row.node.preview }}</span>
              <span v-if="row.node.childCount" class="shrink-0 text-xs opacity-50">
                {{ collapsed.has(row.node.id) ? '' : row.node.kind === 'array' ? '[' : '{' }}
                {{ row.node.childCount }} 项{{ collapsed.has(row.node.id) ? '' : row.node.kind === 'array' ? ']' : '}' }}
              </span>
            </div>
          </div>
          <p v-else class="flex h-full min-h-20 items-center justify-center font-mono text-xs text-base-content/35">
            输入合法 JSON 后以可折叠树展示
          </p>
        </div>
        <template #footer>
          <span v-if="shownError" class="text-error">{{ shownError }}</span>
        </template>
      </PaneShell>
    </div>

    <!-- JSONPath 查询 -->
    <PaneShell label="JSONPath 查询" badge="常用子集">
      <div class="flex flex-col gap-2 p-3">
        <input
          v-model="state.pathExpr"
          aria-label="JSONPath 查询表达式"
          placeholder="如 $.store.book[*].author、$..id、$.list[1:3]"
          class="input input-sm jsonpath-input font-mono"
        />
        <pre
          v-if="qOut"
          class="jsonpath-results max-h-72 overflow-auto whitespace-pre-wrap rounded-box border border-base-300 bg-base-200/60 p-3 font-mono text-sm"
          >{{ qOut }}</pre
        >
      </div>
      <template #footer>
        <span v-if="qErr" class="text-error">{{ qErr }}</span>
        <span v-else-if="qCount >= 0">
          命中 {{ qCount }} 处{{ qTruncated ? '(已达上限截断)' : '' }} · 支持 $ 属性链 / .* [*] 通配 / [n] 下标 / 切片 / 联合 / ..递归
        </span>
      </template>
    </PaneShell>
  </div>
</template>
