import type { NewsCategory } from '../api/news'
import type { FrameworkBrief, NewsSourceBrief } from '../types'

export const CATEGORY_LABEL: Record<NewsCategory, string> = {
  NEWS: '论坛资讯',
  REPO: '热门仓库',
  RELEASE: '框架更新',
}

export interface SourceOption {
  value: string
  label: string
}

/** 来源下拉框选项按 tab 联动:
 * 全部/论坛资讯 → 全部资讯源;热门仓库 → 仅 GitHub 类源;框架更新 → 关注的框架
 * (RELEASE 类资讯的 sourceId 即 framework_watch.id,与资讯源是两个 ID 空间,不可混排) */
export function sourceOptionsForTab(
  tab: 'ALL' | NewsCategory,
  sources: NewsSourceBrief[],
  frameworks: FrameworkBrief[],
): SourceOption[] {
  const toOptions = <T extends { id: unknown; name: string }>(list: T[]) =>
    list.map((s) => ({ value: String(s.id), label: s.name }))
  if (tab === 'RELEASE') return toOptions(frameworks)
  if (tab === 'REPO') return toOptions(sources.filter((s) => s.type.toUpperCase().includes('GITHUB')))
  return toOptions(sources)
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
