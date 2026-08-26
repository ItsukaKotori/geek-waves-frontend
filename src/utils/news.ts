import type { NewsCategory } from '../api/news'

export const CATEGORY_LABEL: Record<NewsCategory, string> = {
  NEWS: '论坛资讯',
  REPO: '热门仓库',
  RELEASE: '框架更新',
}

export function fmtTime(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' })
}

export function splitTags(tags?: string | null): string[] {
  if (!tags) return []
  return tags
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
}
