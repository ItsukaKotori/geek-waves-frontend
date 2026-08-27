<script setup lang="ts">
import { ref } from 'vue'
import { base64Encode, base64Decode } from '../../tools/encodeDecode'
import { useCopy } from '../../composables/useCopy'
import { useToolState } from '../../composables/useToolState'

type Mode = 'b64' | 'url'

interface EncoderDecoderState {
  mode: Mode
  input: string
}

/** 输入状态经 localStorage 持久化(key 与注册表一致),刷新后恢复;输出为临时结果不入快照 */
const { state } = useToolState<EncoderDecoderState>('b64', { mode: 'b64', input: '' })
const output = ref('')
const error = ref('')
const { copied, copy } = useCopy()

function switchMode(m: Mode) {
  state.mode = m
  output.value = ''
  error.value = ''
}

function run(dir: 'enc' | 'dec') {
  error.value = ''
  output.value = ''
  try {
    if (state.mode === 'b64') {
      output.value = dir === 'enc' ? base64Encode(state.input) : base64Decode(state.input)
    } else {
      output.value = dir === 'enc' ? encodeURIComponent(state.input) : decodeURIComponent(state.input)
    }
  } catch (e) {
    error.value = (e as Error).message || '转换失败'
  }
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <h2 class="text-base font-semibold tracking-tight">Base64 / URL 编解码</h2>
    <div class="tabs tabs-box tabs-sm w-fit">
      <button class="tab" :class="{ 'tab-active': state.mode === 'b64' }" @click="switchMode('b64')">Base64</button>
      <button class="tab" :class="{ 'tab-active': state.mode === 'url' }" @click="switchMode('url')">URL</button>
    </div>
    <textarea
      v-model="state.input"
      rows="6"
      :placeholder="state.mode === 'b64' ? '输入明文或 Base64 字符串' : '输入文本或 URL 编码字符串'"
      class="textarea textarea-bordered font-mono"
    />
    <div class="flex gap-2">
      <button class="btn btn-sm btn-primary" @click="run('enc')">编码</button>
      <button class="btn btn-sm btn-secondary" @click="run('dec')">解码</button>
      <button v-if="output" class="btn btn-sm btn-ghost" @click="copy(output)">
        {{ copied ? '已复制' : '复制' }}
      </button>
    </div>
    <div v-if="error" class="rounded-box border border-error/30 bg-error/5 px-4 py-2.5 text-sm text-error">{{ error }}</div>
    <pre v-if="output" class="whitespace-pre-wrap rounded-box border border-base-300 bg-base-200/60 p-3">{{ output }}</pre>
  </div>
</template>
