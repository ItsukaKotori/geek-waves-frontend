<script setup lang="ts">
import { ref } from 'vue'
import { httpRequest } from '../../api/toolsApi'
import type { HttpResult } from '../../types'

const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']

const method = ref('GET')
const url = ref('')
const headersText = ref('')
const body = ref('')
const timeoutMs = ref(30000)
const loading = ref(false)
const result = ref<HttpResult | null>(null)
const error = ref('')

function parseHeaders(text: string): Record<string, string> {
  if (!text.trim()) return {}
  const obj: unknown = JSON.parse(text)
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    throw new Error('headers 需为 JSON 对象,如 {"Authorization":"Bearer x"}')
  }
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(obj)) {
    out[k] = typeof v === 'string' ? v : JSON.stringify(v)
  }
  return out
}

async function send() {
  if (loading.value) return
  error.value = ''
  result.value = null
  if (!url.value.trim()) {
    error.value = '请输入请求 URL'
    return
  }
  let headers: Record<string, string> | undefined
  try {
    headers = parseHeaders(headersText.value)
  } catch (e) {
    error.value = (e as Error).message
    return
  }
  loading.value = true
  try {
    result.value = await httpRequest({
      method: method.value,
      url: url.value.trim(),
      headers,
      body: body.value.trim() ? body.value : undefined,
      timeoutMs: Number.isFinite(timeoutMs.value) && timeoutMs.value > 0 ? Math.floor(timeoutMs.value) : 30000,
    })
  } catch (e) {
    error.value = (e as Error).message || '请求失败'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-3" @keydown.ctrl.enter.prevent="send">
    <h2 class="text-base font-semibold tracking-tight">HTTP 接口测试</h2>
    <div class="flex gap-2">
      <select v-model="method" class="select select-sm w-28">
        <option v-for="m in methods" :key="m" :value="m">{{ m }}</option>
      </select>
      <input v-model="url" placeholder="https://example.com" class="input input-sm flex-1 font-mono" />
      <button class="btn btn-sm btn-primary" :disabled="loading" @click="send">
        {{ loading ? '发送中…' : '发送' }}
      </button>
    </div>
    <span class="text-xs opacity-50">Ctrl+Enter 快捷发送;HTTP 请求保持显式触发,不随输入自动发送</span>
    <p class="text-xs opacity-60">
      示例:https://example.com。后端 SSRF 守卫会拦截 localhost/内网地址,请使用公网 URL(返回 403 即被拦截)。
    </p>
    <textarea
      v-model="headersText"
      rows="2"
      placeholder='Header JSON,如 {"Authorization":"Bearer x"}'
      class="textarea textarea-sm textarea-bordered font-mono"
    />
    <textarea v-model="body" rows="4" placeholder="Body(非 GET,可留空)" class="textarea textarea-sm textarea-bordered font-mono" />
    <div class="flex items-center gap-2">
      <label for="timeout-ms" class="text-sm opacity-70">超时(ms)</label>
      <input id="timeout-ms" v-model.number="timeoutMs" type="number" min="500" class="input input-sm w-28" />
      <span class="text-xs opacity-60">默认 30000</span>
    </div>
    <div v-if="error" class="rounded-box border border-error/30 bg-error/5 px-4 py-2.5 text-sm text-error">{{ error }}</div>

    <div v-if="result" class="mockup-code max-h-96 overflow-auto text-sm">
      <pre>HTTP {{ result.status }} · {{ result.tookMs }}ms</pre>
      <pre v-for="(v, k) in result.headers" :key="k">{{ k }}: {{ v }}</pre>
      <pre class="whitespace-pre-wrap">{{ result.body || '(空响应体)' }}</pre>
    </div>
  </div>
</template>
