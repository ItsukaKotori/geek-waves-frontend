<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { converters, findConverter, formatJson } from '../../tools/jsonConvert'
import { useCopy } from '../../composables/useCopy'
import { watchDebounced } from '../../composables/useDebounce'

const input = ref('')
const targetId = ref('yaml')
/** true: JSON → 目标格式;false: 目标格式 → JSON */
const toJson = ref(true)
/** 输出视图:'convert' 实时转换;'' 'pretty' 实时格式化(取代原「格式化 JSON」按钮) */
type OutputView = 'convert' | 'pretty'
const view = ref<OutputView>('convert')

const convertOut = ref('')
const convertErr = ref('')
const prettyOut = ref('')
const prettyErr = ref('')
const { copied, copy } = useCopy()

const target = computed(() => findConverter(targetId.value))
const targetLabel = computed(() => target.value?.label ?? '')
/** TS / SQL 仅支持 JSON → 目标(生成),不支持反向解析 */
const oneWayOnly = computed(() => ['ts', 'sql'].includes(targetId.value))

const placeholder = computed(() =>
  toJson.value ? '{"name":"GeekWaves","tags":["vue","daisyui"]}' : `${targetLabel.value} 源文本`,
)

function onTargetChange() {
  if (oneWayOnly.value) toJson.value = true
}

/** 实时式(FE3):输入即出结果、变化即失效旧结果;150ms 防抖收敛连续击键 */
function run(): void {
  const src = input.value
  if (!src.trim()) {
    convertOut.value = ''
    convertErr.value = ''
    prettyOut.value = ''
    prettyErr.value = ''
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
    prettyOut.value = formatJson(src)
    prettyErr.value = ''
  } catch {
    prettyOut.value = ''
    prettyErr.value = 'JSON 语法错误,无法解析'
  }
}

function recomputeNow(): void {
  runner.flush()
}

const runner = watchDebounced([input, targetId, toJson], run)

/** 清空输入立即失效旧结果,不等防抖窗口 */
watch(input, (v) => {
  if (v.trim() !== '') return
  runner.cancel()
  run()
})

const shownOutput = computed(() => (view.value === 'convert' ? convertOut.value : prettyOut.value))
const shownError = computed(() => (view.value === 'convert' ? convertErr.value : prettyErr.value))

function swap(): void {
  if (!shownOutput.value) return
  input.value = shownOutput.value
}
</script>

<template>
  <div class="flex flex-col gap-3" @keydown.ctrl.enter.prevent="recomputeNow">
    <h2 class="text-base font-semibold tracking-tight">JSON 转换</h2>

    <div class="flex flex-wrap items-center gap-2">
      <span class="badge badge-ghost badge-sm font-mono">JSON</span>
      <button
        type="button"
        class="btn btn-xs"
        :class="toJson ? 'btn-primary' : 'btn-ghost'"
        :disabled="oneWayOnly && !toJson"
        @click="toJson = true"
      >
        →
      </button>
      <select v-model="targetId" class="select select-sm w-40" @change="onTargetChange">
        <option v-for="c in converters" :key="c.id" :value="c.id">{{ c.label }}</option>
      </select>
      <button
        type="button"
        class="btn btn-xs"
        :class="!toJson ? 'btn-primary' : 'btn-ghost'"
        :disabled="oneWayOnly"
        :title="oneWayOnly ? `${targetLabel} 不支持反向解析` : '反向转换'"
        @click="toJson = false"
      >
        ←
      </button>
      <span v-if="oneWayOnly" class="text-xs text-base-content/50">{{ targetLabel }} 仅支持 JSON → {{ targetLabel }}</span>
    </div>

    <textarea v-model="input" rows="10" :placeholder="placeholder" class="textarea textarea-bordered font-mono" />

    <div class="tabs tabs-box tabs-sm w-fit">
      <button class="tab" :class="{ 'tab-active': view === 'convert' }" @click="view = 'convert'">
        转换输出 → {{ toJson ? targetLabel : 'JSON' }}
      </button>
      <button class="tab" :class="{ 'tab-active': view === 'pretty' }" @click="view = 'pretty'">JSON 美化</button>
    </div>

    <div class="flex flex-wrap gap-2">
      <button v-if="shownOutput" class="btn btn-sm btn-ghost" @click="swap">↑ 结果作为输入</button>
      <button v-if="shownOutput" class="btn btn-sm btn-ghost" @click="copy(shownOutput)">
        {{ copied ? '已复制' : '复制' }}
      </button>
      <span v-if="!shownOutput && !shownError" class="self-center text-xs opacity-50">
        输入后实时出结果,Ctrl+Enter 立即重算
      </span>
    </div>

    <p v-if="shownError" class="text-error text-sm">{{ shownError }}</p>
    <pre v-if="shownOutput" class="max-h-96 overflow-auto whitespace-pre-wrap rounded-box border border-base-300 bg-base-200/60 p-3">{{ shownOutput }}</pre>
  </div>
</template>
