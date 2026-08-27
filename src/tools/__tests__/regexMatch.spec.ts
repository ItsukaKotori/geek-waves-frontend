import { describe, expect, it } from 'vitest'
import {
  MATCH_COUNT_LIMIT,
  TEXT_CHAR_LIMIT,
  buildRenderLeaves,
  computePositions,
  expandReplacement,
  lineColOf,
  scanMatches,
  truncateInput,
  validateFlags,
  type RegexMatchRecord,
} from '../regexMatch'

function scan(pattern: string, flags: string, text: string): RegexMatchRecord[] {
  return scanMatches(pattern, flags, text).matches
}

describe('regexMatch:validateFlags', () => {
  it('仅允许 g/i/m/s/u/y 六个字符', () => {
    expect(() => validateFlags('gimsuy')).not.toThrow()
    expect(() => validateFlags('')).not.toThrow()
    expect(() => validateFlags('gm')).not.toThrow()
  })

  it('非法 flags 字符抛 RangeError 并指出该字符', () => {
    expect(() => validateFlags('gz')).toThrow(RangeError)
    expect(() => validateFlags('a')).toThrow(/a/)
    expect(() => validateFlags('ggx')).toThrow(/x/)
  })
})

describe('regexMatch:truncateInput', () => {
  it('未超限原样返回', () => {
    const r = truncateInput('abc')
    expect(r.truncated).toBe(false)
    expect(r.text).toBe('abc')
    expect(r.originalLength).toBe(3)
  })

  it(`超过 ${TEXT_CHAR_LIMIT} 截断并保留原始长度`, () => {
    const big = 'x'.repeat(TEXT_CHAR_LIMIT + 5)
    const r = truncateInput(big)
    expect(r.truncated).toBe(true)
    expect(r.text.length).toBe(TEXT_CHAR_LIMIT)
    expect(r.originalLength).toBe(TEXT_CHAR_LIMIT + 5)
  })
})

describe('regexMatch:scanMatches', () => {
  it('采集整体匹配与编号分组区间、文本', () => {
    const ms = scan('(\\d{4})-(\\d{2})', '', '日期 2026-08 与 1999-12')
    expect(ms.length).toBe(2)
    expect(ms[0]).toMatchObject({ start: 3, end: 10, value: '2026-08' })
    expect(ms[0]?.groups.map((g) => g.value)).toEqual(['2026', '08'])
    expect(ms[0]?.groups.map((g) => [g.start, g.end])).toEqual([
      [3, 7],
      [8, 10],
    ])
  })

  it('命名分组带 name 字段', () => {
    const ms = scan('(?<year>\\d{4})/(?<mon>\\d{2})', '', '2026/07 x')
    expect(ms[0]?.groups.map((g) => [g.number, g.name, g.value])).toEqual([
      [1, 'year', '2026'],
      [2, 'mon', '07'],
    ])
  })

  it('未参与匹配的分组:start/end 为 null、value 为空(regex101 对齐)', () => {
    const ms = scan('(a)|(b)', '', 'b a b')
    expect(ms.length).toBe(3)
    expect(ms[0]?.groups.map((g) => [g.start === null, g.value])).toEqual([[true, ''], [false, 'b']])
    expect(ms[1]?.groups.map((g) => [g.start === null, g.value])).toEqual([[false, 'a'], [true, '']])
    // 命名分组定义即存在:换路径匹配时槽位保持、未参与则空
    const both = scan('(?:a(?<q>b))|(c)', '', 'ab c')
    expect(both[1]?.groups[0]).toMatchObject({ name: 'q', number: 1, start: null, end: null, value: '' })
    expect(both[1]?.groups[1]?.value).toBe('c')
  })

  it('零宽匹配不致死循环且只输出非空区间', () => {
    const ms = scan('a*', '', 'baaab')
    expect(ms.map((m) => m.value)).toEqual(['aaa'])
  })

  it('超出匹配上限截断并标记 capped', () => {
    const r = scanMatches('x', '', 'x'.repeat(MATCH_COUNT_LIMIT + 3))
    expect(r.matches.length).toBe(MATCH_COUNT_LIMIT)
    expect(r.capped).toBe(true)
  })

  it('内部始终全局扫描:flags 未含 g 也返回全部', () => {
    expect(scan('\\d', '', '1a2b3').length).toBe(3)
  })

  it('非法正则抛出原始错误信息', () => {
    expect(() => scanMatches('[unclosed', '', 'x')).toThrow()
  })

  it('flags 含未知字符抛 RangeError', () => {
    expect(() => scanMatches('a', 'q', 'a')).toThrow(RangeError)
  })
})

describe('regexMatch:lineColOf', () => {
  it('单行 1 基列号', () => {
    expect(lineColOf('hello world', 0)).toEqual({ line: 1, column: 1 })
    expect(lineColOf('hello world', 6)).toEqual({ line: 1, column: 7 })
  })

  it('多行按 \\n 计行,列为当前行 1 基', () => {
    const text = 'one\ntwo\nthree'
    expect(lineColOf(text, 4)).toEqual({ line: 2, column: 1 }) // t
    expect(lineColOf(text, 8)).toEqual({ line: 3, column: 1 }) // t of three
    expect(lineColOf(text, 12)).toEqual({ line: 3, column: 5 }) // 最后的 e
  })

  it('CRLF 只算一次换行', () => {
    const text = 'ab\r\ncd'
    expect(lineColOf(text, 2)).toEqual({ line: 1, column: 3 }) // \r
    expect(lineColOf(text, 5)).toEqual({ line: 2, column: 2 }) // d
  })

  it('与扫描结果联动:多行文本位置正确', () => {
    const text = 'row1 alpha\nrow2 beta gamma\nrow3'
    const ms = scan('beta|gamma', '', text)
    expect(lineColOf(text, ms[0]!.start)).toEqual({ line: 2, column: 6 })
    expect(lineColOf(text, ms[1]!.start)).toEqual({ line: 2, column: 11 })
  })

  it('越界索引回退到文本末尾而非抛错', () => {
    expect(lineColOf('abc', 99)).toEqual({ line: 1, column: 4 })
  })
})

describe('regexMatch:expandReplacement', () => {
  const matches = scan('(?<y>\\d{4})-(\\d{2})', '', '2026-08 next 1999-12')

  it('$n 与 $& 语义与原生 replace 一致', () => {
    const text = '2026-08 next 1999-12'
    const r = expandReplacement(text, matches, '[$1|$2|$&]')
    expect(r.output).toBe('[2026|08|2026-08] next [1999|12|1999-12]')
    expect(r.replacedCount).toBe(2)
  })

  it('${name} 与 $<name> 取命名分组', () => {
    const text = '2026-08 x'
    const named = scan('(?<year>\\d{4})-(?<mon>\\d{2})', '', text)
    expect(expandReplacement(text, [named[0]!], '${year}/${mon}').output).toBe('2026/08 x')
    expect(expandReplacement(text, [named[0]!], '$<year>·$<mon>').output).toBe('2026·08 x')
  })

  it('未参与匹配的分组展开为空串,未命中区间文本原样保留', () => {
    const ms = scan('(?:<([a-z]+)>)|(?:\\d+)', '', '42 <i> x')
    expect(ms.map((m) => m.value)).toEqual(['42', '<i>'])
    expect(expandReplacement('42 <i> x', ms, '[< $1 >]').output).toBe('[<  >] [< i >] x')
  })

  it('$$ 输出字面量 $', () => {
    expect(expandReplacement('a-b', scan('(\\w)-(\\w)', '', 'a-b'), '$$1').output).toBe('$1')
  })

  it('两位分组优先级:$10 不是 $1+0(当组数足够时)', () => {
    const ms = scan('(1)(2)(3)(4)(5)(6)(7)(8)(9)(0)', '', '1234567890')
    expect(expandReplacement('1234567890', ms, '$10').output).toBe('0')
    expect(expandReplacement('1234567890', ms, '$9$0missing').output).toContain('9$0missing')
  })

  it('从未定义过的命名引用保持原样(容错而非吞掉)', () => {
    expect(expandReplacement('v1', scan('v(\\d)', '', 'v1'), '${nope}').output).toBe('${nope}')
  })

  it('$` 与 $\' 提供匹配前后文(regex101 对齐)', () => {
    const text = 'A-B-C'
    // 模板 <前文|后文> 包住匹配区;A- 与 -C 即 $`、$' 展开值
    const out = expandReplacement(text, scan('B', '', text), "<$`|$'>").output
    expect(out).toBe("A-<A-|-C>-C")
  })

  it('$n 越界回显字面量、两位数部分组回退(JS 原生对齐)', () => {
    const text = 'abz'
    const ms = scan('(a)(b)', '', 'ab')
    expect(expandReplacement(text, ms, '$14').output).toBe('a4z') // 组1 + 遗留字面量 4,尾部间隙保留
    expect(expandReplacement(text, ms, '$10').output).toBe('a0z')
    expect(expandReplacement(text, ms, '$98').output).toBe('$98z') // 首位也越界:仅 $ 字面,数字自然回显
    expect(expandReplacement(text, ms, '$5').output).toBe('$5z')
    expect(expandReplacement(text, ms, '$01').output).toBe('az') // Number('01')=1 ≤ 总组数 → 组1
    expect(expandReplacement(text, ms, '$0x').output).toBe('$0xz')
    expect(expandReplacement(text, [ms[0]!], '$999').output).toBe('$999z')
  })

  it('replacedCount 等于参与替换的匹配数', () => {
    const r = expandReplacement('a1b2c3', scan('\\d', '', 'a1b2c3'), '#')
    expect(r.output).toBe('a#b#c#')
    expect(r.replacedCount).toBe(3)
  })
})

describe('regexMatch:computePositions(单调单趟位置批量计算)', () => {
  it('与逐条 lineColOf 结果完全一致(多行/LF)', () => {
    const text = 'row1 alpha\nrow2 beta gamma\nrow3\ndelta'
    const ms = scan('alpha|beta|gamma|delta|row3', '', text)
    const batch = computePositions(text, ms)
    expect(batch).toEqual(ms.map((m) => lineColOf(text, m.start)))
  })

  it('与逐条 lineColOf 结果完全一致(CRLF 与同刻多匹配)', () => {
    const text = 'a\r\nbb cc\r\nc'
    const ms = scan('c|cc|\\w+', '', text)
    const batch = computePositions(text, ms)
    expect(batch).toEqual(ms.map((m) => lineColOf(text, m.start)))
    expect(batch.every((p) => p.line >= 1 && p.column >= 1)).toBe(true)
  })

  it('空记录返回空数组;退化单条与 lineColOf 相等', () => {
    expect(computePositions('any', [])).toEqual([])
    expect(computePositions('hello', [{ start: 4 } as RegexMatchRecord])).toEqual([{ line: 1, column: 5 }])
  })
})

describe('regexMatch:buildRenderLeaves(双层高亮渲染单元)', () => {
  it('非匹配区段 matchOrdinal=null,匹配区携带序号', () => {
    const ms = scan('\\d+', '', 'a12 b34 c')
    const leaves = buildRenderLeaves('a12 b34 c', ms)
    expect(leaves.map((l) => [l.matchOrdinal !== null, l.text])).toEqual([
      [false, 'a'],
      [true, '12'],
      [false, ' b'],
      [true, '34'],
      [false, ' c'],
    ])
  })

  it('捕获组在叶子中叠加 groupNumbers(嵌套分组同叶共存)', () => {
    const text = 'x aabcd y'
    const ms = scan('((a)(bc))d?', '', text)
    const leaves = buildRenderLeaves(text, ms)
    const hit = leaves.find((l) => l.matchOrdinal === 0)!
    expect(hit.groupNumbers.length).toBeGreaterThan(0)
    // 单一叶子可能同时位于组1与组3内
    const both = leaves.filter((l) => l.groupNumbers.includes(1) && l.groupNumbers.includes(3))
    expect(both.length).toBeGreaterThan(0)
  })

  it('相邻匹配交替可用:ordinal 连续递增', () => {
    const ms = scan('.', '', 'abc') // 附内部 g
    const leaves = buildRenderLeaves('abc', ms)
    expect(leaves.filter((l) => l.matchOrdinal !== null).map((l) => l.matchOrdinal)).toEqual([0, 1, 2])
  })

  it('零匹配时整段为单一普通叶', () => {
    const leaves = buildRenderLeaves('plain', [])
    expect(leaves).toHaveLength(1)
    expect(leaves[0]).toMatchObject({ matchOrdinal: null, groupNumbers: [] })
  })

  it('叶子完整覆盖原文无空洞(拼接还原原文)', () => {
    const text = 'aa11bb22cc'
    const leaves = buildRenderLeaves(text, scan('[0-9]+|aa|cc', '', text))
    expect(leaves.map((l) => l.text).join('')).toBe(text)
  })
})
