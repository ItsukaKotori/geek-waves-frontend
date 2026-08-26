/**
 * 多格式 ↔ JSON 转换(纯函数,前端本地计算)。
 *
 * 双向(可靠往返):YAML / TOML / XML / Properties / Java / Go
 * 仅 JSON → 语言(生成,不反向):TypeScript 接口 / SQL INSERT
 * XML 为有损(标记语言不表达类型,仅尽力),数组/标量类型可能有丢失。
 */
import yaml from 'yaml'
import { parse as tomlParse, stringify as tomlStringify } from 'smol-toml'
import { XMLParser, XMLBuilder } from 'fast-xml-parser'

export interface FormatConverter {
  id: string
  label: string
  /** 语言/格式 → JSON 文本;若该格式不支持反向则抛 Error。 */
  toJson(text: string): string
  /** JSON 文本 → 语言/格式。 */
  fromJson(text: string): string
}

/* -------------------------------------------------------------------------- */
/* 工具                                                                          */
/* -------------------------------------------------------------------------- */

function toObj(text: string): unknown {
  return JSON.parse(text)
}

function out(v: unknown): string {
  return JSON.stringify(v, null, 2)
}

/* ---------------------------- XML(有损) ----------------------------------- */

const XML_OPTS = { ignoreAttributes: false, parseTagValue: true } as const

function xmlToJson(text: string): string {
  const parsed = new XMLParser(XML_OPTS).parse(text)
  const v = parsed && typeof parsed === 'object' && 'root' in (parsed as object)
    ? (parsed as Record<string, unknown>).root
    : parsed
  return out(v)
}

function jsonToXml(text: string): string {
  const value = toObj(text)
  return new XMLBuilder({ ignoreAttributes: false, format: true }).build({ root: value })
}

/* --------------------------- Properties 文件 ------------------------------- */

function propsToJson(text: string): string {
  const result: Record<string, string> = {}
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!')) continue
    const idx = line.indexOf('=')
    if (idx < 0) {
      const eq = trimmed.indexOf(':')
      if (eq < 0) continue
      result[unescapeProp(trimmed.slice(0, eq).trim())] = unescapeProp(trimmed.slice(eq + 1).trim())
    } else {
      result[unescapeProp(line.slice(0, idx).trim())] = unescapeProp(line.slice(idx + 1).trim())
    }
  }
  return out(result)
}

function jsonToProps(text: string): string {
  const value = toObj(text)
  const lines: string[] = []
  flattenProp('', value, lines)
  return lines.join('\n')
}

function flattenProp(prefix: string, value: unknown, lines: string[]) {
  if (value === null || value === undefined) return
  if (typeof value === 'object' && !Array.isArray(value)) {
    for (const [k, v] of Object.entries(value)) {
      flattenProp(prefix ? `${prefix}.${k}` : k, v, lines)
    }
  } else {
    lines.push(`${prefix}=${escapeProp(String(value))}`)
  }
}

function escapeProp(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/([=:])/g, '\\$1')
}

function unescapeProp(s: string): string {
  return s.replace(/\\\r/g, '\r').replace(/\\\n/g, '\n').replace(/\\\\/g, '\\').replace(/\\([=:])/g, '$1')
}

/* --------------------- 代码字面量解析(Java/Go) ---------------------- */

interface LangOpts {
  trueTok: string[]
  falseTok: string[]
  nullTok: string[]
  /** bare-identifier key 是否合法(JS/Python 允许;a:b 形式) */
  bareKeys: boolean
  commentHash: boolean
  commentSlash: boolean
}

const JAVA: LangOpts = {
  trueTok: ['true'], falseTok: ['false'], nullTok: ['null'],
  bareKeys: true, commentHash: false, commentSlash: true,
}
const GO: LangOpts = {
  trueTok: ['true'], falseTok: ['false'], nullTok: ['nil'],
  bareKeys: true, commentHash: false, commentSlash: true,
}

/** 解析一段代码字面量 → JS 值(容错:注释、尾随逗号、单引号、裸键)。 */
function parseCodeLiteral(text: string, opts: LangOpts): unknown {
  const src = text.trim()
  let i = 0
  const n = src.length

  const skipWs = () => {
    while (i < n) {
      const c = src[i]
      if (c === ' ' || c === '\t' || c === '\r' || c === '\n') { i++; continue }
      if (opts.commentHash && c === '#') { while (i < n && src[i] !== '\n') i++; continue }
      if (opts.commentSlash && c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue }
      if (opts.commentSlash && c === '/' && src[i + 1] === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue }
      break
    }
  }

  const read = (): unknown => {
    skipWs()
    if (opts === JAVA) {
      // Java 工厂调用:Map.of / Map.ofEntries(Map.entry) / List.of / Set.of
      const m = src.slice(i).match(/^(?:Map\.(?:ofEntries|of|entry)|List\.of|Set\.of)\s*\(/)
      if (m) return readJavaCall(m[0])
    }
    if (opts === GO) {
      // 处理嵌套 Go 类型前缀:map[string]interface{}{...} / []interface{}{...}
      const body = skipGoValuePrefix(src, i)
      if (body !== null) {
        i = body.offset
        return body.kind === 'array' ? readBracedArray() : readObject()
      }
    }
    const c = src[i]
    if (c === '{') return readObject()
    if (c === '[') return readArray()
    if (c === "'" || c === '"') return readString(c)
    return readAtom()
  }

  /** 解析 Java 工厂调用字面量:Map.of(k1,v1,...)、Map.ofEntries(Map.entry(k,v),...)、List.of/Set.of(...) */
  const readJavaCall = (head: string): unknown => {
    i += head.length // 消费到 "(" 之后
    const args: unknown[] = []
    skipWs()
    while (i < n && src[i] !== ')') {
      args.push(read())
      skipWs()
      if (src[i] === ',') { i++; skipWs() }
    }
    i++ // )
    if (head.startsWith('Map.entry')) {
      // 单个键值对 → 单键对象(Map.ofEntries 聚合用)
      if (args.length !== 2 || typeof args[0] !== 'string') throw new Error('Map.entry 需要 (String key, value) 两个参数')
      return { [args[0]]: args[1] }
    }
    if (head.startsWith('Map.ofEntries') || head.startsWith('Map.of')) {
      // Map.of 为 k,v 交替;ofEntries 为多个单键对象
      const obj: Record<string, unknown> = {}
      if (head.startsWith('Map.ofEntries')) {
        for (const a of args) {
          if (!a || typeof a !== 'object' || Array.isArray(a)) throw new Error('Map.ofEntries 的参数应为 Map.entry(...)')
          Object.assign(obj, a)
        }
      } else {
        if (args.length % 2 !== 0) throw new Error('Map.of 的参数应为 key, value 交替成对出现')
        for (let p = 0; p < args.length; p += 2) {
          if (typeof args[p] !== 'string') throw new Error('Map.of 的 key 必须是字符串字面量')
          obj[args[p] as string] = args[p + 1]
        }
      }
      return obj
    }
    // List.of / Set.of → 数组
    return args
  }

  /** Go 切片字面量 []T{ a, b } 使用花括号包裹元素。 */
  const readBracedArray = (): unknown[] => {
    i++ // {
    const arr: unknown[] = []
    skipWs()
    while (i < n && src[i] !== '}') {
      arr.push(read())
      skipWs()
      if (src[i] === ',') { i++; skipWs() }
    }
    i++ // }
    return arr
  }

  const readObject = (): Record<string, unknown> => {
    i++ // {
    const obj: Record<string, unknown> = {}
    skipWs()
    while (i < n && src[i] !== '}') {
      skipWs()
      let key: string
      const c = src[i]
      if (c === "'" || c === '"') key = readString(c)
      else {
        const start = i
        while (i < n && ![',', '}', ':', ' ', '\t', '\n', '\r', '[', '{'].includes(src[i])) i++
        key = src.slice(start, i).trim()
      }
      skipWs()
      if (src[i] === ':') i++
      const value = read()
      obj[key] = value
      skipWs()
      if (src[i] === ',') { i++; skipWs() }
    }
    i++ // }
    return obj
  }

  const readArray = (): unknown[] => {
    i++ // [
    const arr: unknown[] = []
    skipWs()
    while (i < n && src[i] !== ']') {
      arr.push(read())
      skipWs()
      if (src[i] === ',') { i++; skipWs() }
    }
    i++ // ]
    return arr
  }

  const readString = (q: string): string => {
    i++
    let s = ''
    while (i < n && src[i] !== q) {
      if (src[i] === '\\' && i + 1 < n) {
        const e = src[i + 1]
        const map: Record<string, string> = { n: '\n', t: '\t', r: '\r', '\\': '\\', "'": "'", '"': '"' }
        if (e === 'u') { s += String.fromCharCode(parseInt(src.slice(i + 2, i + 6), 16)); i += 6; continue }
        s += map[e] ?? e
        i += 2
      } else {
        s += src[i]
        i++
      }
    }
    i++ // closing quote
    return s
  }

  const readAtom = (): unknown => {
    const start = i
    while (i < n && ![',', '}', ']', ')', '(', ':', ' ', '\t', '\n', '\r'].includes(src[i])) i++
    const tok = src.slice(start, i)
    if (opts.nullTok.includes(tok)) return null
    if (opts.trueTok.includes(tok)) return true
    if (opts.falseTok.includes(tok)) return false
    const num = Number(tok)
    if (!Number.isNaN(num) && tok !== '' && !/\s/.test(tok)) return num
    // 裸单词(如自由文本)容错为字符串
    return tok
  }

  // 顶层无前缀场景:从 0 开始读取(read 内已处理 Go 类型前缀)
  return read()
}

/** 若从 from 起是 Go 类型前缀(map[...]T{ / []T{ 等),返回其后 body 分隔符偏移与容器类型;否则 null */
function skipGoValuePrefix(src: string, from: number): { offset: number; kind: 'object' | 'array' } | null {
  let d = from
  const n = src.length
  while (d < n && /\s/.test(src[d])) d++
  const ch = src[d]
  let kind: 'object' | 'array' = 'object'
  if (ch === 'm') {
    const mapMatch = src.slice(d).match(/^map\s*\[/)
    if (!mapMatch) return null
    const close = findMatching(src, d + mapMatch[0].length - 1, '[', ']')
    if (close < 0) return null
    d = close + 1
  } else if (ch === '[') {
    const close = findMatching(src, d, '[', ']')
    if (close < 0) return null
    d = close + 1
    kind = 'array'
  } else {
    return null
  }
  const body = skipGoTypeThenBrace(src, d)
  if (body === null) return null
  return { offset: body, kind }
}

/** 从某个偏移起,消费一个 Go 类型(可能含嵌套 `{}`),返回 body 分隔符偏移;否则 null */
function skipGoTypeThenBrace(src: string, from: number): number | null {
  let d = from
  const n = src.length
  while (d < n && /\s/.test(src[d])) d++
  // 依次消费类型片段:[]T、map[...]T、*T、标识符、interface{...}、struct{...}
  while (d < n) {
    const ch = src[d]
    if (ch === '[') {
      const close = findMatching(src, d, '[', ']')
      if (close < 0) return null
      d = close + 1
      continue
    }
    if (ch === '{' || ch === '[') {
      // body 起始(map 字面量 {} 或切片字面量 [])
      return d
    }
    if (ch === '*' || ch === '?') { d++; continue }
    if (ch === '_' || /[A-Za-z0-9.]/.test(ch)) {
      // 标识符. 若后跟 {} 则并入 type,否则 body
      let e = d
      while (e < n && /[A-Za-z0-9.]/.test(src[e])) e++
      if (e < n && src[e] === '{') {
        const close = findMatching(src, e, '{', '}')
        if (close < 0) return null
        d = close + 1
        continue
      }
      return e // body 紧随其后
    }
    if (/\s/.test(ch)) { d++; continue }
    return null
  }
  return null
}

function findMatching(src: string, start: number, open: string, close: string): number {
  let depth = 0
  for (let k = start; k < src.length; k++) {
    if (src[k] === open) depth++
    else if (src[k] === close) {
      depth--
      if (depth === 0) return k
    }
  }
  return -1
}

/* 生成代码字面量 */

type Quote = '"' | "'"

function quoteString(s: string, quote: Quote): string {
  const escaped = s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')
  return `${quote}${escaped.replace(new RegExp(quote, 'g'), '\\' + quote)}${quote}`
}

/* --------------------------- 各语言适配层 --------------------------------- */

function codeToJson(text: string, opts: LangOpts): string {
  return out(parseCodeLiteral(text, opts))
}

function javaObjectToLiteral(v: unknown, d: number): string {
  const pad = ' '.repeat(d)
  if (v === null) return 'null'
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'number') return String(v)
  if (typeof v === 'string') return quoteString(v, '"')
  if (Array.isArray(v)) {
    return `List.of(${v.map((x) => javaObjectToLiteral(x, d + 2)).join(', ')})`
  }
  const keys = Object.keys(v as Record<string, unknown>)
  if (!keys.length) return 'Map.of()'
  // Map.of 上限 10 对;超出用 Map.ofEntries(Map.entry(...))
  if (keys.length <= 10) {
    return `Map.of(${keys.map((k) => `${quoteString(k, '"')}, ${javaObjectToLiteral((v as Record<string, unknown>)[k], d + 2)}`).join(', ')})`
  }
  const entries = keys
    .map((k) => `${pad}  Map.entry(${quoteString(k, '"')}, ${javaObjectToLiteral((v as Record<string, unknown>)[k], d + 2)})`)
    .join(',\n')
  return `Map.ofEntries(\n${entries}\n${pad})`
}

function goObjectToLiteral(v: unknown, d: number): string {
  const pad = ' '.repeat(d)
  if (v === null) return 'nil'
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'number') return String(v)
  if (typeof v === 'string') return quoteString(v, '"')
  if (Array.isArray(v)) {
    if (!v.length) return '[]'
    return `[]interface{}{\n${v.map((x) => `${pad}  ${goObjectToLiteral(x, d + 2)}`).join(',\n')}\n${pad}}`
  }
  const keys = Object.keys(v as Record<string, unknown>)
  if (!keys.length) return 'map[string]interface{}{}'
  return `map[string]interface{}{\n${keys
    .map((k) => `${pad}  ${quoteString(k, '"')}: ${goObjectToLiteral((v as Record<string, unknown>)[k], d + 2)}`)
    .join(',\n')}\n${pad}}`
}

/* ------------------------- TypeScript 接口(只生成) ------------------------ */

function tsFromJson(text: string): string {
  const value = toObj(text)
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('TypeScript 接口生成需要顶层为对象')
  }
  const name = 'Root'
  const typ = tsType(value)
  return `interface ${name} ${typ}\n`
}

function tsType(value: unknown, depth = 0): string {
  if (value === null || value === undefined) return 'any'
  if (typeof value === 'string') return 'string'
  if (typeof value === 'number') return Number.isInteger(value) ? 'number' : 'number'
  if (typeof value === 'boolean') return 'boolean'
  if (Array.isArray(value)) {
    return value.length ? `${tsType(value[0], depth)}[]` : 'any[]'
  }
  const keys = Object.keys(value as Record<string, unknown>)
  if (!keys.length) return '{}'
  const pad = ' '.repeat(depth + 2)
  const inner = keys
    .map((k) => `${pad}${quoteString(k, "'")}: ${tsType((value as Record<string, unknown>)[k], depth + 2)};`)
    .join('\n')
  return `{\n${inner}\n${' '.repeat(depth)}}`
}

/* --------------------------- SQL INSERT(只生成) --------------------------- */

function sqlFromJson(text: string): string {
  const value = toObj(text)
  if (value === null || typeof value !== 'object') {
    throw new Error('SQL INSERT 生成需要顶层为对象(或对象数组),字段即列名')
  }
  const rows: unknown[] = Array.isArray(value) ? value : [value]
  const records: Record<string, unknown>[] = rows.map((r) =>
    r && typeof r === 'object' ? (r as Record<string, unknown>) : { value: r })
  const table = 'my_table'
  const cols = Array.from(new Set(records.flatMap((r) => Object.keys(r))))
  const colList = cols.join(', ')
  return records
    .map((r) => {
      const vals = cols.map((c) => sqlLit(r[c])).join(', ')
      return `INSERT INTO ${table} (${colList}) VALUES (${vals});`
    })
    .join('\n')
}

function sqlLit(v: unknown): string {
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  if (typeof v === 'number') return String(v)
  if (v instanceof Date) return `'${v.toISOString()}'`
  return `'${String(v).replace(/'/g, "''")}'`
}

/* ----------------------------- TOML / YAML -------------------------------- */

function tomlToJson(text: string): string {
  return out(tomlParse(text))
}

function jsonToToml(text: string): string {
  // TOML 无 null 语义:序列化前剔除 null 字段
  return tomlStringify(sanitizeToml(JSON.parse(text)))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sanitizeToml(v: any): any {
  if (Array.isArray(v)) return v.map(sanitizeToml)
  if (v && typeof v === 'object') {
    const o: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (val === null || val === undefined) continue
      o[k] = sanitizeToml(val)
    }
    return o
  }
  return v
}

function yamlToJson(text: string): string {
  return out(yaml.parse(text))
}

function jsonToYaml(text: string): string {
  return yaml.stringify(toObj(text))
}

/* ------------------------------- 内聚导出 --------------------------------- */

export const converters: FormatConverter[] = [
  {
    id: 'yaml', label: 'YAML',
    toJson: yamlToJson, fromJson: jsonToYaml,
  },
  {
    id: 'toml', label: 'TOML',
    toJson: tomlToJson, fromJson: jsonToToml,
  },
  {
    id: 'xml', label: 'XML',
    toJson: xmlToJson, fromJson: jsonToXml,
  },
  {
    id: 'props', label: 'Properties',
    toJson: propsToJson, fromJson: jsonToProps,
  },
  {
    id: 'java', label: 'Java',
    toJson: (t) => codeToJson(t, JAVA), fromJson: (t) => javaObjectToLiteral(toObj(t), 0),
  },
  {
    id: 'go', label: 'Go',
    toJson: (t) => codeToJson(t, GO), fromJson: (t) => goObjectToLiteral(toObj(t), 0),
  },
  {
    id: 'ts', label: 'TypeScript 接口',
    toJson: () => { throw new Error('TypeScript 接口不支持反向解析,请选择「JSON → TypeScript」方向') },
    fromJson: tsFromJson,
  },
  {
    id: 'sql', label: 'SQL INSERT',
    toJson: () => { throw new Error('SQL INSERT 不支持反向解析,请选择「JSON → SQL」方向') },
    fromJson: sqlFromJson,
  },
]

export function findConverter(id: string): FormatConverter | undefined {
  return converters.find((c) => c.id === id)
}

/** 兼容旧入口:仅格式化 JSON(minify 处理)。 */
export function formatJson(text: string): string {
  return JSON.stringify(JSON.parse(text), null, 2)
}
