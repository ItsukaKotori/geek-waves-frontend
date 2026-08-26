import type { NewsItem, PageResult } from '../types'

export function toNumber(
  v: string | number | null | undefined,
  fallback = 0,
): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : fallback
}

export function normalizeNewsItem(item: NewsItem): NewsItem {
  return {
    ...item,
    score: item.score == null ? item.score : toNumber(item.score),
  }
}

export function normalizePageResult<T>(
  raw: PageResult<T>,
  map?: (item: T) => T,
): PageResult<T> {
  return {
    records: map ? raw.records.map(map) : raw.records,
    current: toNumber(raw.current),
    size: toNumber(raw.size),
    total: toNumber(raw.total),
    pages: toNumber(raw.pages),
  }
}
