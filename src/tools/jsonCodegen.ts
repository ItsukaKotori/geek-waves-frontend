/**
 * JSON 类型生成纯函数层(Kotlin data class / Rust struct)。
 *
 * 照抄 jsonConvert.ts 既有类型生成模式(TS 接口 / SQL INSERT 的单向生成方向):
 * - 顶层须为对象(数组/标量明确报错,消息口径一致)
 * - 根类型名 Root;数组取首元素类型;空数组给宽类型;生成单向、不反向解析
 *
 * 与既有目标语言的行为对齐点(声明):
 * - nullability:TS 生成器的 null → any  ↔  Kotlin Any?  ↔  Rust serde_json::Value
 *   (Value::Null 天然可承载);字段恒必填、无 Option/默认值 —— 与 TS 生成器一致,
 *   可空性仅在观察到 null 值时表达(Kotlin 以 ? 标注)
 * - 数字:整数(Number.isInteger 且在 64 位范围内)→ Long/i64,浮点 → Double/f64
 *   (64 位范围外按浮点处理,声明口径)
 * - 命名:Kotlin 按语言惯例保留原键(camelCase 不改写);非法标识符(关键字/空格/
 *   非 ASCII)用反引号包裹。Rust 转 snake_case;名称相对原键变化时补
 *   #[serde(rename = "原键")] 保证生成结构体可反序列化原 JSON;Rust 关键字后缀 _
 * - 嵌套对象 → 扁平顶层类型声明,类名取字段名 PascalCase,冲突按出现顺序加数字后缀
 * - 结构声明顺序:根在前,其后为深度优先发现顺序
 */

export interface CodegenTarget {
  id: 'kotlin' | 'rust'
  label: string
  /** JSON 文本 → 类型声明(顶层须为对象) */
  generate(text: string): string
}

/* --------------------------- 共享:结构收集 ------------------------------- */

interface StructDef {
  name: string
  obj: Record<string, unknown>
}

/** 2^63:超出即按浮点处理(JS 侧 2^63 可精确表示,2^63-1 不可) */
const I64_LIMIT = 2 ** 63

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

function pascalCase(key: string): string {
  const parts = key.split(/[^\p{L}\p{Nd}]+/u).filter((p) => p !== '')
  if (!parts.length) return '_'
  return parts.map((p) => p[0]!.toUpperCase() + p.slice(1)).join('')
}

/**
 * 深度优先收集所有对象节点为类型声明(数组取首元素深入)。
 * 类型名:根 Root,嵌套取字段名 PascalCase,冲突追加序号。
 */
function collectStructs(root: Record<string, unknown>): { structs: StructDef[]; names: Map<object, string> } {
  const structs: StructDef[] = []
  const names = new Map<object, string>()
  const used = new Set<string>()

  const unique = (base: string): string => {
    let name = base
    let i = 2
    while (used.has(name)) name = `${base}${i++}`
    used.add(name)
    return name
  }

  const walkValue = (v: unknown, hint: string): void => {
    if (isPlainObject(v)) {
      if (names.has(v)) return
      const name = unique(hint)
      names.set(v, name)
      structs.push({ name, obj: v })
      for (const [k, child] of Object.entries(v)) walkValue(child, pascalCase(k))
    } else if (Array.isArray(v) && v.length > 0) {
      walkValue(v[0], hint)
    }
  }

  const rootName = unique('Root')
  names.set(root, rootName)
  structs.push({ name: rootName, obj: root })
  for (const [k, child] of Object.entries(root)) walkValue(child, pascalCase(k))
  return { structs, names }
}

function parseObject(text: string, lang: string): Record<string, unknown> {
  const value: unknown = JSON.parse(text)
  if (!isPlainObject(value)) {
    throw new Error(`${lang} 类型生成需要顶层为对象`)
  }
  return value
}

/* ----------------------------- Kotlin 生成 -------------------------------- */

const KOTLIN_HARD_KEYWORDS = new Set([
  'as', 'break', 'class', 'continue', 'do', 'else', 'false', 'for', 'fun', 'if', 'in',
  'interface', 'is', 'null', 'object', 'package', 'return', 'super', 'this', 'throw',
  'true', 'try', 'typealias', 'typeof', 'val', 'var', 'when', 'while',
])

function kotlinName(key: string): string {
  const plain = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) && !KOTLIN_HARD_KEYWORDS.has(key)
  if (plain) return key
  // 反引号标识符:不允许包含反引号与换行,净化为下划线;空名兜底
  const inner = key.replace(/[`\r\n]/g, '_') || '_'
  return `\`${inner}\``
}

function kotlinNumber(v: number): string {
  return Number.isInteger(v) && v < I64_LIMIT && v >= -I64_LIMIT ? 'Long' : 'Double'
}

function kotlinType(v: unknown, names: Map<object, string>): string {
  if (v === null || v === undefined) return 'Any?'
  if (typeof v === 'string') return 'String'
  if (typeof v === 'boolean') return 'Boolean'
  if (typeof v === 'number') return kotlinNumber(v)
  if (Array.isArray(v)) {
    return v.length ? `List<${kotlinType(v[0], names)}>` : 'List<Any?>'
  }
  return names.get(v) ?? 'Any?'
}

export function kotlinFromJson(text: string): string {
  const root = parseObject(text, 'Kotlin')
  const { structs, names } = collectStructs(root)
  return (
    structs
      .map(({ name, obj }) => {
        const keys = Object.keys(obj)
        if (!keys.length) return `data class ${name}()`
        const fields = keys
          .map((k) => `    val ${kotlinName(k)}: ${kotlinType(obj[k], names)},`)
          .join('\n')
        return `data class ${name}(\n${fields}\n)`
      })
      .join('\n\n') + '\n'
  )
}

/* ------------------------------ Rust 生成 --------------------------------- */

const RUST_KEYWORDS = new Set([
  'as', 'break', 'const', 'continue', 'crate', 'else', 'enum', 'extern', 'false', 'fn',
  'for', 'if', 'impl', 'in', 'let', 'loop', 'match', 'mod', 'move', 'mut', 'pub', 'ref',
  'return', 'self', 'Self', 'static', 'struct', 'super', 'trait', 'true', 'type',
  'unsafe', 'use', 'where', 'while', 'async', 'await', 'dyn', 'abstract', 'become',
  'box', 'do', 'final', 'macro', 'override', 'priv', 'typeof', 'unsized', 'virtual',
  'yield', 'try',
])

/** camelCase / PascalCase / 缩略词连写 → snake_case;非标识符字符净化为 _ */
function toSnakeCase(key: string): string {
  let s = key
    .replace(/([\p{Ll}\p{Nd}])(\p{Lu})/gu, '$1_$2')
    .replace(/(\p{Lu}+)(\p{Lu}\p{Ll})/gu, '$1_$2')
    .replace(/[^\p{ID_Continue}]+/gu, '_')
  if (/^\p{Nd}/u.test(s)) s = `_${s}`
  s = s.toLowerCase()
  if (s === '' || s === '_') s = '__'
  return s
}

function rustFieldName(key: string): { name: string; rename: string | null } {
  let name = toSnakeCase(key)
  let rename: string | null = name === key ? null : key
  if (RUST_KEYWORDS.has(name)) {
    name = `${name}_`
    rename = key
  }
  return { name, rename }
}

function rustNumber(v: number): string {
  return Number.isInteger(v) && v < I64_LIMIT && v >= -I64_LIMIT ? 'i64' : 'f64'
}

function rustType(v: unknown, names: Map<object, string>): string {
  if (v === null || v === undefined) return 'serde_json::Value'
  if (typeof v === 'string') return 'String'
  if (typeof v === 'boolean') return 'bool'
  if (typeof v === 'number') return rustNumber(v)
  if (Array.isArray(v)) {
    return v.length ? `Vec<${rustType(v[0], names)}>` : 'Vec<serde_json::Value>'
  }
  return names.get(v) ?? 'serde_json::Value'
}

export function rustFromJson(text: string): string {
  const root = parseObject(text, 'Rust')
  const { structs, names } = collectStructs(root)
  const body = structs
    .map(({ name, obj }) => {
      const keys = Object.keys(obj)
      if (!keys.length) return `struct ${name} {}`
      const fields = keys
        .map((k) => {
          const { name: field, rename } = rustFieldName(k)
          const attr = rename === null ? '' : `    #[serde(rename = ${JSON.stringify(rename)})]\n`
          return `${attr}    ${field}: ${rustType(obj[k], names)},`
        })
        .join('\n')
      return `#[derive(Debug, Serialize, Deserialize)]\nstruct ${name} {\n${fields}\n}`
    })
    .join('\n\n')
  return `use serde::{Deserialize, Serialize};\n\n${body}\n`
}

/* ------------------------------- 注册表 ----------------------------------- */

export const codegenTargets: CodegenTarget[] = [
  { id: 'kotlin', label: 'Kotlin', generate: kotlinFromJson },
  { id: 'rust', label: 'Rust', generate: rustFromJson },
]

export function findTarget(id: string): CodegenTarget | undefined {
  return codegenTargets.find((t) => t.id === id)
}
