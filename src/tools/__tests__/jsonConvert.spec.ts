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
  it('包含预期格式(单向生成器 kotlin/rust 与 ts/sql 同区)', () => {
    expect(ids(converters)).toEqual([
      'yaml', 'toml', 'xml', 'props', 'java', 'go', 'kotlin', 'rust', 'ts', 'sql',
    ])
    expect(ids(converters)).not.toContain('js')
    expect(ids(converters)).not.toContain('python')
  })

  it('findConverter 可定位', () => {
    expect(findConverter('yaml')?.label).toBe('YAML')
    expect(findConverter('kotlin')?.label).toBe('Kotlin')
    expect(findConverter('rust')?.label).toBe('Rust')
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

/* ------------------------------------------------------------------------ *
 * Kotlin / Rust 类型生成(自 codegen 工具合并,单向,与 TS/SQL 同模式)
 * 顶层须为对象、根类型名 Root、数组取首元素类型、空数组给宽类型。
 * 数字:整数(64 位范围内)→ Long/i64,浮点 → Double/f64;null → Any?/Value。
 * ------------------------------------------------------------------------ */

/** 统计正则在输出中的出现次数(钉死「不得重复出现」类断言) */
function countMatches(text: string, pattern: RegExp): number {
  return [...text.matchAll(new RegExp(pattern.source, pattern.flags.replace('g', '') + 'g'))].length
}

const CODEGEN_SAMPLE = JSON.stringify(
  {
    name: 'GeekWaves',
    stars: 128,
    active: true,
    ratio: 0.85,
    tags: ['news', 'ai'],
    author: { name: 'Zuikaku', bot: false },
    nil: null,
    empty: [],
  },
  null,
  2,
)

describe('Kotlin 类型生成(单向)', () => {
  const kotlin = () => findConverter('kotlin')!

  it('顶层 data class Root:字段类型映射(String/Long/Double/Boolean)', () => {
    const out = kotlin().fromJson(CODEGEN_SAMPLE)
    expect(out).toContain('data class Root(')
    expect(out).toMatch(/val name: String,/)
    expect(out).toMatch(/val stars: Long,/)
    expect(out).toMatch(/val active: Boolean,/)
    expect(out).toMatch(/val ratio: Double,/)
  })

  it('嵌套对象生成独立 data class(扁平顶层、按字段名 PascalCase)', () => {
    const out = kotlin().fromJson(CODEGEN_SAMPLE)
    expect(out).toContain('data class Author(')
    expect(out).toMatch(/val author: Author,/)
    expect(out).toMatch(/val bot: Boolean,/)
    // Root 在前,嵌套类随后
    expect(out.indexOf('data class Root(')).toBeLessThan(out.indexOf('data class Author('))
  })

  it('null → Any?(对齐 TS any)、空数组 → List<Any?>、数组对象 → List<Author>', () => {
    const out = kotlin().fromJson(CODEGEN_SAMPLE)
    expect(out).toMatch(/val nil: Any\?,/)
    expect(out).toMatch(/val empty: List<Any\?>,/)
    const arr = kotlin().fromJson(JSON.stringify({ authors: [{ name: 'a' }] }))
    expect(arr).toMatch(/val authors: List<Authors>,/)
  })

  it('camelCase 键名保留;关键字/非法标识符键 → 反引号包裹', () => {
    const out = kotlin().fromJson(JSON.stringify({ userName: 'x', userAge: 9 }))
    expect(out).toMatch(/val userName: String,/)
    expect(out).toMatch(/val userAge: Long,/)
    const kw = kotlin().fromJson(JSON.stringify({ class: 'a', 'with space': 1, in: true }))
    expect(kw).toMatch(/val `class`: String,/)
    expect(kw).toMatch(/val `with space`: Long,/)
    expect(kw).toMatch(/val `in`: Boolean,/)
  })

  it('非 ASCII 键反引号保留原文', () => {
    const out = kotlin().fromJson(JSON.stringify({ 标题: '中文' }))
    expect(out).toMatch(/val `标题`: String,/)
  })

  it('整数超 64 位范围 → Double(JS 安全整数内 → Long)', () => {
    expect(kotlin().fromJson(JSON.stringify({ a: 9007199254740991 }))).toMatch(/val a: Long,/)
    expect(kotlin().fromJson(JSON.stringify({ a: 1e21 }))).toMatch(/val a: Double,/)
  })

  it('空对象 → data class Root()', () => {
    expect(kotlin().fromJson('{}')).toBe('data class Root()\n')
  })

  it('同名冲突按出现顺序加数字后缀;深层嵌套(50 层)不崩', () => {
    const out = kotlin().fromJson(JSON.stringify({ a: { x: 1 }, b: { a: { y: 2 } } }))
    expect(out).toContain('data class A(')
    expect(out).toContain('data class A2(')
    let node: Record<string, unknown> = { leaf: 1 }
    for (let i = 49; i >= 0; i--) node = { [`level${i}`]: node }
    const deep = kotlin().fromJson(JSON.stringify(node))
    expect(deep).toContain('data class Level0(')
    expect(deep).toContain('data class Level49(')
    expect(deep).toMatch(/val leaf: Long,/)
  })

  it('顶层须为对象:数组/标量报错、非法 JSON 报错', () => {
    expect(() => kotlin().fromJson('[1,2]')).toThrow(/顶层为对象/)
    expect(() => kotlin().fromJson('"s"')).toThrow(/顶层为对象/)
    expect(() => kotlin().fromJson('{')).toThrow()
  })

  it('Kotlin 反向抛错(单向生成,不支持解析)', () => {
    expect(() => kotlin().toJson('data class Root')).toThrow()
  })

  it('归一化同名冲突:空键/单下划线归一为 __,反引号标识与普通标识折叠', () => {
    const out = kotlin().fromJson(JSON.stringify({ '': 1, _: 2 }))
    expect(out).toContain('val `__`: Long,')
    expect(out).toContain('val `__2`: Long,')
    // 单下划线是 Kotlin 保留名:任何形态的 val _ 都不得出现
    expect(countMatches(out, /val _[:,]/)).toBe(0)
    expect(countMatches(out, /val `_`[:,]/)).toBe(0)
    const folded = kotlin().fromJson(JSON.stringify({ 'a\nb': 1, a_b: 2 }))
    expect(countMatches(folded, /val `a_b`: Long,/)).toBe(1)
    expect(countMatches(folded, /val a_b: Long,/)).toBe(0)
    expect(folded).toMatch(/val a_b2: Long,/)
  })
})

describe('Rust 类型生成(单向)', () => {
  const rust = () => findConverter('rust')!

  it('use serde 头 + derive + struct Root:类型映射(String/i64/f64/bool)', () => {
    const out = rust().fromJson(CODEGEN_SAMPLE)
    expect(out).toContain('use serde::{Deserialize, Serialize};')
    expect(out).toContain('#[derive(Debug, Serialize, Deserialize)]')
    expect(out).toContain('struct Root {')
    expect(out).toMatch(/name: String,/)
    expect(out).toMatch(/stars: i64,/)
    expect(out).toMatch(/active: bool,/)
    expect(out).toMatch(/ratio: f64,/)
  })

  it('snake_case 命名 + 名称变化时 #[serde(rename)] 保证可反序列化', () => {
    const out = rust().fromJson(JSON.stringify({ userName: 'x', UserID: 1, HTTPServer: true }))
    expect(out).toMatch(/#\[serde\(rename = "userName"\)\]\s*\n\s*user_name: String,/)
    expect(out).toMatch(/#\[serde\(rename = "UserID"\)\]\s*\n\s*user_id: i64,/)
    expect(out).toMatch(/#\[serde\(rename = "HTTPServer"\)\]\s*\n\s*http_server: bool,/)
  })

  it('已是 snake_case 的键不补 rename;Rust 关键字 → 后缀 _ + rename', () => {
    const out = rust().fromJson(JSON.stringify({ user_name: 'x', type: 'a' }))
    expect(out).toMatch(/user_name: String,/)
    expect(out).not.toMatch(/rename = "user_name"/)
    expect(out).toMatch(/#\[serde\(rename = "type"\)\]\s*\n\s*type_: String,/)
  })

  it('null → serde_json::Value、空数组 → Vec<serde_json::Value>、嵌套对象 → 独立 struct', () => {
    const out = rust().fromJson(CODEGEN_SAMPLE)
    expect(out).toMatch(/nil: serde_json::Value,/)
    expect(out).toMatch(/empty: Vec<serde_json::Value>,/)
    expect(out).toMatch(/author: Author,/)
    expect(out).toContain('struct Author {')
    const arr = rust().fromJson(JSON.stringify({ authors: [{ name: 'a' }] }))
    expect(arr).toMatch(/authors: Vec<Authors>,/)
  })

  it('非 ASCII 合法标识符键原样保留且不 rename;空格/标点键净化为 snake_case 并 rename', () => {
    const ascii = rust().fromJson(JSON.stringify({ 标题: '中文' }))
    expect(ascii).toMatch(/标题: String,/)
    expect(ascii).not.toContain('rename')
    const out = rust().fromJson(JSON.stringify({ 'user name': 1, 'a-b': 2 }))
    expect(out).toMatch(/#\[serde\(rename = "user name"\)\]\s*\n\s*user_name: i64,/)
    expect(out).toMatch(/#\[serde\(rename = "a-b"\)\]\s*\n\s*a_b: i64,/)
  })

  it('空对象 → struct Root {}', () => {
    expect(rust().fromJson('{}')).toBe('use serde::{Deserialize, Serialize};\n\nstruct Root {}\n')
  })

  it('同名冲突按出现顺序加数字后缀;深嵌套不崩', () => {
    const out = rust().fromJson(JSON.stringify({ a: { x: 1 }, b: { a: { y: 2 } } }))
    expect(out).toContain('struct A {')
    expect(out).toContain('struct A2 {')
    let node: Record<string, unknown> = { leaf: 1 }
    for (let i = 49; i >= 0; i--) node = { [`level${i}`]: node }
    const deep = rust().fromJson(JSON.stringify(node))
    expect(deep).toContain('struct Level49 {')
  })

  it('顶层须为对象:数组/标量报错、非法 JSON 报错', () => {
    expect(() => rust().fromJson('[1,2]')).toThrow(/顶层为对象/)
    expect(() => rust().fromJson('42')).toThrow(/顶层为对象/)
    expect(() => rust().fromJson('nope')).toThrow()
  })

  it('Rust 反向抛错(单向生成,不支持解析)', () => {
    expect(() => rust().toJson('struct Root;')).toThrow()
  })

  it('归一化撞名:snake 化/关键字逃逸/净化折叠/序号回退,serde(rename) 恒指向原键', () => {
    const snake = rust().fromJson(JSON.stringify({ userName: 1, user_name: 2 }))
    expect(countMatches(snake, /user_name: i64,/)).toBe(1)
    expect(snake).toMatch(/#\[serde\(rename = "userName"\)\]\s*\n\s*user_name: i64,/)
    expect(snake).toMatch(/#\[serde\(rename = "user_name"\)\]\s*\n\s*user_name2: i64,/)

    const kw = rust().fromJson(JSON.stringify({ type: 1, type_: 2 }))
    expect(countMatches(kw, /type_: i64,/)).toBe(1)
    expect(kw).toMatch(/#\[serde\(rename = "type"\)\]\s*\n\s*type_: i64,/)
    expect(kw).toMatch(/#\[serde\(rename = "type_"\)\]\s*\n\s*type_2: i64,/)

    const punct = rust().fromJson(JSON.stringify({ 'user name': 1, 'user-name': 2 }))
    expect(countMatches(punct, /user_name: i64,/)).toBe(1)
    expect(punct).toMatch(/#\[serde\(rename = "user name"\)\]\s*\n\s*user_name: i64,/)
    expect(punct).toMatch(/#\[serde\(rename = "user-name"\)\]\s*\n\s*user_name2: i64,/)

    const fallback = rust().fromJson(JSON.stringify({ user_name: 1, userName: 2, user_name2: 3 }))
    expect(countMatches(fallback, /user_name: i64,/)).toBe(1)
    expect(countMatches(fallback, /user_name2: i64,/)).toBe(1)
    expect(fallback).toMatch(/#\[serde\(rename = "userName"\)\]\s*\n\s*user_name2: i64,/)
    expect(fallback).toMatch(/#\[serde\(rename = "user_name2"\)\]\s*\n\s*user_name22: i64,/)
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
