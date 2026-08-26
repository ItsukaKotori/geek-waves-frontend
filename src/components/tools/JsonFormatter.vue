<script setup lang="ts">
import { computed, ref } from 'vue'
import { converters, findConverter, formatJson } from '../../tools/jsonConvert'
import { useCopy } from '../../composables/useCopy'

const input = ref('')
const output = ref('')
const error = ref('')
const targetId = ref('yaml')
/** true: JSON → 目标格式;false: 目标格式 → JSON */
const toJson = ref(true)
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

function run() {
  error.value = ''
  output.value = ''
  const conv = target.value
  if (!conv) return
  try {
    output.value = toJson.value ? conv.fromJson(input.value) : conv.toJson(input.value)
  } catch (e) {
    error.value = (e as Error).message || '转换失败'
  }
}

function prettyPrint() {
  error.value = ''
  output.value = ''
  try {
    output.value = formatJson(input.value)
  } catch {
    error.value = 'JSON 语法错误,无法解析'
  }
}

function swap() {
  if (!output.value) return
  input.value = output.value
  output.value = ''
  error.value = ''
}
</script>

<template>
  <div class="flex flex-col gap-3">
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

    <textarea
      v-model="input"
      rows="10"
      :placeholder="placeholder"
      class="textarea textarea-bordered font-mono"
    />

    <div class="flex flex-wrap gap-2">
      <button class="btn btn-sm btn-primary" :disabled="!input.trim()" @click="run">
        {{ toJson ? `JSON → ${targetLabel}` : `${targetLabel} → JSON` }}
      </button>
      <button class="btn btn-sm btn-ghost" :disabled="!input.trim()" @click="prettyPrint">格式化 JSON</button>
      <button v-if="output" class="btn btn-sm btn-ghost" @click="swap">↑ 结果作为输入</button>
      <button v-if="output" class="btn btn-sm btn-ghost" @click="copy(output)">
        {{ copied ? '已复制' : '复制' }}
      </button>
    </div>

    <p v-if="error" class="text-error text-sm">{{ error }}</p>
    <pre v-if="output" class="max-h-96 overflow-auto whitespace-pre-wrap rounded-box border border-base-300 bg-base-200/60 p-3">{{ output }}</pre>
  </div>
</template>
