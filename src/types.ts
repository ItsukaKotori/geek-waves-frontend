/**
 * 后端 itsuka 生态将 Long 序列化为字符串(防 JS 精度丢失),
 * 因此 JSON 里 Long 字段统一标注为 string | number,由 api 层 toNumber 归一。
 */
export type NumLike = string | number

export interface PageResult<T> {
  records: T[]
  current: NumLike
  size: NumLike
  total: NumLike
  pages: NumLike
}

export interface NewsItem {
  id: NumLike
  sourceId: NumLike
  category: 'NEWS' | 'REPO' | 'RELEASE'
  sourceItemId?: string
  title: string
  url?: string
  summary?: string
  content?: string
  author?: string
  tags?: string
  extraJson?: string
  score?: NumLike
  publishedAt?: string
  fetchedAt?: string
  aiStatus: string
  aiSummary?: string
  aiSummaryAt?: string
}

export interface InfoSource {
  id: NumLike
  name: string
  code: string
  type: 'HN_API' | 'GITHUB_API' | 'RSS' | 'JSON_API' | 'HTML'
  baseUrl?: string
  configJson?: string
  enabled: boolean
  sortOrder?: NumLike
  refreshMinutes?: NumLike
  lastFetchAt?: string
  lastFetchStatus?: 'SUCCESS' | 'FAILED' | 'SKIPPED'
  lastError?: string
  failCount?: NumLike
}

export interface AiProvider {
  id: NumLike
  name: string
  vendor: 'OPENAI_COMPAT' | 'ANTHROPIC'
  baseUrl?: string
  apiKeyEnc?: string
  model?: string
  enabled: boolean
  isDefault: boolean
}

export interface FrameworkWatch {
  id: NumLike
  name: string
  githubRepo: string
  latestVersion?: string
  lastReleaseAt?: string
}

export interface NewsSourceBrief {
  id: NumLike
  name: string
  type: string
}

export interface FrameworkBrief {
  id: NumLike
  name: string
}

export interface HttpResult {
  status: NumLike
  tookMs: NumLike
  headers: Record<string, string>
  body: string
}

export interface HttpCommand {
  method: string
  url: string
  headers?: Record<string, string>
  body?: string
  timeoutMs?: number
}

export interface SourcePayload {
  name: string
  code: string
  type: string
  baseUrl?: string
  configJson?: string
  enabled?: boolean
  sortOrder?: number
  refreshMinutes?: number
}

export interface ProviderPayload {
  name: string
  vendor: string
  baseUrl?: string
  apiKey?: string
  model?: string
  enabled?: boolean
  isDefault?: boolean
}

export interface FrameworkPayload {
  name: string
  githubRepo: string
}

export interface ProxyConfig {
  enabled: boolean
  host: string
  port: number
  username?: string
  /** 后端以掩码 "********" 返回;空表示未设置 */
  password: string | null
  updateTime?: string
}

export interface ProxyPayload {
  enabled?: boolean
  host: string
  port: number
  username?: string
  password?: string
}
