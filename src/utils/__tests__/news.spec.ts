import { describe, expect, it } from 'vitest'
import { CATEGORY_LABEL, fmtTime, splitTags } from '../news'

describe('fmtTime', () => {
  it('有效时间返回本地化字符串', () => {
    const out = fmtTime('2024-05-01T08:00:00+08:00')
    expect(out).toMatch(/2024/)
    expect(out).toMatch(/5月1日/)
  })

  it('空值返回空串', () => {
    expect(fmtTime()).toBe('')
    expect(fmtTime(undefined)).toBe('')
    expect(fmtTime(null)).toBe('')
  })

  it('非法时间返回空串', () => {
    expect(fmtTime('not-a-date')).toBe('')
  })
})

describe('splitTags', () => {
  it('逗号分割并清除空白', () => {
    expect(splitTags(' vue , react, ')).toEqual(['vue', 'react'])
  })

  it('空值返回空数组', () => {
    expect(splitTags()).toEqual([])
    expect(splitTags('')).toEqual([])
  })
})

describe('CATEGORY_LABEL', () => {
  it('覆盖全部类别', () => {
    expect(CATEGORY_LABEL.NEWS).toBe('论坛资讯')
    expect(CATEGORY_LABEL.REPO).toBe('热门仓库')
    expect(CATEGORY_LABEL.RELEASE).toBe('框架更新')
  })
})
