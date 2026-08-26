<script setup lang="ts">
import { ref } from 'vue'
import { formatJson } from '../../tools/jsonUtils'
import { useCopy } from '../../composables/useCopy'

const input = ref('')
const output = ref('')
const error = ref('')
const { copied, copy } = useCopy()

function run() {
  error.value = ''
  output.value = ''
  try {
    output.value = formatJson(input.value)
  } catch {
    error.value = 'JSON 语法错误,无法解析'
  }
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <h2 class="text-base font-semibold tracking-tight">JSON 格式化</h2>
    <textarea
      v-model="input"
      rows="10"
      placeholder='{"name":"GeekWaves","tags":["vue","daisyui"]}'
      class="textarea textarea-bordered font-mono"
    />
    <div class="flex gap-2">
      <button class="btn btn-sm btn-primary" @click="run">格式化</button>
      <button v-if="output" class="btn btn-sm btn-ghost" @click="copy(output)">
        {{ copied ? '已复制' : '复制' }}
      </button>
    </div>
    <p v-if="error" class="text-error text-sm">{{ error }}</p>
    <pre v-if="output" class="whitespace-pre-wrap rounded-box border border-base-300 bg-base-200/60 p-3">{{ output }}</pre>
  </div>
</template>
