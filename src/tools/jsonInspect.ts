/**
 * JSON 检视纯函数层(FE6):压缩输出 / 手写常用子集 JSONPath / 折叠树构建。
 *
 * JSONPath 支持范围声明(有意收窄为常用子集,不引入依赖):
 * ✅ $ 根、属性链 $.a.b、引号键 $['a.b'] / ["a"]、通配 .* 与 [*]、
 *    数组下标 [n](负数从尾部计)、切片 [start:end(:step)]、联合 ["a",'b'] 与 [0,2]、
 *    递归下降 ..name、..*、..[n](含 $..name 简写)、..* 收集全部后代值
 * ❌ 过滤表达式 [?(…)]、脚本/括号表达式、自定义扩展 —— 遇到即显式报错说明子集范围
 *
 * 安全约束:全程只读自有可枚举键(Object.hasOwn),不触达继承原型链,
 * 防止 __proto__/constructor 路径泄露内建对象。
 */

/* -------------------------------------------------------------------------- */
/* minify                                                                     */
/* -------------------------------------------------------------------------- */

/** 压缩输出:解析后单行序列化;非法 JSON 抛错由组件收口展示 */
export function minifyJson(text: string): string {
  return JSON.stringify(JSON.parse(text))
}

/* -------------------------------------------------------------------------- */
/* JSONPath 常用子集                                                            */
/* -------------------------------------------------------------------------- */

export interface PathMatch {
  path: string
  value: unknown
}

/** 单次查询命中上限(与正则工具同类护栏,防 $..* 在超大文档上撑爆内存) */
export const MAX_JSONPATH_MATCHES = 10_000

type Selector =
  | { k: 'member'; name: string }
  | { k: 'wild' }
  | { k: 'index'; n: number }
  | { k: 'slice'; start?: number; end?: number; step: number }
  | { k: 'union'; items: Selector[] }

type Seg =
  | { k: 'child'; sel: Selector }
  | { k: 'descend'; sel: Selector }

const SUBSET_HINT = '支持子集:$ . 属性链 / .* [*] 通配 / [n] 下标 / [start:end:step] 切片 / 联合 / ..递归'

class PathExprError extends Error {}

function rejectUnsupported(msg: string): never {
  throw new PathExprError(`不支持的 JSONPath 语法:${msg}。${SUBSET_HINT}`)
}

function readQuoted(src: string, i: number): { name: string; next: number } {
  const quote = src[i]
  let j = i + 1
  let name = ''
  while (j < src.length && src[j] !== quote) {
    if (src[j] === '\\' && j + 1 < src.length) {
      name += src[j + 1]
      j += 2
      continue
    }
    name += src[j]
    j++
  }
  if (j >= src.length) throw new PathExprError(`引号不闭合:${src.slice(i, i + 12)}…`)
  return { name, next: j + 1 }
}

/** 解析方括号内部内容为一个选择器(通配/下标/切片/联合,混合) */
function parseBracket(src: string, i: number): { sel: Selector; next: number } {
  let j = i + 1 // 跳过 [
  let depth = 1
  while (j < src.length && depth > 0) {
    if (src[j] === '[') depth++
    else if (src[j] === ']') depth--
    if (depth > 0) j++
  }
  if (depth !== 0) throw new PathExprError('方括号不闭合')
  const body = src.slice(i + 1, j)

  if (body.includes('?')) rejectUnsupported('过滤表达式 [?(…)]')
  if (body.includes('(')) rejectUnsupported('脚本/括号表达式')

  if (body.trim() === '*') return { sel: { k: 'wild' }, next: j + 1 }

  // 引号名序列 → 联合键
  if (/^\s*['"]/.test(body)) {
    const parts: string[] = []
    let k = 0
    while (k < body.length) {
      while (k < body.length && /[\s,]/.test(body[k])) k++
      if (k >= body.length) break
      if (!/['"]/.test(body[k])) rejectUnsupported('联合中混用非引号元素')
      const q = readQuoted(body, k)
      parts.push(q.name)
      k = q.next
    }
    if (!parts.length) throw new PathExprError('空的下标表达式')
    return { sel: { k: 'union', items: parts.map((name) => ({ k: 'member', name } as Selector)) }, next: j + 1 }
  }

  // 数字 / 切片 / 联合下标
  const nums = body.split(',').map((p) => p.trim())
  if (nums.some((p) => p === '')) throw new PathExprError('空的联合下标元素')
  if (nums.length > 1) {
    return {
      sel: { k: 'union', items: nums.map((p) => ({ k: 'index', n: indexOrThrow(p) } as Selector)) },
      next: j + 1,
    }
  }
  const sliced = body.split(':')
  if (sliced.length > 3) throw new PathExprError('切片最多 [start:end:step]')
  if (sliced.length > 1) {
    const stepRaw = sliced[2]?.trim()
    const step = stepRaw === undefined || stepRaw === '' ? 1 : Number(stepRaw)
    if (!Number.isInteger(step)) rejectUnsupported('切片 step 必须是整数')
    if (step <= 0) rejectUnsupported('负数或零步长切片')
    const startRaw = sliced[0].trim()
    const endRaw = sliced[1].trim()
    return {
      sel: {
        k: 'slice',
        start: startRaw === '' ? undefined : Number(startRaw),
        end: endRaw === '' ? undefined : Number(endRaw),
        step,
      },
      next: j + 1,
    }
  }
  const n = Number(body.trim())
  if (!Number.isInteger(n)) rejectUnsupported(`无法解析的段「${body}」`)
  return { sel: { k: 'index', n }, next: j + 1 }
}

function readName(src: string, i: number): { name: string; next: number } {
  let j = i
  let name = ''
  // 属性行允许空白分隔的多字符名;遇到结构符停止
  while (j < src.length && !'.[]*\')'.includes(src[j]) ) {
    name += src[j]
    j++
  }
  if (name === '') rejectUnsupported(`位置 ${i} 处缺少属性名`)
  return { name: name.trim(), next: j }
}

/** 解析表达式 → 段列表 */
function parseSegments(expr: string): Seg[] {
  const trimmed = expr.trim()
  if (!trimmed.startsWith('$')) {
    throw new PathExprError('JSONPath 表达式必须以 $ 开头')
  }
  const segs: Seg[] = []
  let i = 1
  while (i < trimmed.length) {
    const ch = trimmed[i]
    if (ch === '.') {
      if (trimmed[i + 1] === '.') {
        // 递归下降
        i += 2
        const nxt = trimmed[i]
        if (nxt === '[') {
          const b = parseBracket(trimmed, i)
          if (b.sel.k === 'slice') rejectUnsupported('递归下降下的切片')
          segs.push({ k: 'descend', sel: b.sel })
          i = b.next
        } else if (nxt === '*') {
          segs.push({ k: 'descend', sel: { k: 'wild' } })
          i += 1
        } else {
          const nm = readName(trimmed, i)
          segs.push({ k: 'descend', sel: { k: 'member', name: nm.name } })
          i = nm.next
        }
      } else {
        i += 1
        const nxt = trimmed[i]
        if (nxt === undefined) throw new PathExprError('以 "." 结尾的表达式')
        if (nxt === '*') {
          segs.push({ k: 'child', sel: { k: 'wild' } })
          i += 1
        } else if (nxt === '[') {
          const b = parseBracket(trimmed, i)
          segs.push({ k: 'child', sel: b.sel })
          i = b.next
        } else {
          const nm = readName(trimmed, i)
          segs.push({ k: 'child', sel: { k: 'member', name: nm.name } })
          i = nm.next
        }
      }
      continue
    }
    if (ch === '[') {
      const b = parseBracket(trimmed, i)
      segs.push({ k: 'child', sel: b.sel })
      i = b.next
      continue
    }
    rejectUnsupported(`意外字符「${ch}」`)
  }
  return segs
}

/* ------------------------------ 求值 -------------------------------------- */

/** 只读自有可枚举键:防原型链泄露(__proto__/constructor 等) */
function ownEntries(v: unknown): Array<[string | number, unknown]> {
  if (Array.isArray(v)) return v.map((x, i) => [i, x] as [number, unknown])
  if (v !== null && typeof v === 'object') {
    return Object.keys(v as Record<string, unknown>).map(
      (k) => [k, (v as Record<string, unknown>)[k]] as [string, unknown],
    )
  }
  return []
}

const IDENT_RE = /^[A-Za-z_$][\w$]*$/

function joinToken(parent: string, tokName: string | number): string {
  if (typeof tokName === 'number') return `${parent}[${tokName}]`
  return IDENT_RE.test(tokName) ? `${parent}.${tokName}` : `${parent}[${JSON.stringify(tokName)}]`
}

interface Hit {
  path: string
  value: unknown
}

function indexOrThrow(raw: string): number {
  const n = Number(raw)
  if (!Number.isInteger(n)) rejectUnsupported(`联合中的下标「${raw}」不是整数`)
  return n
}

/**
 * 在当前节点上按 selector 取直接子项追加到 sink;
 * 仅自有可枚举键(Object.hasOwn),不触达原型链。
 */
function selectDirect(
  node: Hit,
  sel: Selector,
  sink: Hit[],
): void {
  const value = node.value
  switch (sel.k) {
    case 'member': {
      if (
        value !== null &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        Object.hasOwn(value as Record<string, unknown>, sel.name)
      ) {
        sink.push({ path: joinToken(node.path, sel.name), value: (value as Record<string, unknown>)[sel.name] })
      }
      return
    }
    case 'wild': {
      for (const [k, v] of ownEntries(value)) {
        sink.push({ path: joinToken(node.path, k), value: v })
      }
      return
    }
    case 'index': {
      if (!Array.isArray(value)) return
      const idx = sel.n < 0 ? value.length + sel.n : sel.n
      if (idx >= 0 && idx < value.length) sink.push({ path: joinToken(node.path, idx), value: value[idx] })
      return
    }
    case 'slice': {
      if (!Array.isArray(value)) return
      const len = value.length
      const norm = (x: number) => (x < 0 ? Math.max(len + x, 0) : Math.min(x, len))
      const s = norm(sel.start ?? 0)
      const e = norm(sel.end ?? len)
      for (let idx = s; idx < e; idx += sel.step) {
        sink.push({ path: joinToken(node.path, idx), value: value[idx] })
      }
      return
    }
    case 'union': {
      for (const item of sel.items) {
        selectDirect(node, item, sink)
      }
      return
    }
  }
}

/** 递归下降:前序遍历自身与全部后代容器,逐节点尝试 selector(文档顺序) */
function descendCollect(node: Hit, sel: Selector, sink: Hit[]): void {
  if (sink.length >= MAX_JSONPATH_MATCHES) return
  selectDirect(node, sel, sink)
  for (const [k, v] of ownEntries(node.value)) {
    if (sink.length >= MAX_JSONPATH_MATCHES) return
    descendCollect({ path: joinToken(node.path, k), value: v }, sel, sink)
  }
}

/**
 * 对已解析文档求值常用子集 JSONPath;返回路径+值对(文档顺序)。
 * 命中超 MAX_JSONPATH_MATCHES 截断。
 */
export function evalJsonPath(doc: unknown, expr: string): PathMatch[] {
  const segs = parseSegments(expr)
  let cursors: Hit[] = [{ path: '$', value: doc }]
  for (const seg of segs) {
    const next: Hit[] = []
    let truncated = false
    for (const cur of cursors) {
      if (seg.k === 'child') selectDirect(cur, seg.sel, next)
      else descendCollect(cur, seg.sel, next)
      if (next.length >= MAX_JSONPATH_MATCHES) {
        truncated = true
        break
      }
    }
    cursors = truncated ? next.slice(0, MAX_JSONPATH_MATCHES) : next
    if (!cursors.length) return []
  }
  return cursors.map((c) => ({ path: c.path, value: c.value }))
}

/** 文本便捷入口:先 JSON.parse 再求值(组件主用) */
export function evalJsonPathText(text: string, expr: string): PathMatch[] {
  return evalJsonPath(JSON.parse(text), expr)
}

/* -------------------------------------------------------------------------- */
/* 大 JSON 折叠树构建                                                          */
/* -------------------------------------------------------------------------- */

/**
 * 树节点描述符:遍历原始文档生成全新的纯数据结构。
 * 关键属性一律以「字段」承载(含 keyLabel 字符串),从不写进以 JSON 键命名的
 * 对象字面量——__proto__/constructor 等危险键只作为字符串标签存在,无污染面;
 * 折叠状态也按数字 id 记录而非键名 Map。
 */
export interface JsonNode {
  /** 每次 build 从 1 重增的稳定自增标识(折叠集合用数字 id) */
  id: number
  /** 属性名或数组下标字符串;根节点固定 '$'(仅作展示) */
  keyLabel: string
  kind: 'object' | 'array' | 'leaf'
  /** 容器摘要({…}/[…])或叶子单行预览(超长截断) */
  preview: string
  childCount: number
  children: readonly JsonNode[]
  depth: number
}

/** 叶子预览最大字符数 */
export const TREE_PREVIEW_MAX_CHARS = 120

/** 深度 < 该值的容器默认展开(浅层可见、深层自动折叠成单行) */
export const TREE_DEFAULT_EXPAND_DEPTH = 2

/** 序列化超过该字节量的文档除根外全部初始折叠(「大 JSON」护栏) */
export const TREE_LARGE_BYTES = 200_000

const MAX_TREE_DEPTH = 400

function previewLeaf(v: unknown): string {
  const raw =
    v === null
      ? 'null'
      : typeof v === 'string'
        ? JSON.stringify(v)
        : String(v)
  return raw.length > TREE_PREVIEW_MAX_CHARS ? `${raw.slice(0, TREE_PREVIEW_MAX_CHARS)}…` : raw
}

let treeIdSeq = 0

function buildNode(value: unknown, keyLabel: string, depth: number): JsonNode {
  const id = ++treeIdSeq
  if (depth > MAX_TREE_DEPTH) {
    // 极深嵌套兜底:JSON.parse 本身会先触发栈溢出,此护栏防建树侧递归失控
    return { id, keyLabel, kind: 'leaf', preview: '…(深度截断)', childCount: 0, children: [], depth }
  }
  if (Array.isArray(value)) {
    const children = value.map((v, i) => buildNode(v, String(i), depth + 1))
    return { id, keyLabel, kind: 'array', preview: '[…]', childCount: children.length, children, depth }
  }
  if (value !== null && typeof value === 'object') {
    const children = Object.entries(value as Record<string, unknown>).map(([k, v]) =>
      buildNode(v, k, depth + 1),
    )
    return { id, keyLabel, kind: 'object', preview: '{…}', childCount: children.length, children, depth }
  }
  return { id, keyLabel, kind: 'leaf', preview: previewLeaf(value), childCount: 0, children: [], depth }
}

/** 解析 JSON 文本并构建展示树;非法 JSON 抛错由组件收口展示 */
export function buildJsonTree(text: string): JsonNode {
  const parsed: unknown = JSON.parse(text)
  treeIdSeq = 0
  return buildNode(parsed, '$', 0)
}
