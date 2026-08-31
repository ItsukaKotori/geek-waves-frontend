/**
 * HttpTester 纯函数层:curl 导入解析、Header 行编辑序列化、响应美化/截断、请求历史存取。
 * 与 UI 解耦,便于 vitest 直测(httpTester.spec.ts)。
 */

import { toolStateStorageKey } from '../composables/useToolState'
import type { HttpCommand } from '../types'

/* ---------------------------------- curl 解析 ---------------------------------- */

export interface CurlParts {
  method: string
  url: string
  headers: Record<string, string>
  body?: string
}

/** 纯噪声布尔短旗标(可忽略);-I/-G/--head 除外 —— 它们影响方法或行为 */
const SAFE_SHORT_CLUSTER_LETTERS = 'sSkLvi#0'
/** 短旗标簇中可夹带(含簇首)的请求方法字母(-I/-G,等价 --head/--get) */
const SAFE_SHORT_METHOD_LETTERS = 'IG'

interface LongOption {
  /** 需要消费一个值(空格或 = 分隔) */
  value?: 'header' | 'method' | 'ua' | 'referer' | 'user' | 'data' | 'url' | 'cookie' | 'ignore'
  boolean?: boolean
}

/**
 * 支持的长选项表。声明范围:
 * - 方法:-X/--request
 * - 头:-H/--header(可多次)、-A/--user-agent、-e/--referer、-u/--user(Basic)、-b/--cookie
 * - 数据:-d/--data/--data-raw/--data-binary(多条按 curl 原语义以 & 连接)
 * - URL:裸参数或 --url
 * - 方法短旗标:-I/-G(等价 --head/--get)
 * - 忽略的杂项:-s/-S/-k/-L/-i/-v/-#/-0/--compressed/--http1.1/--http2 等;
 *   带值忽略:--max-time/--connect-timeout/--retry/-o(输出)/-c(cookie-jar)等
 */
const LONG_OPTIONS: Record<string, LongOption> = {
  request: { value: 'method' },
  header: { value: 'header' },
  'user-agent': { value: 'ua' },
  referer: { value: 'referer' },
  user: { value: 'user' },
  data: { value: 'data' },
  'data-raw': { value: 'data' },
  'data-binary': { value: 'data' },
  url: { value: 'url' },
  head: { boolean: true },
  get: { boolean: true },
  silent: { boolean: true },
  'show-error': { boolean: true },
  insecure: { boolean: true },
  location: { boolean: true },
  include: { boolean: true },
  verbose: { boolean: true },
  compressed: { boolean: true },
  progress: { boolean: true },
  'progress-bar': { boolean: true },
  'http1.0': { boolean: true },
  'http1.1': { boolean: true },
  http2: { boolean: true },
  fail: { boolean: true },
  noproxy: { value: 'ignore' },
  proxy: { value: 'ignore' },
  proxytunnel: { boolean: true },
  retry: { value: 'ignore' },
  'max-time': { value: 'ignore' },
  'connect-timeout': { value: 'ignore' },
  output: { value: 'ignore' },
  cookie: { value: 'cookie' },
  'cookie-jar': { value: 'ignore' },
}

/** 显式拒绝的数据来源/形态,防止静默误解语义 */
const REJECTED_LONG_OPTIONS: Record<string, string> = {
  form: '-F/--form(multipart)暂不支持',
  'form-string': '--form-string(multipart)暂不支持',
  'data-urlencode': '--data-urlencode(需要 URL 编码语义)暂不支持',
  upload: '-T/--upload-file 暂不支持',
  json: '--json 暂不支持(请用 -H Content-Type + --data-raw)',
}

/** 布尔旗标 → 请求方法:短旗标首字母(-I/-G)与长旗标名(--head/--get)同表 */
const SAFE_BOOLEAN_METHOD_MAP: Record<string, string> = {
  I: 'HEAD',
  G: 'GET',
  head: 'HEAD',
  get: 'GET',
}

export function parseCurl(input: string): CurlParts {
  const trimmed = input.trim()
  if (!trimmed) throw new Error('请粘贴 curl 命令')
  const tokens = tokenizeCurl(trimmed)

  const first = tokens.shift()
  if (!first || first.split('/').at(-1)!.toLowerCase() !== 'curl') {
    throw new Error('不是有效的 curl 命令(需以 curl 开头)')
  }

  let method: string | undefined
  let url: string | undefined
  const headers: Record<string, string> = {}
  const dataParts: string[] = []

  while (tokens.length > 0) {
    const token = tokens.shift()!
    if (!token.startsWith('-')) {
      takeUrl(token)
      continue
    }
    if (token.startsWith('--')) {
      handleLong(token.slice(2))
    } else {
      handleShort(token.slice(1))
    }
  }

  if (url === undefined) throw new Error('curl 命令中未找到 URL(http/https)')
  if (!/^https?:\/\//i.test(url)) {
    throw new Error(`仅支持 http/https URL(收到:${url})`)
  }
  method = (method ?? (dataParts.length > 0 ? 'POST' : 'GET')).toUpperCase()

  return {
    method,
    url,
    headers,
    body: dataParts.length > 0 ? dataParts.join('&') : undefined,
  }

  /* ---------- 内部动作 ---------- */

  function takeUrl(candidate: string): void {
    if (url !== undefined) throw new Error('仅支持一个 URL,检测到多个 URL')
    url = candidate
  }

  function setHeader(raw: string): void {
    // 仅允许 Name: value / Name:(空值);Name; 形式(curl 清除头)超范围
    const idx = raw.indexOf(':')
    if (idx <= 0) throw new Error(`无效的 -H 头「${raw}」:缺少冒号分隔`)
    headers[raw.slice(0, idx).trim()] = raw.slice(idx + 1).trimStart()
  }

  function takeData(value: string): void {
    if (value.startsWith('@')) throw new Error(`暂不支持 @文件 引用(如 ${value})`)
    dataParts.push(value)
  }

  /** -b/--cookie:字符串字面量即 Cookie 头;@文件与文件名形式(curl 语义:不含 = 视为文件)拒绝 */
  function setCookie(value: string): void {
    if (value.startsWith('@') || !value.includes('=')) {
      throw new Error(`-b/--cookie 的 cookie 文件形式暂不支持(收到:${value})`)
    }
    headers.Cookie = value
  }

  function rejectDataLike(name: string): never {
    throw new Error(REJECTED_LONG_OPTIONS[name] ?? `不支持的 curl 选项:${name}`)
  }

  function handleLong(body: string): void {
    const eq = body.indexOf('=')
    const name = eq >= 0 ? body.slice(0, eq) : body
    const inlineValue = eq >= 0 ? body.slice(eq + 1) : undefined

    if (name in REJECTED_LONG_OPTIONS) rejectDataLike(name)
    const opt = LONG_OPTIONS[name]
    if (!opt) throw new Error(`不支持的 curl 选项:--${name}`)

    switch (opt.value) {
      case undefined:
        if (opt.boolean && name in SAFE_BOOLEAN_METHOD_MAP) method = SAFE_BOOLEAN_METHOD_MAP[name]
        return
      case 'ignore':
        consumeValue(inlineValue)
        return
      case 'header':
        setHeader(consumeValue(inlineValue))
        return
      case 'method':
        method = consumeValue(inlineValue)
        return
      case 'url':
        takeUrl(consumeValue(inlineValue))
        return
      case 'data':
        takeData(consumeValue(inlineValue))
        return
      case 'ua':
        headers['User-Agent'] = consumeValue(inlineValue)
        return
      case 'referer':
        headers['Referer'] = consumeValue(inlineValue)
        return
      case 'user': {
        const up = consumeValue(inlineValue)
        headers.Authorization = `Basic ${toBase64(up)}`
        return
      }
      case 'cookie':
        setCookie(consumeValue(inlineValue))
        return
      default:
        throw new Error(`不支持的 curl 选项:--${name}`)
    }
  }

  /** 返回该短旗标的值:紧连部分优先,否则取下一个 token */
  function shortFlagValue(rest: string): string {
    if (rest !== '') return rest
    const next = tokens.shift()
    if (next === undefined) throw new Error('curl 参数缺少取值')
    return next
  }

  function consumeValue(inline: string | undefined): string {
    if (inline !== undefined) return inline
    const next = tokens.shift()
    if (next === undefined) throw new Error('curl 参数缺少取值')
    return next
  }

  function handleShort(body: string): void {
    if (body === '') return
    // 短旗标簇:纯噪声(-sfL)或噪声中夹带方法字母(-I/-G/-sGk 等);置方法后返回
    const allSafe = [...body].every(
      (ch) => SAFE_SHORT_CLUSTER_LETTERS.includes(ch) || SAFE_SHORT_METHOD_LETTERS.includes(ch),
    )
    if (allSafe) {
      const methodLetter = [...body].find((ch) => SAFE_SHORT_METHOD_LETTERS.includes(ch))
      if (methodLetter !== undefined) method = SAFE_BOOLEAN_METHOD_MAP[methodLetter]
      return
    }
    const rest = body.slice(1)
    switch (body[0]!) {
      case 'X':
        method = shortFlagValue(rest)
        return
      case 'H':
        setHeader(shortFlagValue(rest))
        return
      case 'A':
        headers['User-Agent'] = shortFlagValue(rest)
        return
      case 'e':
        headers['Referer'] = shortFlagValue(rest)
        return
      case 'u':
        headers.Authorization = `Basic ${toBase64(shortFlagValue(rest))}`
        return
      case 'd':
        takeData(shortFlagValue(rest))
        return
      case 'b':
        setCookie(shortFlagValue(rest))
        return
      case 'c': // cookie-jar(响应侧落盘)
      case 'o': // output(响应体落盘)
        shortFlagValue(rest)
        return
      default:
        throw new Error(`不支持的 curl 选项:-${unknownShortLetter(body)}`)
    }
  }

  /** 簇中第一个既非安全噪声、非方法字母、也非带值选项的字母,用于错误信息精确定位 */
  function unknownShortLetter(body: string): string {
    return (
      [...body].find(
        (ch) =>
          !SAFE_SHORT_CLUSTER_LETTERS.includes(ch) &&
          !SAFE_SHORT_METHOD_LETTERS.includes(ch) &&
          !'XHAeudbco'.includes(ch),
      ) ?? body[0]!
    )
  }
}

/** btoa 仅接受 latin1;统一先转 UTF-8 字节串(含 ASCII 快路径语义),全输入安全 */
function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

/**
 * shell 词法简化版 tokenizer。声明支持范围:
 * - 单引号内字面量;双引号内反斜杠转义下一个字符
 * - 行尾「反斜杠+换行」续行
 * - 相邻引号段拼接成同一 token(如 'ab'"cd")
 * 不支持:$'' ANSI-C 引用、变量展开($X)、反引号替换、glob 展开 —— 含这些语法的命令可能被误读,请自行简化后粘贴。
 */
function tokenizeCurl(input: string): string[] {
  const normalized = input.replace(/\\\r?\n/g, '')
  const tokens: string[] = []
  let current = ''
  let hasContent = false
  let mode: 'plain' | 'single' | 'double' = 'plain'

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i]!
    if (mode === 'single') {
      if (ch === "'") mode = 'plain'
      else current += ch
      continue
    }
    if (mode === 'double') {
      if (ch === '\\') {
        const next = normalized[i + 1]
        if (next === undefined) {
          mode = 'plain'
          continue
        }
        current += next
        i++
        continue
      }
      if (ch === '"') mode = 'plain'
      else current += ch
      continue
    }
    if (ch === '\\' && normalized[i + 1] !== undefined) {
      current += normalized[i + 1]!
      i++
      hasContent = true
      continue
    }
    if (ch === "'") {
      mode = 'single'
      hasContent = true
      continue
    }
    if (ch === '"') {
      mode = 'double'
      hasContent = true
      continue
    }
    if (/\s/.test(ch)) {
      if (hasContent) tokens.push(current)
      current = ''
      hasContent = false
      continue
    }
    current += ch
    hasContent = true
  }
  // 未闭合引号:宽容收尾(当作闭合),避免静默丢内容
  if (hasContent) tokens.push(current)
  return tokens
}

/* ------------------------------- Header 行编辑 ------------------------------- */

export interface HeaderRow {
  key: string
  value: string
}

/** 行 → Record:键 trim,空键跳过,重复键靠后者胜出 */
export function headerRowsToRecord(rows: HeaderRow[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const row of rows ?? []) {
    const key = row.key.trim()
    if (!key) continue
    out[key] = row.value
  }
  return out
}

/** Record → 行(curl 导入/历史回填共用) */
export function recordToHeaderRows(record: Record<string, string>): HeaderRow[] {
  return Object.entries(record ?? {}).map(([key, value]) => ({ key, value }))
}

/* ----------------------------- 响应美化与截断 ------------------------------ */

/** 截断阈值(字符数):超过仅显示前 N 个字符并如实提示完整长度 */
export const MAX_RESPONSE_PREVIEW_CHARS = 1_000_000

export interface BodyPreview {
  text: string
  pretty: boolean
  truncated: boolean
  totalChars: number
  previewChars: number
}

/**
 * 按 Content-Type 决定是否 JSON pretty-print;美化后再判断截断(所见即所截)。
 * 展示层只用文本插值渲染,不存在 v-html 注入通道。
 */
export function renderBodyPreview(contentType: string | undefined, body: string): BodyPreview {
  let text = body ?? ''
  let pretty = false
  if ((contentType ?? '').toLowerCase().includes('json') && text.trim()) {
    try {
      text = JSON.stringify(JSON.parse(text), null, 2)
      pretty = true
    } catch {
      /* 损坏 JSON 保持原文展示 */
    }
  }
  const totalChars = text.length
  if (totalChars > MAX_RESPONSE_PREVIEW_CHARS) {
    return {
      text: text.slice(0, MAX_RESPONSE_PREVIEW_CHARS),
      pretty,
      truncated: true,
      totalChars,
      previewChars: MAX_RESPONSE_PREVIEW_CHARS,
    }
  }
  return { text, pretty, truncated: false, totalChars, previewChars: totalChars }
}

/* --------------------------------- 请求历史 --------------------------------- */

export const HISTORY_LIMIT = 20
/** 单条历史 body 封顶字符数:20 条 × 上限 ≈ 数十 KB,防配额击穿 */
export const HISTORY_BODY_MAX_CHARS = 2_000

export interface HttpHistoryEntry {
  method: string
  url: string
  headers: Record<string, string>
  body: string
}

/** 历史 storage 键沿用 geekwaves-tools: 前缀(useToolState 同一命名空间) */
export function httpHistoryStorageKey(): string {
  return toolStateStorageKey('http-history')
}

function isHistoryEntry(v: unknown): v is HttpHistoryEntry {
  if (v === null || typeof v !== 'object') return false
  const e = v as Partial<HttpHistoryEntry>
  return typeof e.method === 'string' && typeof e.url === 'string' && e.url.trim() !== ''
}

export function loadHttpHistory(backend: Storage = localStorage): HttpHistoryEntry[] {
  try {
    const parsed: unknown = JSON.parse(backend.getItem(httpHistoryStorageKey()) ?? 'null')
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isHistoryEntry)
  } catch {
    return []
  }
}

export function saveHttpHistory(list: HttpHistoryEntry[], backend: Storage = localStorage): void {
  try {
    backend.setItem(httpHistoryStorageKey(), JSON.stringify(list))
  } catch {
    /* 写入失败(配额满/隐私模式等)静默降级,不影响主流程 */
  }
}

export function clearHttpHistory(backend: Storage = localStorage): void {
  try {
    backend.removeItem(httpHistoryStorageKey())
  } catch {
    /* 移除失败静默降级 */
  }
}

function sameRequest(a: HttpHistoryEntry, b: HttpHistoryEntry): boolean {
  return (
    a.method === b.method &&
    a.url === b.url &&
    a.body === b.body &&
    JSON.stringify(a.headers) === JSON.stringify(b.headers)
  )
}

/** 新条目置顶;完全相同的请求合并为一条;上限 HISTORY_LIMIT,超出淘汰最旧。
 * body 与各头值均按 HISTORY_BODY_MAX_CHARS 封顶,保证 20 条历史的存储体积有上界 */
export function appendHistoryEntry(
  list: HttpHistoryEntry[],
  entry: HttpHistoryEntry,
): HttpHistoryEntry[] {
  const cappedHeaders: Record<string, string> = {}
  for (const [k, v] of Object.entries(entry.headers)) {
    cappedHeaders[k] = v.slice(0, HISTORY_BODY_MAX_CHARS)
  }
  const capped: HttpHistoryEntry = {
    ...entry,
    url: entry.url.trim(),
    headers: cappedHeaders,
    body: entry.body.slice(0, HISTORY_BODY_MAX_CHARS),
  }
  const deduped = list.filter((e) => !sameRequest(e, capped))
  return [capped, ...deduped].slice(0, HISTORY_LIMIT)
}

/** 发送成功后的历史快照构造(HttpCommand → 存储条目) */
export function historyFromCommand(cmd: HttpCommand): HttpHistoryEntry {
  return {
    method: cmd.method,
    url: cmd.url,
    headers: cmd.headers ? { ...cmd.headers } : {},
    body: cmd.body ?? '',
  }
}
