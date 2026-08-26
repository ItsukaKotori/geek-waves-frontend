import { describe, expect, it } from 'vitest'
import type { NewsItem, PageResult } from '../../types'
import { normalizeNewsItem, normalizePageResult, toNumber } from '../normalize'

describe('normalize', () => {
  it('toNumber:字符串/数字/缺失值', () => {
    expect(toNumber('12')).toBe(12)
    expect(toNumber(42)).toBe(42)
    expect(toNumber(undefined)).toBe(0)
    expect(toNumber(null)).toBe(0)
    expect(toNumber('abc', 9)).toBe(9)
  })

  it('normalizeNewsItem:Long 字符串字段转数字', () => {
    const item = normalizeNewsItem({
      id: '1',
      sourceId: '2',
      score: '99',
      category: 'NEWS',
      title: '标题',
      aiStatus: 'NONE',
    })
    expect(item.id).toBe("1")
    expect(item.sourceId).toBe("2")
    expect(item.score).toBe(99)
  })

  it('normalizeNewsItem:score 缺失时保持 undefined', () => {
    const item = normalizeNewsItem({
      id: 7,
      sourceId: 3,
      category: 'REPO',
      title: 't',
      aiStatus: 'SUCCESS',
    })
    expect(item.score).toBeUndefined()
  })

  it('normalizePageResult:分页数字归一并应用记录映射', () => {
    const score = '88'
    const raw = {
      records: [
        { id: '5', sourceId: '1', score, category: 'NEWS' as const, title: 'x', aiStatus: 'NONE' },
      ],
      current: '1',
      size: '20',
      total: '100',
      pages: '5',
    }
    const p = normalizePageResult<NewsItem>(
      raw as unknown as PageResult<NewsItem>,
      normalizeNewsItem,
    )
    expect(p.current).toBe(1)
    expect(p.size).toBe(20)
    expect(p.total).toBe(100)
    expect(p.pages).toBe(5)
    expect(p.records[0].id).toBe("5")
    expect(p.records[0].sourceId).toBe("1")
    expect(p.records[0].score).toBe(88)
  })
})
