<script setup lang="ts">
import { computed, ref } from 'vue'
import { httpRequest } from '../../api/toolsApi'
import type { HttpResult } from '../../types'
import ErrorBanner from '../ui/ErrorBanner.vue'
import { useCopy } from '../../composables/useCopy'
import { useToolState } from '../../composables/useToolState'
import {
  appendHistoryEntry,
  clearHttpHistory,
  headerRowsToRecord,
  historyFromCommand,
  loadHttpHistory,
  MAX_RESPONSE_PREVIEW_CHARS,
  parseCurl,
  recordToHeaderRows,
  renderBodyPreview,
  saveHttpHistory,
  type HttpHistoryEntry,
} from '../../tools/httpTester'
import type { HeaderRow } from '../../tools/httpTester'

/** 输入经 localStorage 持久化(key 与注册表一致),刷新后恢复 */
interface HttpTesterState {
  method: string
  url: string
  /** key-value 行式 Header 编辑;序列化时空键跳过、重复键靠后者胜出 */
  headerRows: HeaderRow[]
  body: string
  timeoutMs: number | string
  /** 待解析的 curl 命令草稿 */
  curlDraft: string
}

const { state } = useToolState<HttpTesterState>('http', {
  method: 'GET',
  url: '',
  headerRows: [{ key: '', value: '' }],
  body: '',
  timeoutMs: 30000,
  curlDraft: '',
})

/* 动态合并自定义方法(curl 导入可能带回方法表之外的值,如实呈现而非静默改写) */
const BASE_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']
const methodOptions = computed(() =>
  Array.from(new Set([...BASE_METHODS, state.method.toUpperCase()])),
)

const loading = ref(false)
const result = ref<HttpResult | null>(null)
const error = ref('')
const curlError = ref('')
const curlOk = ref('')

const { copied, copy } = useCopy()

/* ------------------------------ Header 行编辑 ------------------------------ */

function addRow(): void {
  state.headerRows.push({ key: '', value: '' })
}

function removeRow(index: number): void {
  state.headerRows.splice(index, 1)
}

/* -------------------------------- curl 导入 -------------------------------- */

/**
 * 导入语义:仅回填解析到的字段(未出现的部分保持现状不误伤草稿);
 * 导入 ≠ 发送,HTTP 仍需显式触发。
 */
function importCurl(): void {
  curlError.value = ''
  curlOk.value = ''
  let p: ReturnType<typeof parseCurl>
  try {
    p = parseCurl(state.curlDraft)
  } catch (e) {
    curlError.value = (e as Error).message
    return
  }
  state.method = p.method
  state.url = p.url
  state.headerRows = recordToHeaderRows(p.headers)
  if (p.body !== undefined) state.body = p.body
  curlOk.value = `已回填 ${p.method} ${p.url}(未在命令中出现的字段保持原值)`
}

function clearCurlDraft(): void {
  state.curlDraft = ''
  curlError.value = ''
  curlOk.value = ''
}

/* ---------------------------------- 发送 ----------------------------------- */

async function send() {
  if (loading.value) return
  error.value = ''
  curlOk.value = ''
  result.value = null
  if (!state.url.trim()) {
    error.value = '请输入请求 URL'
    return
  }
  const headers = headerRowsToRecord(state.headerRows ?? [])
  const command = {
    method: state.method,
    url: state.url.trim(),
    headers: Object.keys(headers).length > 0 ? headers : undefined,
    body: state.body.trim() ? state.body : undefined,
    timeoutMs:
      Number.isFinite(Number(state.timeoutMs)) && Number(state.timeoutMs) > 0
        ? Math.floor(Number(state.timeoutMs))
        : 30000,
  }
  loading.value = true
  try {
    result.value = await httpRequest(command)
    // 仅发送成功的请求进入历史(超时/网络失败重放价值存疑且避免噪声)
    historyList.value = appendHistoryEntry(historyList.value, historyFromCommand(command))
    saveHttpHistory(historyList.value)
  } catch (e) {
    error.value = (e as Error).message || '请求失败'
  } finally {
    loading.value = false
  }
}

/* ---------------------------------- 历史 ----------------------------------- */

const historyList = ref<HttpHistoryEntry[]>(loadHttpHistory())

function refill(entry: HttpHistoryEntry): void {
  state.method = entry.method.toUpperCase()
  state.url = entry.url
  state.headerRows = recordToHeaderRows(entry.headers)
  state.body = entry.body
}

function clearHistory(): void {
  historyList.value = []
  clearHttpHistory()
}

/* ------------------------------- 结果展示层 ------------------------------- */

const contentType = computed(() => {
  const headers = result.value?.headers ?? {}
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase().trim() === 'content-type') return v
  }
  return undefined
})

const bodyView = computed(() => renderBodyPreview(contentType.value, result.value?.body ?? ''))

function copyOriginalBody(): void {
  copy(result.value?.body ?? '')
}
</script>

<template>
  <div class="flex flex-col gap-3" @keydown.ctrl.enter.prevent="send">
    <h2 class="text-base font-semibold tracking-tight">HTTP 接口测试</h2>
    <div class="flex gap-2">
      <select v-model="state.method" class="select select-sm w-28" aria-label="请求方法">
        <option v-for="m in methodOptions" :key="m" :value="m">{{ m }}</option>
      </select>
      <input
        v-model="state.url"
        placeholder="https://example.com(请求 URL)"
        class="input input-sm flex-1 font-mono"
      />
      <button class="btn btn-sm btn-primary" :disabled="loading" @click="send">
        {{ loading ? '发送中…' : '发送' }}
      </button>
    </div>
    <span class="text-xs opacity-50">Ctrl+Enter 快捷发送;HTTP 请求保持显式触发,不随输入自动发送</span>
    <p class="text-xs opacity-60">
      示例:https://example.com。后端 SSRF 守卫会拦截 localhost/内网地址,请使用公网 URL(返回 403 即被拦截)。
    </p>

    <!-- curl 导入 -->
    <section class="flex flex-col gap-1">
      <textarea
        v-model="state.curlDraft"
        rows="3"
        placeholder="粘贴 curl 命令导入(-X/-H/-d/--data/--data-raw/-A/-u 等),支持单双引号与行尾 \ 续行"
        aria-label="curl 命令"
        class="textarea textarea-sm textarea-bordered font-mono"
      />
      <div class="flex items-center gap-2">
        <button class="btn btn-sm btn-secondary" @click="importCurl">导入解析</button>
        <button class="btn btn-sm btn-ghost" @click="clearCurlDraft">清空命令</button>
        <span class="text-xs opacity-50">导入只做回填,不会自动发送;超出声明范围的写法会明确报错而非误读</span>
      </div>
      <p v-if="curlError" class="text-error text-sm">{{ curlError }}</p>
      <p v-if="curlOk" class="text-success text-sm">{{ curlOk }}</p>
    </section>

    <!-- Header 行编辑 -->
    <section class="flex flex-col gap-1">
      <h3 class="text-sm font-semibold opacity-80">Headers(key-value)</h3>
      <div v-for="(row, i) in state.headerRows" :key="i" class="flex items-center gap-2">
        <input v-model="row.key" placeholder="键(如 Content-Type)" class="input input-sm flex-1 font-mono" />
        <input v-model="row.value" placeholder="值" class="input input-sm flex-1 font-mono" />
        <button class="btn btn-sm btn-ghost" aria-label="删除该行" @click="removeRow(i)">✕</button>
      </div>
      <div class="flex items-center gap-2">
        <button class="btn btn-sm btn-outline" @click="addRow">＋ 添加 Header</button>
        <span class="text-xs opacity-50">空键的行发送时会被跳过</span>
      </div>
    </section>

    <textarea
      v-model="state.body"
      rows="4"
      placeholder="Body(非 GET,可留空)"
      class="textarea textarea-sm textarea-bordered font-mono"
    />
    <div class="flex items-center gap-2">
      <label for="timeout-ms" class="text-sm opacity-70">超时(ms)</label>
      <input id="timeout-ms" v-model.number="state.timeoutMs" type="number" min="500" class="input input-sm w-28" />
      <span class="text-xs opacity-60">默认 30000</span>
    </div>

    <!-- 请求历史 -->
    <section v-if="historyList.length > 0" class="flex flex-col gap-1">
      <div class="flex items-center justify-between">
        <h3 class="text-sm font-semibold opacity-80">请求历史(最近 {{ historyList.length }} 条,localStorage)</h3>
        <button class="btn btn-sm btn-ghost" @click="clearHistory">清空历史</button>
      </div>
      <button
        v-for="(e, i) in historyList"
        :key="`${e.method}-${e.url}-${i}`"
        class="btn btn-sm justify-start overflow-hidden text-left"
        :title="[e.method, e.url].join(' ')"
        @click="refill(e)"
      >
        <code class="truncate font-mono text-xs">
          [{{ e.method }}] {{ e.url }}
        </code>
      </button>
      <span class="text-xs opacity-50">点击条目回填参数(body 超过 2000 字符的部分不会入史)</span>
    </section>

    <ErrorBanner v-if="error" :message="error" dismissible @close="error = ''" />

    <div v-if="result">
      <div class="mockup-code max-h-96 overflow-auto text-sm">
        <pre>HTTP {{ result.status }} · {{ result.tookMs }}ms</pre>
        <pre v-for="(v, k) in result.headers" :key="k">{{ k }}: {{ v }}</pre>
        <pre v-if="bodyView.text" class="whitespace-pre-wrap">{{ bodyView.text }}</pre>
        <pre v-else>(空响应体)</pre>
      </div>
      <div class="mt-1 flex flex-wrap items-center gap-2 text-xs">
        <span v-if="bodyView.pretty" class="badge badge-info badge-outline">JSON 已美化展示</span>
        <span v-if="bodyView.truncated" class="badge badge-warning badge-outline">
          响应体超过 {{ MAX_RESPONSE_PREVIEW_CHARS }} 字符阈值,已截断:仅显示前 {{ bodyView.previewChars }} 字符 / 完整共 {{ bodyView.totalChars }} 字符
        </span>
        <span v-else class="opacity-60">{{ bodyView.totalChars }} 字符 · 截断阈值 {{ MAX_RESPONSE_PREVIEW_CHARS }} 字符</span>
        <button class="btn btn-xs btn-ghost" @click="copyOriginalBody">
          {{ copied ? '已复制' : '复制原文' }}
        </button>
      </div>
    </div>
  </div>
</template>
