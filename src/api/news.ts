import type { NewsItem, NewsSourceBrief, PageResult } from '../types'
import { get } from './http'
import { normalizeNewsItem, normalizePageResult } from './normalize'

export type NewsCategory = 'NEWS' | 'REPO' | 'RELEASE'

export interface NewsQuery {
  category?: NewsCategory
  sourceId?: string | number
  page?: number
  size?: number
}

export async function listNews(q: NewsQuery = {}): Promise<PageResult<NewsItem>> {
  const { category, sourceId, page = 1, size = 20 } = q
  const params: Record<string, unknown> = { current: page, size }
  if (category) params.category = category
  if (sourceId != null) params.sourceId = sourceId
  const raw = await get<PageResult<NewsItem>>('/news', params)
  return normalizePageResult(raw, normalizeNewsItem)
}

export function fetchNewsDetail(id: string | number): Promise<NewsItem> {
  return get<NewsItem>(`/news/${id}`)
}

export function fetchSources(): Promise<NewsSourceBrief[]> {
  return get<NewsSourceBrief[]>('/news/sources')
}
