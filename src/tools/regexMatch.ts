/**
 * 正则视觉匹配纯函数层(FE4 重做):
 * 编译/校验、全局扫描(分组区间)、行位列、替换展开、渲染叶子、输入截断与匹配上限。
 * Worker(regexMatch.worker.ts)在后台线程调用本模块,主线程只做展示拼装。
 */

export interface RegexGroupSpan {
  /** 捕获组编号,1 基 */
  number: number
  /** 命名分组(?<name>...)的名字,无名时 null */
  name: string | null
  /** 未参与本次匹配时为 null(regex101 同款展示为空) */
  start: number | null
  end: number | null
  value: string
}

export interface RegexMatchRecord {
  start: number
  end: number
  value: string
  groups: RegexGroupSpan[]
}

export interface ScanResult {
  matches: RegexMatchRecord[]
  /** 达到 MATCH_COUNT_LIMIT 被截断 */
  capped: boolean
}

/** 文本参与匹配的最大字符数(200KB 口径,按 UTF-16 码元计) */
export const TEXT_CHAR_LIMIT = 200 * 1024
/** 单次扫描最多收集的匹配数 */
export const MATCH_COUNT_LIMIT = 10_000

export const FLAG_CHARS = ['g', 'i', 'm', 's', 'u', 'y'] as const
export type FlagChar = (typeof FLAG_CHARS)[number]

/** 校验 flags 字符白名单;未知字符抛 RangeError 并指出该字符 */
export function validateFlags(flags: string): void {
  for (const ch of flags) {
    if (!(FLAG_CHARS as readonly string[]).includes(ch)) {
      throw new RangeError(`不支持的 flags 字符:${ch}`)
    }
  }
}

/** 文本超限截断;originalLength 始终是原始长度供提示展示 */
export function truncateInput(text: string): { text: string; truncated: boolean; originalLength: number } {
  if (text.length <= TEXT_CHAR_LIMIT) return { text, truncated: false, originalLength: text.length }
  return { text: text.slice(0, TEXT_CHAR_LIMIT), truncated: true, originalLength: text.length }
}

/**
 * 解析 pattern 源中的命名捕获组,返回「编号 → 名称」映射。
 * 跳过转义字符与字符类内部,识别 (?: (?= (?! (?<= (?<! 为非捕获构型。
 */
function parseNamedGroups(source: string): Map<number, string> {
  const names = new Map<number, string>()
  let number = 0
  let inClass = false
  for (let i = 0; i < source.length; i++) {
    const ch = source[i]
    if (ch === '\\') {
      i++
      continue
    }
    if (inClass) {
      if (ch === ']') inClass = false
      continue
    }
    if (ch === '[') {
      inClass = true
      continue
    }
    if (ch !== '(') continue
    if (source[i + 1] !== '?') {
      number++
      continue
    }
    // (? 开头::= ! 均为非捕获构型;< 需再判命名捕获还是环视
    const head = source[i + 2] ?? ''
    if (head === ':' || head === '=' || head === '!') continue
    if (head === '<') {
      const nameHead = source[i + 3] ?? ''
      const isNameStart =
        (nameHead >= 'A' && nameHead <= 'Z') || (nameHead >= 'a' && nameHead <= 'z') || nameHead === '_' || nameHead === '$'
      if (!isNameStart) continue // (?<= (?<! 环视,非捕获
      const close = source.indexOf('>', i + 4)
      if (close === -1) break
      number++
      names.set(number, source.slice(i + 3, close))
      i = close
    }
  }
  return names
}

/** 全局扫描:自动附加 g/d(区间索引),flags 白名单先行校验;非法正则抛出原始错误 */
export function scanMatches(pattern: string, flags: string, text: string): ScanResult {
  validateFlags(flags)
  const merged = flags.includes('g') ? `${flags}d` : `${flags}gd`
  const re = new RegExp(pattern, merged)
  const nameMap = parseNamedGroups(pattern)
  const matches: RegexMatchRecord[] = []
  let capped = false
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m[0] === '') {
      // 零宽匹配跳过并推进一格,避免死循环
      re.lastIndex++
      continue
    }
    if (matches.length >= MATCH_COUNT_LIMIT) {
      capped = true
      break
    }
    const groups: RegexGroupSpan[] = []
    for (let g = 1; g < m.indices!.length; g++) {
      const span = m.indices![g]
      const matched = span !== undefined
      groups.push({
        number: g,
        name: nameMap.get(g) ?? null,
        start: matched ? span[0] : null,
        end: matched ? span[1] : null,
        value: matched ? text.slice(span[0], span[1]) : '',
      })
    }
    matches.push({ start: m.index, end: m.index + m[0].length, value: m[0], groups })
  }
  return { matches, capped }
}

/** 把文本下标换算成「第 N 行 第 M 列」(均 1 基;列按 UTF-16 码元计;\r\n 只算一次换行) */
export function lineColOf(text: string, index: number): { line: number; column: number } {
  const clamped = Math.max(0, Math.min(index, text.length))
  let line = 1
  let lineStart = 0
  for (let i = 0; i < clamped; i++) {
    if (text[i] === '\n') {
      line++
      lineStart = i + 1
    }
  }
  return { line, column: clamped - lineStart + 1 }
}

interface ReplacementToken {
  /** 记录原始字面量(如 ${nope} 解析失败时原样回显用) */
  raw: string
  resolve?: (rec: RegexMatchRecord, text: string) => string
}

/**
 * 替换串语义对齐 regex101:$1..$99、${name}、$<name>、$&、$`、$'、$$;
 * 已定义但未参与匹配的分组展开为空串;从未定义过的命名引用保持原样。
 * 输出为整篇重构文本(命中区替换、间隙原样保留)。
 */
export function expandReplacement(
  text: string,
  records: readonly RegexMatchRecord[],
  template: string,
): { output: string; replacedCount: number } {
  // 组数为模式常量(各记录等长);0 时所有 $n 均按越界字面量回显
  const totalGroups = records.reduce((mx, r) => Math.max(mx, r.groups.length), 0)
  const tokens: ReplacementToken[] = []
  for (let i = 0; i < template.length; i++) {
    const ch = template[i]
    if (ch !== '$') {
      tokens.push({ raw: ch })
      continue
    }
    const next = template[i + 1] ?? ''
    if (next === '$') {
      tokens.push({ raw: '$' })
      i++
      continue
    }
    if (next === '&') {
      tokens.push({ raw: '$&', resolve: (rec) => rec.value })
      i++
      continue
    }
    if (next === '`') {
      tokens.push({ raw: '$`', resolve: (_rec, t) => t.slice(0, _rec.start) })
      i++
      continue
    }
    if (next === "'") {
      tokens.push({ raw: "$'", resolve: (_rec, t) => t.slice(_rec.end) })
      i++
      continue
    }
    if (next === '{' || next === '<') {
      // 前缀均为两个字符:'${' 或 '$<'
      const closeCh = next === '{' ? '}' : '>'
      const openWidth = 2
      const close = template.indexOf(closeCh, i + openWidth)
      if (close === -1 || close <= i + openWidth) {
        tokens.push({ raw: '$' })
        continue
      }
      const name = template.slice(i + openWidth, close)
      const raw = template.slice(i, close + 1)
      tokens.push({
        raw,
        resolve: (rec) => {
          const grp = rec.groups.find((g) => g.name === name)
          return grp ? grp.value : raw
        },
      })
      i = close
      continue
    }
    if (next >= '0' && next <= '9') {
      // $n 语义严格对齐 JS 原生 GetSubstitution:
      // - 两位候选(含前导零,如 $01)取值 ≤ 总组数时命中该组,消费 $+2
      // - 候选越界但首位数字 ≤ 总组数:按一位数命中组号,第二位留作普通文本('$29'→组2+'9')
      // - 全部越界:仅输出 '$' 字面量('$98'→'$98','$5'→'$5');$0 同此
      const groupVal = (rec: RegexMatchRecord, num: number): string =>
        num <= rec.groups.length ? rec.groups[num - 1]!.value : ''
      if (template[i + 2] >= '0' && template[i + 2] <= '9') {
        const nn = Number(template.slice(i + 1, i + 3))
        // nn>0 必要:$00 的 Number('00')=0 会越过 ≤totalGroups 守卫并索引 groups[-1] 崩溃;原生为字面量回显
        if (nn > 0 && nn <= totalGroups) {
          tokens.push({ raw: template.slice(i, i + 3), resolve: (rec) => groupVal(rec, nn) })
          i += 2
        } else {
          const first = Number(next)
          if (first <= totalGroups && first > 0) {
            tokens.push({ raw: template.slice(i, i + 2), resolve: (rec) => groupVal(rec, first) })
            i += 1
          } else {
            tokens.push({ raw: '$' })
          }
        }
      } else {
        const one = Number(next)
        if (one <= totalGroups && one > 0) {
          tokens.push({ raw: template.slice(i, i + 2), resolve: (rec) => groupVal(rec, one) })
          i += 1
        } else {
          tokens.push({ raw: '$' })
        }
      }
      continue
    }
    tokens.push({ raw: '$' })
  }

  function renderFor(rec: RegexMatchRecord): string {
    let out = ''
    for (const t of tokens) out += t.resolve ? t.resolve(rec, text) : t.raw
    return out
  }

  if (records.length === 0) return { output: text, replacedCount: 0 }

  let result = ''
  let pos = 0
  let replacedCount = 0
  for (const rec of records) {
    if (rec.start < pos) continue
    result += text.slice(pos, rec.start)
    result += renderFor(rec)
    pos = rec.end
    replacedCount++
  }
  result += text.slice(pos)
  return { output: result, replacedCount }
}

/** 高亮渲染单元:一段原文 + 所属匹配序号(交替色相)+ 所处捕获组编号栈 */
export interface RenderLeaf {
  start: number
  end: number
  text: string
  matchOrdinal: number | null
  groupNumbers: number[]
}

/** 批量版 lineColOf:记录 start 单调递增时按间隙增量推进,整体 O(text) 单趟而非 O(records×text) */
export function computePositions(
  text: string,
  records: readonly Pick<RegexMatchRecord, 'start'>[],
): { line: number; column: number }[] {
  const out: { line: number; column: number }[] = []
  let cursor = 0
  let line = 1
  let lineStart = 0
  for (const rec of records) {
    const idx = Math.max(cursor, Math.min(rec.start, text.length))
    for (let k = cursor; k < idx; k++) {
      if (text[k] === '\n') {
        line++
        lineStart = k + 1
      }
    }
    cursor = idx
    out.push({ line, column: idx - lineStart + 1 })
  }
  return out
}

/** 把扫描记录切割成互不重叠的渲染叶子;叶子拼接恰还原原文 */
export function buildRenderLeaves(text: string, records: readonly RegexMatchRecord[]): RenderLeaf[] {
  const points = new Set<number>([0, text.length])
  for (const r of records) {
    if (r.start >= 0 && r.start <= text.length) points.add(r.start)
    if (r.end >= r.start && r.end <= text.length) points.add(r.end)
    for (const g of r.groups) {
      if (g.start !== null && g.end !== null) {
        points.add(g.start)
        points.add(g.end)
      }
    }
  }
  const sorted = [...points].sort((a, b) => a - b)
  const leaves: RenderLeaf[] = []
  // 叶子按 start 单调且记录区间互不重叠递增:归属查找用前向推进指针,避免每叶 O(records) 扫描
  let rIdx = 0
  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i]!
    const end = sorted[i + 1]
    if (end === undefined || end <= start) continue
    while (rIdx < records.length && records[rIdx]!.end <= start) rIdx++
    const owner =
      rIdx < records.length && records[rIdx]!.start <= start && end <= records[rIdx]!.end ? rIdx : -1
    const groupNumbers =
      owner === -1
        ? []
        : records[owner]!
            .groups.filter((g) => g.start !== null && g.end !== null && g.start <= start && end <= g.end)
            .map((g) => g.number)
    leaves.push({ start, end, text: text.slice(start, end), matchOrdinal: owner === -1 ? null : owner, groupNumbers })
  }
  return leaves
}

/** 相邻匹配交替色相(整体匹配底色,循环使用) */
export const MATCH_TINTS = ['rgba(250, 204, 21, 0.35)', 'rgba(125, 211, 252, 0.35)', 'rgba(134, 239, 172, 0.4)', 'rgba(249, 168, 212, 0.4)']

/** 捕获组描边色(嵌套组在底部叠条纹区分层级) */
export const GROUP_STRIPE_COLORS = ['#ca8a04', '#0369a1', '#15803d', '#be185d']
