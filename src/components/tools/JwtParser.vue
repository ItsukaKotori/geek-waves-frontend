<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { parseJwt, type ParsedJwt } from '../../tools/jwt'
import { useCopy } from '../../composables/useCopy'
import { watchDebounced } from '../../composables/useDebounce'

const token = ref('')
const parsed = ref<ParsedJwt | null>(null)
const error = ref('')
const { copied, copy } = useCopy()

/** 实时式(FE3):输入即出结果、变化即失效旧结果;150ms 防抖收敛连续击键 */
function run(): void {
  error.value = ''
  parsed.value = null
  if (!token.value.trim()) return
  try {
    parsed.value = parseJwt(token.value.trim())
  } catch (e) {
    error.value = (e as Error).message || 'JWT 解析失败'
  }
}

function recomputeNow(): void {
  runner.flush()
}

const runner = watchDebounced([token], run)

/** 清空输入立即失效旧解析结果,不等防抖窗口 */
watch(token, (v) => {
  if (!v.trim()) {
    runner.cancel()
    parsed.value = null
    error.value = ''
  }
})

const leftover = computed(() => {
  const exp = parsed.value?.exp
  if (!parsed.value || exp == null) return ''
  const diff = exp * 1000 - Date.now()
  if (diff <= 0) return ''
  const s = Math.floor(diff / 1000)
  if (s < 60) return `剩余 ${s} 秒后到期`
  const m = Math.floor(s / 60)
  if (m < 60) return `剩余 ${m} 分钟后到期`
  const h = Math.floor(m / 60)
  return `剩余 ${h} 小时 ${m % 60} 分钟后到期`
})

const fullText = computed(() => {
  const p = parsed.value
  if (!p) return ''
  return JSON.stringify({ header: p.header, payload: p.payload }, null, 2)
})
</script>

<template>
  <div class="flex flex-col gap-3" @keydown.ctrl.enter.prevent="recomputeNow">
    <h2 class="text-base font-semibold tracking-tight">JWT 解析</h2>
    <textarea
      v-model="token"
      rows="3"
      placeholder="粘贴 JWT token(header.payload.signature)"
      class="textarea textarea-bordered font-mono"
    />
    <div class="flex gap-2">
      <button v-if="parsed" class="btn btn-sm btn-ghost" @click="copy(fullText)">
        {{ copied ? '已复制' : '复制' }}
      </button>
      <span v-else class="self-center text-xs opacity-50">输入后实时解析,Ctrl+Enter 立即重算</span>
    </div>
    <p v-if="error" class="text-error text-sm">{{ error }}</p>

    <template v-if="parsed">
      <div class="flex flex-wrap items-center gap-2">
        <span :class="parsed.expired ? 'badge badge-error' : 'badge badge-success'">
          {{ parsed.expired ? '已过期' : '未过期' }}
        </span>
        <span v-if="parsed.exp != null" class="text-sm opacity-70">exp: {{ parsed.exp }}</span>
        <span v-else class="text-sm opacity-70">该 token 不含 exp 声明</span>
        <span v-if="leftover" class="text-sm opacity-70">{{ leftover }}</span>
      </div>

      <h3 class="text-sm font-semibold opacity-80">Header</h3>
      <pre class="whitespace-pre-wrap rounded-box border border-base-300 bg-base-200/60 p-3 font-mono text-sm">{{ JSON.stringify(parsed.header, null, 2) }}</pre>

      <h3 class="text-sm font-semibold opacity-80">Payload</h3>
      <pre class="whitespace-pre-wrap rounded-box border border-base-300 bg-base-200/60 p-3 font-mono text-sm">{{ JSON.stringify(parsed.payload, null, 2) }}</pre>
    </template>
  </div>
</template>
