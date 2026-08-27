<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  FLAG_CHARS,
  GROUP_STRIPE_COLORS,
  MATCH_COUNT_LIMIT,
  MATCH_TINTS,
  TEXT_CHAR_LIMIT,
  buildRenderLeaves,
  expandReplacement,
  lineColOf,
  type FlagChar,
  type RegexMatchRecord,
  type RenderLeaf,
} from '../../tools/regexMatch'
import { watchDebounced } from '../../composables/useDebounce'
import { useCopy } from '../../composables/useCopy'
import { createRegexClient, type RegexOkPayload, type RegexRunOutcome } from './regexMatchClient'
import { REGEX_PRESETS, findPreset } from './regexPresets'

/** FE4 重做核心状态:Worker 异步回流 + 主线程护栏(superseded 静默、catastrophic 提示) */
const pattern = ref('')
const text = ref('')
const flagsOn = ref<Record<FlagChar, boolean>>({ g: true, i: false, m: false, s: false, u: false, y: false })
const hoveredOrdinal = ref<number | null>(null)

const okPayload = ref<RegexOkPayload | null>(null)
const busy = ref(false)
const invalidMessage = ref('')
const guardMessage = ref('')

const FLAG_TIPS: Record<FlagChar, string> = {
  g: '全局:扫描并展示全部出现',
  i: '忽略大小写',
  m: '多行:^ $ 按每一行的首尾匹配',
  s: '点号 · 匹配包括换行符在内',
  u: 'Unicode:完整码点与 \\u{...} 语法',
  y: '粘性:仅从 lastIndex 位置起配',
}

const flagString = computed(() => FLAG_CHARS.filter((f) => flagsOn.value[f]).join(''))

const client = createRegexClient()

function resetOutputs(): void {
  okPayload.value = null
  invalidMessage.value = ''
  guardMessage.value = ''
}

function routeOutcome(outcome: RegexRunOutcome): void {
  if (outcome.kind === 'superseded') return
  busy.value = false
  switch (outcome.kind) {
    case 'ok':
      okPayload.value = outcome.payload
      invalidMessage.value = ''
      guardMessage.value = ''
      break
    case 'invalid':
      resetOutputs()
      invalidMessage.value = outcome.message
      break
    case 'catastrophic':
      resetOutputs()
      guardMessage.value = '表达式存在灾难性回溯,计算已终止,请改写正则或缩短输入'
      break
  }
}

/** 实时式(FE3 范式延续):pattern/flags/text 任一变化即重算,150ms 防抖收敛击键 */
function run(): void {
  if (!pattern.value.trim()) {
    resetOutputs()
    busy.value = false
    return
  }
  busy.value = true
  // 一次请求携带完整快照(pattern/flags/text),由 Worker 原子消费;新请求自动终止在途旧请求
  void client.run({ pattern: pattern.value, flags: flagString.value, text: text.value }).then(routeOutcome)
}

function recomputeNow(): void {
  runner.flush()
}

const runner = watchDebounced([pattern, flagString, text], run)

/** 正则清空立即复位空闲态,不等防抖窗口 */
watch(
  [pattern],
  ([p]) => {
    if (p.trim() === '') {
      runner.cancel()
      resetOutputs()
      busy.value = false
    }
  },
)

/* ---------- 展示派生 ---------- */

const recordsAll = computed<RegexMatchRecord[]>(() => okPayload.value?.matches ?? [])
/** 关闭 g 时只呈现首个匹配(regex101 行为对齐) */
const records = computed(() => (flagsOn.value.g ? recordsAll.value : recordsAll.value.slice(0, 1)))
const matchedCount = computed(() => records.value.length)
const hasResult = computed(() => okPayload.value !== null)

/** 高亮基底文本:超限截断口径与 Worker 内 truncateInput 一致 */
const baseText = computed(() => {
  const payload = okPayload.value
  if (payload === null) return ''
  const limit = payload.truncated ? TEXT_CHAR_LIMIT : payload.originalLength
  return text.value.slice(0, Math.min(limit, text.value.length))
})

const leaves = computed<RenderLeaf[]>(() =>
  okPayload.value === null ? [] : buildRenderLeaves(baseText.value, records.value),
)

interface GroupColumn {
  number: number
  label: string
}

const groupColumns = computed<GroupColumn[]>(() =>
  (records.value[0]?.groups ?? []).map((g) => ({
    number: g.number,
    label: g.name !== null ? `${g.number} · ${g.name}` : String(g.number),
  })),
)

const rowPositions = computed(() => records.value.map((r) => lineColOf(baseText.value, r.start)))

function segStyle(leaf: RenderLeaf): Record<string, string> {
  if (leaf.matchOrdinal === null) return {}
  const style: Record<string, string> = {
    'background-color': MATCH_TINTS[leaf.matchOrdinal % MATCH_TINTS.length]!,
  }
  const stripes: string[] = []
  for (let k = 0; k < leaf.groupNumbers.length; k++) {
    const color = GROUP_STRIPE_COLORS[k % GROUP_STRIPE_COLORS.length]!
    stripes.push(`inset 0 -${2 * (k + 1)}px 0 ${color}`)
  }
  if (stripes.length > 0) style['box-shadow'] = stripes.join(', ')
  return style
}

function markHovered(ordinal: number | null): void {
  hoveredOrdinal.value = ordinal
}

/* ---------- 常用预设(一键填入试跑) ---------- */

const presetId = ref('')

function applyPreset(): void {
  const preset = findPreset(presetId.value)
  if (!preset) return
  pattern.value = preset.pattern
  const wanted = new Set(preset.flags.split(''))
  for (const f of FLAG_CHARS) flagsOn.value[f] = wanted.has(f)
  // 复位选择,使同一预设可编辑后再次一键填入
  presetId.value = ''
}

/* ---------- 替换预览($1/${name},regex101 对齐) ---------- */

const replacementTemplate = ref('')
const { copied, copy } = useCopy()

const replacementOut = computed(() => {
  if (replacementTemplate.value.trim() === '' || okPayload.value === null) return null
  return expandReplacement(baseText.value, records.value, replacementTemplate.value)
})
</script>

<style scoped>
.rgx-view {
  max-height: 18rem;
  overflow: auto;
}
</style>

<template>
  <div class="rgx-root flex flex-col gap-3" @keydown.ctrl.enter.prevent="recomputeNow">
    <h2 class="text-base font-semibold tracking-tight">正则视觉匹配</h2>

    <div class="flex flex-col gap-2">
      <div class="flex gap-2">
        <input v-model="pattern" placeholder="要匹配的正则,如 (\d+)-(\d+)" class="input input-sm font-mono" />
        <select
          v-model="presetId"
          data-testid="preset-select"
          class="select select-sm w-36"
          aria-label="常用正则预设"
          @change="applyPreset"
        >
          <option value="">常用预设…</option>
          <option v-for="p in REGEX_PRESETS" :key="p.id" :value="p.id">{{ p.label }}</option>
        </select>
      </div>
      <div class="flex flex-wrap items-center gap-1" role="group" aria-label="正则 flags 开关">
        <span class="mr-1 text-xs opacity-60">flags</span>
        <button
          v-for="f in FLAG_CHARS"
          :key="f"
          type="button"
          class="tooltip tooltip-bottom btn btn-xs font-mono"
          :class="flagsOn[f] ? 'btn-primary' : 'btn-outline'"
          :data-flag="f"
          :title="FLAG_TIPS[f]"
          :aria-pressed="flagsOn[f]"
          @click="flagsOn[f] = !flagsOn[f]"
        >
          {{ f }}
        </button>
        <span v-if="busy" class="ml-2 badge badge-ghost badge-sm">计算中…</span>
      </div>
      <textarea
        v-model="text"
        rows="8"
        placeholder="在此输入待匹配的文本"
        class="textarea textarea-bordered font-mono"
      />
    </div>

    <p v-if="guardMessage" class="text-error text-sm">{{ guardMessage }}</p>
    <p v-if="invalidMessage" class="text-error text-sm">正则表达式非法:{{ invalidMessage }}</p>

    <div v-if="okPayload?.truncated" class="text-warning text-sm">
      文本超过 200KB,仅前 {{ TEXT_CHAR_LIMIT }} 字符参与匹配(原长 {{ okPayload.originalLength }})
    </div>
    <div v-if="okPayload?.capped" class="text-warning text-sm">
      匹配数量达到上限 {{ MATCH_COUNT_LIMIT }},超出部分已截断
    </div>

    <template v-if="hasResult">
      <pre
        class="rgx-view whitespace-pre-wrap break-all rounded border border-base-300 bg-base-200/60 p-3 font-mono text-sm"
        @mouseleave="markHovered(null)"
        ><template v-for="(leaf, i) in leaves" :key="i"><span
          v-if="leaf.matchOrdinal !== null"
          class="rgx-seg rgx-seg-match rounded-sm px-[1px]"
          :class="{ 'rgx-active': hoveredOrdinal === leaf.matchOrdinal }"
          :style="segStyle(leaf)"
          @mouseenter="markHovered(leaf.matchOrdinal)"
        >{{ leaf.text }}</span><template v-else>{{ leaf.text }}</template></template></pre>

      <p v-if="matchedCount === 0" class="text-sm opacity-60">未匹配到任何内容</p>

      <template v-else>
        <p class="font-semibold text-sm">共 {{ matchedCount }} 处匹配</p>
        <div class="overflow-x-auto">
          <table class="table table-xs font-mono">
            <thead>
              <tr>
                <th>#</th>
                <th>匹配</th>
                <th>位置</th>
                <th v-for="col in groupColumns" :key="col.number">{{ col.label }}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(rec, idx) in records"
                :key="idx"
                :data-testid="`match-row-${idx}`"
                class="cursor-default"
                @mouseenter="markHovered(idx)"
                @mouseleave="markHovered(null)"
              >
                <td>{{ idx + 1 }}</td>
                <td class="whitespace-pre">{{ rec.value }}</td>
                <td data-testid="match-position" class="whitespace-nowrap font-sans">
                  第 {{ rowPositions[idx]?.line }} 行 第 {{ rowPositions[idx]?.column }} 列
                </td>
                <td
                  v-for="col in groupColumns"
                  :key="col.number"
                  :data-testid="`group-cell-${col.number}`"
                  class="whitespace-pre"
                  >{{ rec.groups[col.number - 1]?.value ?? '' }}</td
                >
              </tr>
            </tbody>
          </table>
        </div>
      </template>

      <div class="flex flex-col gap-2 border-t border-base-300 pt-3">
        <label class="flex items-center gap-2 text-sm">
          <span class="shrink-0 opacity-70">替换模板</span>
          <input
            v-model="replacementTemplate"
            data-testid="replacement-input"
            placeholder="支持 $1、${name},如 [$1]-${name}"
            class="input input-sm flex-1 font-mono"
          />
        </label>
        <template v-if="replacementOut !== null">
          <pre
            class="rgx-view max-h-40 whitespace-pre-wrap break-all rounded border border-base-300 bg-base-200/60 p-3 font-mono text-sm"
            >{{ replacementOut.output }}</pre
          >
          <div class="flex items-center gap-2 text-sm">
            <span>共 {{ replacementOut.replacedCount }} 处替换</span>
            <button type="button" data-testid="copy-replacement" class="btn btn-xs btn-ghost" @click="copy(replacementOut.output)">
              {{ copied ? '已复制' : '复制' }}
            </button>
          </div>
        </template>
      </div>
    </template>

    <p v-if="!hasResult && !invalidMessage && !guardMessage" class="text-sm opacity-50">
      输入正则与文本后实时显示匹配结果,Ctrl+Enter 立即重算
    </p>
  </div>
</template>
