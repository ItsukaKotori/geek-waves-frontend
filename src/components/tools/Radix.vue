<script setup lang="ts">
import { ref } from 'vue'
import { radixConvert } from '../../tools/radix'
import { useCopy } from '../../composables/useCopy'
import { useToolState } from '../../composables/useToolState'

const bases = Array.from({ length: 35 }, (_, i) => i + 2)

interface RadixState {
  input: string
  from: number
  to: number
}

/** 输入与进制选择持久化(key 与注册表一致),刷新后恢复;输出为临时结果不入快照 */
const { state } = useToolState<RadixState>('radix', { input: '', from: 10, to: 16 })
const output = ref('')
const error = ref('')
const { copied, copy } = useCopy()

function run() {
  error.value = ''
  output.value = ''
  try {
    output.value = radixConvert(state.input, state.from, state.to)
  } catch (e) {
    error.value = (e as Error).message || '转换失败'
  }
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <h2 class="text-base font-semibold tracking-tight">进制转换</h2>
    <input v-model="state.input" placeholder="如 ff(十六进)、1010(二进)或 42(十进制)" class="input input-sm font-mono" />
    <div class="flex items-center gap-2">
      <select v-model="state.from" class="select select-sm w-28">
        <option v-for="b in bases" :key="b" :value="b">{{ b }} 进制</option>
      </select>
      <span class="text-base-content/60">→</span>
      <select v-model="state.to" class="select select-sm w-28">
        <option v-for="b in bases" :key="b" :value="b">{{ b }} 进制</option>
      </select>
      <button class="btn btn-sm btn-primary" @click="run">转换</button>
    </div>
    <p v-if="error" class="text-error text-sm">{{ error }}</p>
    <div v-if="output" class="flex items-start gap-2">
      <pre class="flex-1 whitespace-pre-wrap rounded-box border border-base-300 bg-base-200/60 p-3 font-mono">{{ output }}</pre>
      <button class="btn btn-sm btn-ghost" @click="copy(output)">
        {{ copied ? '已复制' : '复制' }}
      </button>
    </div>
  </div>
</template>
