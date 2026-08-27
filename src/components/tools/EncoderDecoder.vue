<script setup lang="ts">
import { ref, watch } from 'vue'
import { base64Encode, base64Decode } from '../../tools/encodeDecode'
import { useCopy } from '../../composables/useCopy'
import { useToolState } from '../../composables/useToolState'
import { watchDebounced } from '../../composables/useDebounce'

type Mode = 'b64' | 'url'

interface EncoderDecoderState {
  mode: Mode
  input: string
}

/** 输入状态经 localStorage 持久化(key 与注册表一致),刷新后恢复;输出为临时结果不入快照 */
const { state } = useToolState<EncoderDecoderState>('b64', { mode: 'b64', input: '' })
const encoded = ref('')
const decoded = ref('')
const decodedError = ref('')
const { copied, copy } = useCopy()

/**
 * 实时式(FE3):输入即出结果、变化即失效旧结果;150ms 防抖收敛连续击键。
 * 编码面永远不会失败(纯字节变换),解码失败给出行内错误。
 */
function run(): void {
  const src = state.input
  if (!src) {
    encoded.value = ''
    decoded.value = ''
    decodedError.value = ''
    return
  }
  try {
    encoded.value = state.mode === 'b64' ? base64Encode(src) : encodeURIComponent(src)
  } catch (e) {
    encoded.value = ''
    decodedError.value = (e as Error).message || '转换失败'
    return
  }
  try {
    decoded.value = state.mode === 'b64' ? base64Decode(src) : decodeURIComponent(src)
    decodedError.value = ''
  } catch (e) {
    decoded.value = ''
    decodedError.value = (e as Error).message || '转换失败'
  }
}

/** Ctrl+Enter 兜底:立即重算一次 */
function recomputeNow(): void {
  runner.flush()
}

const runner = watchDebounced([() => state.mode, () => state.input], run)

/** 清空输入立即失效旧结果,不等防抖窗口 */
watch(
  () => state.input,
  (v) => {
    if (v !== '') return
    runner.cancel()
    encoded.value = ''
    decoded.value = ''
    decodedError.value = ''
  },
)
</script>

<template>
  <div class="flex flex-col gap-3" @keydown.ctrl.enter.prevent="recomputeNow">
    <h2 class="text-base font-semibold tracking-tight">Base64 / URL 编解码</h2>
    <div class="tabs tabs-box tabs-sm w-fit">
      <button class="tab" :class="{ 'tab-active': state.mode === 'b64' }" @click="state.mode = 'b64'">Base64</button>
      <button class="tab" :class="{ 'tab-active': state.mode === 'url' }" @click="state.mode = 'url'">URL</button>
    </div>
    <textarea
      v-model="state.input"
      rows="6"
      :placeholder="state.mode === 'b64' ? '输入明文或 Base64 字符串' : '输入文本或 URL 编码字符串'"
      class="textarea textarea-bordered font-mono"
    />
    <div v-if="decodedError" class="rounded-box border border-error/30 bg-error/5 px-4 py-2.5 text-sm text-error">
      {{ decodedError }}
    </div>
    <section v-if="encoded || decoded || decodedError" class="flex flex-col gap-3">
      <div>
        <h3 class="pb-1 text-sm font-semibold opacity-80">{{ state.mode === 'b64' ? '编码 → Base64' : '编码 → URL' }}</h3>
        <pre class="whitespace-pre-wrap rounded-box border border-base-300 bg-base-200/60 p-3 font-mono text-sm">{{ encoded }}</pre>
      </div>
      <div v-if="!decodedError">
        <h3 class="pb-1 text-sm font-semibold opacity-80">{{ state.mode === 'b64' ? '解码 → 明文' : '解码 → 文本' }}</h3>
        <pre v-if="decoded" class="whitespace-pre-wrap rounded-box border border-base-300 bg-base-200/60 p-3 font-mono text-sm">{{ decoded }}</pre>
      </div>
      <button
        v-if="(encoded || decoded) && !decodedError"
        class="btn btn-sm btn-ghost w-fit"
        @click="copy(encoded || decoded)"
      >
        {{ copied ? '已复制' : '复制编码结果' }}
      </button>
    </section>
  </div>
</template>
