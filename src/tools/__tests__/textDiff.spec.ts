import { describe, expect, it } from 'vitest'
import {
  MAX_DIFF_LINES,
  alignDiff,
  diffLines,
  splitDiffLines,
  withinDiffLimit,
} from '../textDiff'

/**
 * 文本 diff 纯函数层(FE10 T2 批次一):
 * - 行级 LCS 对齐采用 Hirschberg 分治(时间 O(n·m),空间 O(m),阈值内不做全量矩阵)
 * - 阈值:任一侧超过 MAX_DIFF_LINES 行即拒绝计算,由组件提示(不静默截断)
 * - 断言均与本地时区/随机性无关
 */

describe('splitDiffLines:按行切分', () => {
  it('空文本为零行', () => {
    expect(splitDiffLines('')).toEqual([])
  })

  it('末尾换行不产生空尾行,中间空行保留', () => {
    expect(splitDiffLines('a\nb\n')).toEqual(['a', 'b'])
    expect(splitDiffLines('a\n\nb')).toEqual(['a', '', 'b'])
    expect(splitDiffLines('a\nb')).toEqual(['a', 'b'])
  })
})

describe('withinDiffLimit:大文本保护阈值', () => {
  it('阈值内允许,超限拒绝(任一侧超限即拒绝)', () => {
    const ok = Array.from({ length: MAX_DIFF_LINES }, (_, i) => `L${i}`)
    expect(withinDiffLimit(ok, ['x'])).toBe(true)
    expect(withinDiffLimit(['x'], ok)).toBe(true)
    expect(withinDiffLimit([...ok, 'overflow'], ['x'])).toBe(false)
    expect(withinDiffLimit(['x'], [...ok, 'overflow'])).toBe(false)
  })
})

describe('alignDiff:LCS 对齐', () => {
  it('空 vs 文本:全部为新增;文本 vs 空:全部为删除', () => {
    const added = alignDiff([], ['a', 'b'])
    expect(added.map((r) => r.type)).toEqual(['add', 'add'])
    expect(added.map((r) => r.bNo)).toEqual([1, 2])

    const removed = alignDiff(['a', 'b'], [])
    expect(removed.map((r) => r.type)).toEqual(['del', 'del'])
    expect(removed.map((r) => r.aNo)).toEqual([1, 2])
  })

  it('两侧全等:全部未变且行号一一对应', () => {
    const rows = alignDiff(['x', 'y', 'z'], ['x', 'y', 'z'])
    expect(rows.map((r) => r.type)).toEqual(['equal', 'equal', 'equal'])
    expect(rows.map((r) => [r.aNo, r.bNo])).toEqual([[1, 1], [2, 2], [3, 3]])
  })

  it('两侧全异:删除块在前,新增块在后,不交错', () => {
    const rows = alignDiff(['a', 'b', 'c'], ['1', '2', '3'])
    expect(rows.map((r) => r.type)).toEqual(['del', 'del', 'del', 'add', 'add', 'add'])
    expect(rows.map((r) => r.text)).toEqual(['a', 'b', 'c', '1', '2', '3'])
  })

  it('交错修改:经典对齐(保留公共行,定位删除)', () => {
    const rows = alignDiff(['a', 'b', 'c'], ['a', 'c'])
    expect(rows).toEqual([
      { type: 'equal', text: 'a', aNo: 1, bNo: 1 },
      { type: 'del', text: 'b', aNo: 2 },
      { type: 'equal', text: 'c', aNo: 3, bNo: 2 },
    ])
  })

  it('多处交错增删:公共行顺序保持', () => {
    const rows = alignDiff(
      ['h1', 'only-old', 'common', 'drop', 'tail'],
      ['h1', 'common', 'fresh', 'tail'],
    )
    const seq = rows.map((r) => `${r.type}:${r.text}`)
    expect(seq).toEqual([
      'equal:h1',
      'del:only-old',
      'equal:common',
      'del:drop',
      'add:fresh',
      'equal:tail',
    ])
  })

  it('重复行场景:对齐不重复消费同一行', () => {
    const rows = alignDiff(['x', 'x', 'x'], ['x', 'x'])
    expect(rows.filter((r) => r.type === 'equal')).toHaveLength(2)
    expect(rows.filter((r) => r.type === 'del')).toHaveLength(1)
  })

  it('往返不变量:按行序重建两侧文本与输入一致', () => {
    const a = ['one', 'two', 'three', 'four']
    const b = ['one', '2wo', 'three', 'five', 'six']
    const rows = alignDiff(a, b)
    const rebuiltA = rows.flatMap((r) => (r.type === 'add' ? [] : [r.text]))
    const rebuiltB = rows.flatMap((r) => (r.type === 'del' ? [] : [r.text]))
    expect(rebuiltA).toEqual(a)
    expect(rebuiltB).toEqual(b)
  })

  it('对角大数组场景仍收敛(阈值内中等规模冒烟)', () => {
    const a = Array.from({ length: 300 }, (_, i) => `line-${i}`)
    const b = Array.from({ length: 300 }, (_, i) => (i % 2 === 0 ? `line-${i}` : `alt-${i}`))
    const rows = alignDiff(a, b)
    expect(rows.filter((r) => r.type === 'equal')).toHaveLength(150)
    expect(rows.filter((r) => r.type === 'del')).toHaveLength(150)
    expect(rows.filter((r) => r.type === 'add')).toHaveLength(150)
  })
})

describe('diffLines:文本级入口', () => {
  it('末尾换行差异不算差异', () => {
    const rows = diffLines('a\nb\n', 'a\nb')
    expect(rows.map((r) => r.type)).toEqual(['equal', 'equal'])
  })

  it('单行修改 → 1 删 1 增 + 公共行保留', () => {
    const rows = diffLines('alpha\nbeta\ngamma', 'alpha\nBETA\ngamma')
    expect(rows.map((r) => `${r.type}:${r.text}`)).toEqual([
      'equal:alpha',
      'del:beta',
      'add:BETA',
      'equal:gamma',
    ])
  })

  it('空串 vs 换行串:一空行 vs 零行', () => {
    expect(diffLines('', '\n').map((r) => r.type)).toEqual(['add'])
    expect(diffLines('\n', '').map((r) => r.type)).toEqual(['del'])
  })
})
