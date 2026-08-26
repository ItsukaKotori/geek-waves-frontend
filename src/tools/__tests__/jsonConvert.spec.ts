// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { converters, findConverter, formatJson } from '../jsonConvert'

const SAMPLE = {
  name: 'GeekWaves',
  stars: 128,
  active: true,
  tags: ['news', 'ai', 'vue'],
  author: { name: 'Zuikaku', bot: false },
}

const SAMPLE_JSON = JSON.stringify(SAMPLE, null, 2)

const ids = (list: typeof converters) => list.map((c) => c.id)

describe('formats registry', () => {
  it('包含预期格式', () => {
    expect(ids(converters)).toEqual(
      expect.arrayContaining(['yaml', 'toml', 'xml', 'props', 'java', 'go', 'ts', 'sql']),
    )
    expect(ids(converters)).not.toContain('js')
    expect(ids(converters)).not.toContain('python')
  })

  it('findConverter 可定位', () => {
    expect(findConverter('yaml')?.label).toBe('YAML')
    expect(findConverter('nope')).toBeUndefined()
  })
})

describe('双向格式', () => {
  // 无损往返(键/值类型完整保持)
  const lossless = converters.filter((c) => ['yaml', 'java', 'go'].includes(c.id))

  it.each(lossless.map((c) => [c.id, c] as const))('%s 往返语义一致', (_id, c) => {
    const lang = c.fromJson(SAMPLE_JSON)
    const back = c.toJson(lang)
    expect(JSON.parse(back)).toEqual(SAMPLE)
  })

  it.each(lossless.map((c) => [c.id, c] as const))('%s 保留中文与特殊字符', (_id, c) => {
    const src = JSON.stringify({ 标题: '中文', content: 'a"b\\c\n' }, null, 2)
    const back = c.toJson(c.fromJson(src))
    expect(JSON.parse(back)).toEqual(JSON.parse(src))
  })

  // 有损格式(标记语言不表达完整类型):仅验证支持的值形态可往返
  it('TOML 不支持 null,非 null 形态一致', () => {
    const toml = findConverter('toml')!
    const src = JSON.stringify({ name: 'x', stars: 8, tags: ['a', 'b'] }, null, 2)
    expect(JSON.parse(toml.toJson(toml.fromJson(src)))).toEqual(JSON.parse(src))
  })

  it('XML 基本标量往返', () => {
    const xml = findConverter('xml')!
    const src = JSON.stringify({ a: 1, b: 'x', c: true }, null, 2)
    const back = JSON.parse(xml.toJson(xml.fromJson(src)))
    expect(back).toEqual({ a: 1, b: 'x', c: true })
  })

  it('Properties 产出扁平键值(值为字符串)', () => {
    const props = findConverter('props')!
    const obj = JSON.parse(props.toJson(props.fromJson(JSON.stringify({ name: 'gw', stars: 8 }))))
    expect(obj).toEqual({ 'name': 'gw', 'stars': '8' })
  })
})

describe('YAML', () => {
  it('JSON→YAML→JSON 一致', () => {
    const yaml = findConverter('yaml')!
    expect(JSON.parse(yaml.toJson(yaml.fromJson(SAMPLE_JSON)))).toEqual(SAMPLE)
  })

  it('YAML 注释/锚点容错解析为 JSON', () => {
    const yaml = findConverter('yaml')!
    const v = JSON.parse(yaml.toJson('# note\na: 1 # inline\nb: abc\n'))
    expect(v).toEqual({ a: 1, b: 'abc' })
  })
})

describe('Java 字面量', () => {
  it('Map.of 小对象往返', () => {
    const java = findConverter('java')!
    const src = JSON.stringify({ a: 1, b: 'x', ok: false }, null, 2)
    const lit = java.fromJson(src)
    expect(lit).toContain('Map.of(')
    expect(JSON.parse(java.toJson(lit))).toEqual(JSON.parse(src))
  })

  it('超过 10 对键用 Map.ofEntries(Map.entry(...))', () => {
    const java = findConverter('java')!
    const big = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`k${i}`, i]))
    const lit = java.fromJson(JSON.stringify(big))
    expect(lit).toContain('Map.ofEntries(')
    expect(lit).toContain('Map.entry(')
    expect(JSON.parse(java.toJson(lit))).toEqual(big)
  })

  it('List.of 数组与 null/嵌套往返', () => {
    const java = findConverter('java')!
    const src = JSON.stringify({ tags: ['a', 'b'], nil: null, nested: { deep: [1, { x: true }] } }, null, 2)
    expect(JSON.parse(java.toJson(java.fromJson(src)))).toEqual(JSON.parse(src))
  })

  it('解析容错:注释、尾随逗号、Map.entry 风格、裸 { }', () => {
    const java = findConverter('java')!
    // 注释 + Map.entry
    expect(JSON.parse(java.toJson('// c\nMap.ofEntries(\n Map.entry("a", 1),\n Map.entry("b", List.of(1, 2))\n)'))).toEqual({
      a: 1, b: [1, 2],
    })
    // JSON 风格兜底
    expect(JSON.parse(java.toJson('{ "a": 1, }'))).toEqual({ a: 1 })
  })

  it('Map.of 参数不成对时报错清晰', () => {
    const java = findConverter('java')!
    expect(() => java.toJson('Map.of("a", 1, "b")')).toThrow(/成对/)
  })
})

describe('Go 字面量', () => {
  it('Go map 前缀字面量往返', () => {
    const go = findConverter('go')!
    const src = JSON.stringify({ a: 1, list: [{ x: 1 }, { y: 2 }] }, null, 2)
    expect(JSON.parse(go.toJson(go.fromJson(src)))).toEqual(JSON.parse(src))
  })

  it('Go nil/数组嵌套', () => {
    const go = findConverter('go')!
    expect(JSON.parse(go.toJson('map[string]interface{}{\n  "a": nil,\n  "b": []interface{}{\n1, 2\n}\n}'))).toEqual({
      a: null, b: [1, 2],
    })
  })
})

describe('单行方向', () => {
  it('TS 从 JSON 生成接口', () => {
    const ts = findConverter('ts')!
    const out = ts.fromJson(JSON.stringify({ name: 'x', count: 1, ok: true }))
    expect(out).toContain('interface Root')
    expect(out).toMatch(/'name': string/)
    expect(out).toMatch(/'count': number/)
    expect(out).toMatch(/'ok': boolean/)
  })

  it('TS 反向抛错', () => {
    expect(() => findConverter('ts')!.toJson('interface Root {}')).toThrow()
  })

  it('SQL 从 JSON 生成 INSERT', () => {
    const sql = findConverter('sql')!
    const out = sql.fromJson(JSON.stringify([{ id: 1, name: "it's" }, { id: 2, name: 'b' }]))
    expect(out).toContain('INSERT INTO')
    expect(out).toContain("'it''s'")
    expect(out).toContain('VALUES (1')
  })

  it('SQL 反向抛错', () => {
    expect(() => findConverter('sql')!.toJson('INSERT INTO t')).toThrow()
  })
})

describe('formatJson 兼容旧入口', () => {
  it('格式化 JSON 保留缩进', () => {
    expect(JSON.parse(formatJson('{"a":1}'))).toEqual({ a: 1 })
    expect(formatJson('{"a":1}')).toContain('\n')
  })

  it('非法 JSON 抛异常', () => {
    expect(() => formatJson('{')).toThrow()
  })
})
