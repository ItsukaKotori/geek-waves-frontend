// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { codegenTargets, findTarget, kotlinFromJson, rustFromJson } from '../jsonCodegen'

/**
 * JSON 类型生成(Kotlin/Rust)纯函数层 —— 照抄 jsonConvert.ts 既有类型生成模式:
 * 顶层须为对象(与 TS 接口/SQL 生成一致)、根类型名 Root、数组取首元素类型、
 * 空数组宽类型、生成方向单向。对齐点(nullability/naming,报告声明):
 * - TS 的 null → any  ↔  Kotlin Any?  ↔  Rust serde_json::Value(Value::Null 可承载)
 * - 字段恒必填(无 Option/默认值),与 TS 生成器一致;可空性仅在观察到 null 时表达
 * - 键名:Kotlin camelCase 保留(非法标识符反引号包裹);Rust snake_case
 *   (名称变化时补 #[serde(rename)] 保证可反序列化,含关键字后缀 _ 与空格/标点净化)
 * - 数字:整数 → Long/i64(须在 64 位范围内),浮点 → Double/f64
 */

const SAMPLE = JSON.stringify(
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

describe('codegenTargets 注册表', () => {
  it('包含 kotlin/rust 两个目标', () => {
    expect(codegenTargets.map((t) => t.id)).toEqual(['kotlin', 'rust'])
  })

  it('findTarget 可定位,未知 id 返回 undefined', () => {
    expect(findTarget('kotlin')?.label).toBe('Kotlin')
    expect(findTarget('rust')?.label).toBe('Rust')
    expect(findTarget('ts')).toBeUndefined()
  })
})

describe('Kotlin 生成', () => {
  it('顶层 data class Root:字段类型映射(String/Long/Double/Boolean)', () => {
    const out = kotlinFromJson(SAMPLE)
    expect(out).toContain('data class Root(')
    expect(out).toMatch(/val name: String,/)
    expect(out).toMatch(/val stars: Long,/)
    expect(out).toMatch(/val active: Boolean,/)
    expect(out).toMatch(/val ratio: Double,/)
  })

  it('嵌套对象生成独立 data class(扁平顶层、按字段名 PascalCase)', () => {
    const out = kotlinFromJson(SAMPLE)
    expect(out).toContain('data class Author(')
    expect(out).toMatch(/val author: Author,/)
    expect(out).toMatch(/val bot: Boolean,/)
    // Root 在前,嵌套类随后
    expect(out.indexOf('data class Root(')).toBeLessThan(out.indexOf('data class Author('))
  })

  it('null → Any?(对齐 TS any)、空数组 → List<Any?>、数组对象 → List<Author>', () => {
    const out = kotlinFromJson(SAMPLE)
    expect(out).toMatch(/val nil: Any\?,/)
    expect(out).toMatch(/val empty: List<Any\?>,/)
    const arr = kotlinFromJson(JSON.stringify({ authors: [{ name: 'a' }] }))
    expect(arr).toMatch(/val authors: List<Authors>,/)
  })

  it('camelCase 键名保留;数组内嵌套对象同样生成类', () => {
    const out = kotlinFromJson(JSON.stringify({ userName: 'x', userAge: 9 }))
    expect(out).toMatch(/val userName: String,/)
    expect(out).toMatch(/val userAge: Long,/)
  })

  it('Kotlin 关键字与非法标识符键 → 反引号包裹', () => {
    const out = kotlinFromJson(JSON.stringify({ class: 'a', 'with space': 1, in: true }))
    expect(out).toMatch(/val `class`: String,/)
    expect(out).toMatch(/val `with space`: Long,/)
    expect(out).toMatch(/val `in`: Boolean,/)
  })

  it('非 ASCII 键反引号保留原文', () => {
    const out = kotlinFromJson(JSON.stringify({ 标题: '中文' }))
    expect(out).toMatch(/val `标题`: String,/)
  })

  it('整数超 64 位范围 → Double(JS 安全整数内 → Long)', () => {
    expect(kotlinFromJson(JSON.stringify({ a: 9007199254740991 }))).toMatch(/val a: Long,/)
    expect(kotlinFromJson(JSON.stringify({ a: 1e21 }))).toMatch(/val a: Double,/)
  })

  it('空对象 → data class Root()', () => {
    expect(kotlinFromJson('{}')).toBe('data class Root()\n')
  })

  it('同名冲突按出现顺序加数字后缀', () => {
    const out = kotlinFromJson(JSON.stringify({ a: { x: 1 }, b: { a: { y: 2 } } }))
    expect(out).toContain('data class A(')
    expect(out).toContain('data class A2(')
  })

  it('深层嵌套(50 层)不崩且类名链完整', () => {
    let node: Record<string, unknown> = { leaf: 1 }
    for (let i = 49; i >= 0; i--) node = { [`level${i}`]: node }
    const out = kotlinFromJson(JSON.stringify(node))
    expect(out).toContain('data class Level0(')
    expect(out).toContain('data class Level49(')
    expect(out).toMatch(/val leaf: Long,/)
  })

  it('顶层须为对象:数组/标量报错、非法 JSON 报错', () => {
    expect(() => kotlinFromJson('[1,2]')).toThrow(/顶层为对象/)
    expect(() => kotlinFromJson('"s"')).toThrow(/顶层为对象/)
    expect(() => kotlinFromJson('{')).toThrow()
  })
})

describe('Rust 生成', () => {
  it('use serde 头 + derive + struct Root:类型映射(String/i64/f64/bool)', () => {
    const out = rustFromJson(SAMPLE)
    expect(out).toContain('use serde::{Deserialize, Serialize};')
    expect(out).toContain('#[derive(Debug, Serialize, Deserialize)]')
    expect(out).toContain('struct Root {')
    expect(out).toMatch(/name: String,/)
    expect(out).toMatch(/stars: i64,/)
    expect(out).toMatch(/active: bool,/)
    expect(out).toMatch(/ratio: f64,/)
  })

  it('snake_case 命名 + 名称变化时 #[serde(rename)] 保证可反序列化', () => {
    const out = rustFromJson(JSON.stringify({ userName: 'x', UserID: 1, HTTPServer: true }))
    expect(out).toMatch(/#\[serde\(rename = "userName"\)\]\s*\n\s*user_name: String,/)
    expect(out).toMatch(/#\[serde\(rename = "UserID"\)\]\s*\n\s*user_id: i64,/)
    expect(out).toMatch(/#\[serde\(rename = "HTTPServer"\)\]\s*\n\s*http_server: bool,/)
  })

  it('已是 snake_case 的键不补 rename;Rust 关键字 → 后缀 _ + rename', () => {
    const out = rustFromJson(JSON.stringify({ user_name: 'x', type: 'a' }))
    expect(out).toMatch(/user_name: String,/)
    expect(out).not.toMatch(/rename = "user_name"/)
    expect(out).toMatch(/#\[serde\(rename = "type"\)\]\s*\n\s*type_: String,/)
  })

  it('null → serde_json::Value、空数组 → Vec<serde_json::Value>、嵌套对象 → 独立 struct', () => {
    const out = rustFromJson(SAMPLE)
    expect(out).toMatch(/nil: serde_json::Value,/)
    expect(out).toMatch(/empty: Vec<serde_json::Value>,/)
    expect(out).toMatch(/author: Author,/)
    expect(out).toContain('struct Author {')
    const arr = rustFromJson(JSON.stringify({ authors: [{ name: 'a' }] }))
    expect(arr).toMatch(/authors: Vec<Authors>,/)
  })

  it('非 ASCII 合法标识符键原样保留且不 rename', () => {
    const out = rustFromJson(JSON.stringify({ 标题: '中文' }))
    expect(out).toMatch(/标题: String,/)
    expect(out).not.toContain('rename')
  })

  it('含空格/标点键净化为 snake_case 并 rename', () => {
    const out = rustFromJson(JSON.stringify({ 'user name': 1, 'a-b': 2 }))
    expect(out).toMatch(/#\[serde\(rename = "user name"\)\]\s*\n\s*user_name: i64,/)
    expect(out).toMatch(/#\[serde\(rename = "a-b"\)\]\s*\n\s*a_b: i64,/)
  })

  it('空对象 → struct Root {}', () => {
    expect(rustFromJson('{}')).toBe('use serde::{Deserialize, Serialize};\n\nstruct Root {}\n')
  })

  it('同名冲突按出现顺序加数字后缀;深嵌套不崩', () => {
    const out = rustFromJson(JSON.stringify({ a: { x: 1 }, b: { a: { y: 2 } } }))
    expect(out).toContain('struct A {')
    expect(out).toContain('struct A2 {')
    let node: Record<string, unknown> = { leaf: 1 }
    for (let i = 49; i >= 0; i--) node = { [`level${i}`]: node }
    const deep = rustFromJson(JSON.stringify(node))
    expect(deep).toContain('struct Level49 {')
  })

  it('顶层须为对象:数组/标量报错、非法 JSON 报错', () => {
    expect(() => rustFromJson('[1,2]')).toThrow(/顶层为对象/)
    expect(() => rustFromJson('42')).toThrow(/顶层为对象/)
    expect(() => rustFromJson('nope')).toThrow()
  })
})
