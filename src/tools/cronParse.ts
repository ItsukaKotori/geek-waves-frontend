/**
 * crontab 解析纯函数层(FE10 T2 批次一)。
 *
 * 支持范围:标准 5 段 cron(分 时 日 月 周);星号、逗号列表、范围 a-b、
 * 步长「星号/n」「a-b/n」「a/n」(至段末);英文月/星期缩写(JAN…DEC、SUN…SAT,
 * 大小写不敏感);周字段 0 与 7 均为周日(内部归一化为 0~6)。
 * 不支持:@宏(@hourly 等)、秒级、Quartz 特殊符(?/L/W/#)——命中即报错。
 *
 * 日期语义:Vixie cron —— 日与周同时受限时取「或」,仅一个受限时取该字段。
 * 下次运行推算基于本地时区墙钟:由 Date 构造器归一化,DST 缺口时刻顺延到
 * 下一有效时刻,重复时刻取首个偏移;与传统 cron 的 UTC 语义存在细微差异。
 */
import { tsToDate } from './timestamp'

export interface CronField {
  /** 归一化后的取值集合(周字段 0~6) */
  values: ReadonlySet<number>
  /** 是否覆盖全值域(语义上的不受限 *) */
  wildcard: boolean
  /** 原始段文本(展示/报错透出) */
  source: string
}

export interface CronExpr {
  minute: CronField
  hour: CronField
  dom: CronField
  month: CronField
  dow: CronField
  source: string
}

/* ------------------------------- 字段定义 -------------------------------- */

interface FieldSpec {
  key: 'minute' | 'hour' | 'dom' | 'month' | 'dow'
  label: string
  lo: number
  hi: number
  /** 英文缩写名 → 数值 */
  names?: Readonly<Record<string, number>>
}

const MONTH_NAMES: Readonly<Record<string, number>> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}

const DOW_NAMES: Readonly<Record<string, number>> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
}

const FIELD_SPECS: FieldSpec[] = [
  { key: 'minute', label: '分钟', lo: 0, hi: 59 },
  { key: 'hour', label: '小时', lo: 0, hi: 23 },
  { key: 'dom', label: '日', lo: 1, hi: 31 },
  { key: 'month', label: '月', lo: 1, hi: 12, names: MONTH_NAMES },
  { key: 'dow', label: '周', lo: 0, hi: 7, names: DOW_NAMES },
]

/** 周字段单字展示(值 0~6,拼在「周」后;「周」+「日」= 周日) */
const DOW_BARE = ['日', '一', '二', '三', '四', '五', '六'] as const

/* ------------------------------- 词法解析 -------------------------------- */

function resolveToken(raw: string, spec: FieldSpec): number {
  const t = raw.trim()
  if (t === '') throw new Error(`${spec.label}字段存在空的列表项`)
  if (/^\d+$/.test(t)) return Number(t)
  const name = spec.names?.[t.toLowerCase()]
  if (name !== undefined) return name
  throw new Error(`${spec.label}字段存在无法识别的词法「${t}」`)
}

function parseField(raw: string, spec: FieldSpec): CronField {
  const source = raw.trim()
  if (source === '') throw new Error(`${spec.label}字段为空`)

  const values = new Set<number>()
  for (const item of source.split(',')) {
    const t = item.trim()
    if (t === '') throw new Error(`${spec.label}字段存在空的列表项`)

    let body = t
    let step = 1
    const slash = t.indexOf('/')
    if (slash !== -1) {
      body = t.slice(0, slash)
      const stepRaw = t.slice(slash + 1)
      if (!/^\d+$/.test(stepRaw) || Number(stepRaw) === 0) {
        throw new Error(`${spec.label}字段步长非法:「${stepRaw}」(须为正整数)`)
      }
      step = Number(stepRaw)
    }

    let lo: number
    let hi: number
    if (body === '*') {
      lo = spec.lo
      hi = spec.hi
    } else if (body.includes('-')) {
      const [aRaw, bRaw] = body.split('-')
      lo = resolveToken(aRaw ?? '', spec)
      hi = resolveToken(bRaw ?? '', spec)
      if (lo > hi) throw new Error(`${spec.label}字段范围起始 ${aRaw} 大于结束 ${bRaw}`)
    } else {
      lo = resolveToken(body, spec)
      // a/n 形式:从 a 到段末
      hi = slash !== -1 ? spec.hi : lo
    }

    for (let v = lo; v <= hi; v += step) {
      if (v < spec.lo || v > spec.hi) {
        throw new Error(`${spec.label}字段 ${v} 超出范围 ${spec.lo}~${spec.hi}`)
      }
      // 周字段 7 ≡ 0(周日)
      const norm = spec.key === 'dow' && v === 7 ? 0 : v
      values.add(norm)
    }
  }

  const fullSize = spec.key === 'dow' ? 7 : spec.hi - spec.lo + 1
  return { values, wildcard: values.size === fullSize, source }
}

/** 解析 5 段 cron 表达式;非法时抛出中文错误 */
export function parseCron(expr: string): CronExpr {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5 || expr.trim() === '') {
    throw new Error(`表达式应为 5 段(分 时 日 月 周),实际 ${parts.length === 1 && expr.trim() === '' ? 0 : parts.length} 段`)
  }
  const parsed = parts.map((p, i) => parseField(p, FIELD_SPECS[i]!))
  const [minute, hour, dom, month, dow] = parsed
  return { minute: minute!, hour: hour!, dom: dom!, month: month!, dow: dow!, source: expr.trim() }
}

/* ------------------------------- 中文描述 -------------------------------- */

/** 值序列压缩:连续区间合并为「a~b」,其余顿号连接(如 1、3、5~8) */
function listRuns(values: number[]): string {
  const sorted = [...values].sort((a, b) => a - b)
  const chunks: string[] = []
  let start = sorted[0]!
  let prev = start
  for (const v of sorted.slice(1)) {
    if (v === prev + 1) {
      prev = v
      continue
    }
    chunks.push(start === prev ? `${start}` : `${start}~${prev}`)
    start = v
    prev = v
  }
  chunks.push(start === prev ? `${start}` : `${start}~${prev}`)
  return chunks.join('、')
}

/**
 * 判断值集合是否为「饱和等差数列」:v_k = base + k·step 且最后一项加 step 越过 hi。
 * 命中时可描述为「每隔 step X」;step>1 才有意义(step=1 且饱和即通配,上游已处理)。
 */
function progressionOf(values: ReadonlySet<number>, hi: number): { base: number; step: number } | null {
  const sorted = [...values].sort((a, b) => a - b)
  if (sorted.length < 2) return null
  const step = sorted[1]! - sorted[0]!
  if (step <= 1) return null
  for (let k = 1; k < sorted.length; k++) {
    if (sorted[k]! - sorted[k - 1]! !== step) return null
  }
  if (sorted[sorted.length - 1]! + step <= hi) return null
  return { base: sorted[0]!, step }
}

/** 值集合描述:饱和等差 → 「每 N X」(起始偏移时「自 b X 起每 N X」),否则区间压缩列表;prefix 用于「每月」等限定前缀 */
function describeValues(values: ReadonlySet<number>, lo: number, hi: number, unit: string, prefix = ''): string {
  const prog = progressionOf(values, hi)
  if (prog) {
    const core = prog.base === lo ? `每 ${prog.step} ${unit}` : `自 ${prog.base} ${unit}起每 ${prog.step} ${unit}`
    return prefix === '' ? core : prefix + core
  }
  const list = `${listRuns([...values])} ${unit}`
  return prefix === '' ? list : `${prefix} ${list}`
}

/**
 * 星期集合描述:输出紧随「每周」之后的片段 ——
 * 首段裸字(每周+日 = 每周日),后续段带「周」避免顿号后歧义(每周一、周三),
 * 连续区间折叠为「一至周五」(每周一至周五)。
 */
function describeDow(values: ReadonlySet<number>): string {
  const sorted = [...values].sort((a, b) => a - b)
  const chunks: string[] = []
  let start = sorted[0]!
  let prev = start
  const pushChunk = (): void => {
    const bare = chunks.length === 0
    chunks.push(
      start === prev
        ? bare
          ? DOW_BARE[start]!
          : `周${DOW_BARE[start]!}`
        : `${DOW_BARE[start]!}至周${DOW_BARE[prev]!}`,
    )
  }
  for (const v of sorted.slice(1)) {
    if (v === prev + 1) {
      prev = v
      continue
    }
    pushChunk()
    start = v
    prev = v
  }
  pushChunk()
  return chunks.join('、')
}

const pad2 = (n: number): string => String(n).padStart(2, '0')

/**
 * 时间部分描述(不含「每天」等日期限定,由 describeCron 统一拼装):
 * hourLevel 表示描述本身以小时为粒度(每小时/每隔 N 小时/分钟),
 * 此时日期侧为「每天」时无需重复言明。
 */
function describeTime(minute: CronField, hour: CronField): { text: string; hourLevel: boolean } {
  const mList = [...minute.values].sort((a, b) => a - b)
  const hList = [...hour.values].sort((a, b) => a - b)
  const mProg = progressionOf(minute.values, 59)
  const hProg = progressionOf(hour.values, 23)

  if (hour.wildcard && minute.wildcard) return { text: '每小时', hourLevel: true }
  if (hour.wildcard) {
    if (mProg) {
      return {
        text: mProg.base === 0 ? `每隔 ${mProg.step} 分钟` : `自 ${mProg.base} 分起每隔 ${mProg.step} 分钟`,
        hourLevel: true,
      }
    }
    if (mList.length === 1) return { text: `每小时的第 ${mList[0]!} 分钟`, hourLevel: true }
    return { text: `每小时的第 ${listRuns(mList)} 分钟`, hourLevel: true }
  }
  if (minute.wildcard) {
    if (hProg) {
      return {
        text: hProg.base === 0 ? `每隔 ${hProg.step} 小时` : `自 ${hProg.base} 点起每隔 ${hProg.step} 小时`,
        hourLevel: true,
      }
    }
    return { text: `${listRuns(hList)} 点的每分钟`, hourLevel: false }
  }
  if (hList.length === 1 && mList.length === 1) {
    return { text: `${pad2(hList[0]!)}:${pad2(mList[0]!)}`, hourLevel: false }
  }
  if (hProg && mList.length === 1) {
    const m = mList[0]!
    return {
      text: m === 0 ? `每隔 ${hProg.step} 小时` : `每隔 ${hProg.step} 小时的第 ${m} 分`,
      hourLevel: true,
    }
  }
  if (mProg && hList.length === 1) {
    return {
      text:
        mProg.base === 0
          ? `${hList[0]!} 点每隔 ${mProg.step} 分钟`
          : `${hList[0]!} 点自 ${mProg.base} 分起每隔 ${mProg.step} 分钟`,
      hourLevel: false,
    }
  }
  return { text: `${listRuns(hList)} 点的第 ${listRuns(mList)} 分`, hourLevel: false }
}

/** 生成人可读的中文描述(日期限定 + 时间描述,空格连接) */
export function describeCron(expr: CronExpr): string {
  const time = describeTime(expr.minute, expr.hour)
  const domRestricted = !expr.dom.wildcard
  const dowRestricted = !expr.dow.wildcard
  const parts: string[] = []

  if (!expr.month.wildcard) parts.push(describeValues(expr.month.values, 1, 12, '月'))

  if (domRestricted && dowRestricted) {
    const domText = describeValues(expr.dom.values, 1, 31, '日', expr.month.wildcard ? '每月' : '')
    parts.push(`${domText} 或 每周${describeDow(expr.dow.values)}`)
  } else if (domRestricted) {
    parts.push(describeValues(expr.dom.values, 1, 31, '日', expr.month.wildcard ? '每月' : ''))
  } else if (dowRestricted) {
    parts.push(`每周${describeDow(expr.dow.values)}`)
  } else if (expr.month.wildcard ? !time.hourLevel : true) {
    // 无任何日期限定:非小时粒度描述需「每天」;小时粒度(每小时/每隔 N 分钟/小时)本身已含频次
    parts.push('每天')
  }

  parts.push(time.text)
  return parts.join(' ')
}

/* ------------------------------- 运行推算 -------------------------------- */

/** 推算步数上限:日月跳转路径上约 8000 年才会触顶,足够覆盖「永不匹配」判定 */
const MAX_CRON_SEARCH_STEPS = 200_000

/** Vixie 语义的日期匹配:日与周同时受限取「或」,仅一个受限取该字段 */
function dayMatches(expr: CronExpr, date: Date): boolean {
  const domRestricted = !expr.dom.wildcard
  const dowRestricted = !expr.dow.wildcard
  if (!domRestricted && !dowRestricted) return true
  if (domRestricted && dowRestricted) {
    return expr.dom.values.has(date.getDate()) || expr.dow.values.has(date.getDay())
  }
  return domRestricted ? expr.dom.values.has(date.getDate()) : expr.dow.values.has(date.getDay())
}

/**
 * 求 after 之后(不含)的下一次运行时刻。
 * 跳转策略:月不符 → 下月 1 日 00:00;日不符 → 次日 00:00;
 * 小时不符 → 下一整点;分钟不符 → 下一分钟。Date 构造器溢出归一化
 * 自动处理月末/年末,DST 缺口墙钟顺延到下一有效时刻。
 */
export function nextCronRun(expr: CronExpr, after: Date): Date {
  const t = new Date(after.getFullYear(), after.getMonth(), after.getDate(), after.getHours(), after.getMinutes() + 1)
  for (let steps = 0; steps < MAX_CRON_SEARCH_STEPS; steps++) {
    if (!expr.month.values.has(t.getMonth() + 1)) {
      t.setMonth(t.getMonth() + 1, 1)
      t.setHours(0, 0, 0, 0)
      continue
    }
    if (!dayMatches(expr, t)) {
      t.setDate(t.getDate() + 1)
      t.setHours(0, 0, 0, 0)
      continue
    }
    if (!expr.hour.values.has(t.getHours())) {
      t.setHours(t.getHours() + 1, 0, 0, 0)
      continue
    }
    if (!expr.minute.values.has(t.getMinutes())) {
      t.setMinutes(t.getMinutes() + 1, 0, 0)
      continue
    }
    return new Date(t.getTime())
  }
  throw new Error('向前 5 年内未找到匹配的运行时间(表达式可能永不匹配,如「2 月 31 日」),请检查日/月/周组合')
}

/** 逐次递推未来 count 次运行时刻(count ∈ 1~50) */
export function nextCronRuns(expr: CronExpr, count: number, from: Date): Date[] {
  if (!Number.isInteger(count) || count < 1 || count > 50) {
    throw new Error('运行次数须为 1~50 的整数')
  }
  const runs: Date[] = []
  let cursor = from
  for (let i = 0; i < count; i++) {
    cursor = nextCronRun(expr, cursor)
    runs.push(cursor)
  }
  return runs
}

/** 运行时刻展示:本地 'YYYY-MM-DD HH:mm 周X'(复用 timestamp 纯层保证口径一致) */
export function formatCronRun(d: Date): string {
  return `${tsToDate(d.getTime()).slice(0, 16)} 周${DOW_BARE[d.getDay()]!}`
}
