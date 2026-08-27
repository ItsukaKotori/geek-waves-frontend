<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  extractTimeClaims,
  parseJwt,
  type AlgAssessment,
  type HumanTimeClaim,
  type ParsedJwt,
} from '../../tools/jwt'
import { useCopy } from '../../composables/useCopy'
import { useToolState } from '../../composables/useToolState'
import { watchDebounced } from '../../composables/useDebounce'

interface JwtState {
  token: string
}

/** token 持久化(key 与注册表一致),刷新后恢复;解析结果不入快照 */
const { state } = useToolState<JwtState>('jwt', { token: '' })

const parsed = ref<ParsedJwt | null>(null)
const error = ref('')
const { copied, copy } = useCopy()

/** 实时式(FE3/FE6):输入即出结果、变化即失效旧结果;150ms 防抖收敛连续击键 */
function run(): void {
  error.value = ''
  parsed.value = null
  const t = state.token.trim()
  if (!t) return
  try {
    parsed.value = parseJwt(t)
  } catch (e) {
    error.value = (e as Error).message || 'JWT 解析失败'
  }
}

function recomputeNow(): void {
  runner.flush()
}

const runner = watchDebounced([() => state.token], run)

/** 清空输入立即失效旧解析结果,不等防抖窗口 */
watch(
  () => state.token,
  (v) => {
    if (v.trim()) return
    runner.cancel()
    parsed.value = null
    error.value = ''
  },
)

/** alg 徽章文案与语义色 */
const algBadge = computed<{ text: string; cls: string } | null>(() => {
  const a: AlgAssessment | null = parsed.value?.assessment ?? null
  if (!a) return null
  if (a.level === 'danger') return { text: `危险算法 ${a.alg}`, cls: 'badge-error' }
  if (a.level === 'caution') return { text: `可疑算法 ${a.alg}`, cls: 'badge-warning' }
  return { text: `安全算法 ${a.alg}`, cls: 'badge-success' }
})

/** iat/nbf/exp 全量人性化声明 */
const timeClaims = computed<HumanTimeClaim[]>(() =>
  extractTimeClaims(parsed.value?.payload),
)

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
      v-model="state.token"
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
        <!-- alg 安全分级徽章:none/缺失=危险;注册表外或笔误=可疑;已注册=安全 -->
        <span v-if="algBadge" class="badge" :class="algBadge.cls">{{ algBadge.text }}</span>
        <!-- 验签提示:本工具仅解码,不校验签名 -->
        <span class="badge badge-outline badge-warning">未验签 · 仅解码</span>
        <span v-if="parsed.signatureEmpty" class="badge badge-error">签名为空</span>
        <span :class="parsed.expired ? 'badge badge-error' : 'badge badge-success'">
          {{ parsed.expired ? '已过期' : '未过期' }}
        </span>
        <span v-if="leftover" class="text-sm opacity-70">{{ leftover }}</span>
      </div>

      <h3 class="text-sm font-semibold opacity-80">时间声明(iat/nbf/exp)</h3>
      <div v-if="timeClaims.length" class="grid gap-1">
        <div v-for="c in timeClaims" :key="c.claim" class="flex flex-wrap items-center gap-x-3 gap-y-1">
          <code class="w-28 shrink-0 rounded border border-base-300 bg-base-200/60 px-1.5 py-0.5 font-mono text-xs">{{ c.claim }}={{ c.s }}</code>
          <code class="font-mono text-xs opacity-80">{{ c.iso }} UTC</code>
          <code class="rounded px-1.5 py-0.5 font-mono text-xs text-primary">{{ c.relative }}</code>
        </div>
      </div>
      <p v-else class="text-xs opacity-60">该 token 不含 iat/nbf/exp 声明</p>

      <h3 class="text-sm font-semibold opacity-80">Header</h3>
      <pre class="whitespace-pre-wrap rounded-box border border-base-300 bg-base-200/60 p-3 font-mono text-sm">{{ JSON.stringify(parsed.header, null, 2) }}</pre>

      <h3 class="text-sm font-semibold opacity-80">Payload</h3>
      <pre class="whitespace-pre-wrap rounded-box border border-base-300 bg-base-200/60 p-3 font-mono text-sm">{{ JSON.stringify(parsed.payload, null, 2) }}</pre>
    </template>
  </div>
</template>
