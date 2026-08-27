import { describe, expect, it } from 'vitest'
import { CATEGORY_LABEL, fmtTime, sourceOptionsForTab, splitTags } from '../news'
import type { NewsSourceBrief } from '../../types'

const sources: NewsSourceBrief[] = [
  { id: 1, name: 'V2EX', type: 'RSS' },
  { id: 2, name: 'GitHub Trending', type: 'GITHUB_API' },
  { id: 3, name: 'Linux Do', type: 'RSS' },
]
const frameworks = [
  { id: 10, name: 'Spring Boot' },
  { id: 11, name: 'Vue' },
]

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

describe('sourceOptionsForTab', () => {
  it('全部/论坛资讯返回全部资讯源,不含框架关注', () => {
    const all = sourceOptionsForTab('ALL', sources, frameworks)
    expect(all).toEqual([
      { value: '1', label: 'V2EX' },
      { value: '2', label: 'GitHub Trending' },
      { value: '3', label: 'Linux Do' },
    ])
    expect(sourceOptionsForTab('NEWS', sources, frameworks)).toEqual(all)
  })

  it('热门仓库仅返回 GitHub 类资讯源', () => {
    expect(sourceOptionsForTab('REPO', sources, frameworks)).toEqual([
      { value: '2', label: 'GitHub Trending' },
    ])
  })

  it('框架更新返回框架关注列表', () => {
    expect(sourceOptionsForTab('RELEASE', sources, frameworks)).toEqual([
      { value: '10', label: 'Spring Boot' },
      { value: '11', label: 'Vue' },
    ])
  })
})
