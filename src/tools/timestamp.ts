const pad = (n: number) => String(n).padStart(2, '0')

export function tsToDate(ts: number): string {
  const ms = ts < 1e12 ? ts * 1000 : ts
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export function dateToTs(date: Date): { s: number; ms: number } {
  const ms = date.getTime()
  return { s: Math.floor(ms / 1000), ms }
}

/** 解析用户输入的时间戳字符串:10 位秒 / 13 位毫秒自适应,超安全整数范围显式报错 */
export function parseTsNumber(raw: string): { s: number; ms: number; unit: 's' | 'ms' } {
  const n = Number(raw.trim())
  if (!raw.trim() || !Number.isFinite(n)) throw new Error('请输入有效的时间戳数值')
  const unit = n < 1e12 ? 's' : 'ms'
  // 秒级路径(<1e12)×1000 后必落在安全范围;毫秒级路径本身必须是不越界的整数
  const ms = unit === 's' ? Math.round(n * 1000) : n
  if (!Number.isSafeInteger(ms)) {
    throw new Error('数值超出 JS 安全整数范围,时间精度无法保证')
  }
  return { s: unit === 's' ? n : Math.floor(ms / 1000), ms, unit }
}

/** 常用 IANA 时区(时区选择器的固定清单) */
export const COMMON_ZONES = [
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Asia/Hong_Kong',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'America/Los_Angeles',
] as const

export interface ZoneWall {
  year: string
  month: string
  day: string
  hour: string
  minute: string
  second: string
  /** 如 '+08:00'、'-05:00',UTC 为 '' */
  offset: string
}

/** 用 Intl 取某瞬间在指定时区的墙上时钟与真实偏移(DST 自然正确) */
function zoneWallParts(ms: number, timeZone: string): ZoneWall {
  let parts: Map<string, string>
  try {
    const dtf = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'longOffset',
    })
    parts = new Map(dtf.formatToParts(ms).map((p) => [p.type, p.value]))
  } catch {
    throw new Error(`未知时区:${timeZone}`)
  }
  return {
    year: parts.get('year') ?? '',
    month: parts.get('month') ?? '',
    day: parts.get('day') ?? '',
    hour: parts.get('hour') ?? '',
    minute: parts.get('minute') ?? '',
    second: parts.get('second') ?? '',
    offset: (parts.get('timeZoneName') ?? '').replace(/^GMT/, ''),
  }
}

export interface InstantFormats {
  /** ISO8601;指定时区时为该区带真实偏移的表示,否则 UTC 的 Z 形式 */
  iso: string
  /** RFC 风格 UTC 字符串 */
  utc: string
  /** 运行环境的系统本地格式(与旧版 tsToDate 一致) */
  local: string
  zoneTime: string
  relative: string
}

/**
 * 同一瞬间多格式同显:ISO8601 / UTC 字符串 / 系统本地 / 选定时区墙上钟 / 相对时间。
 * now 仅注入相对时间的基准时刻(测试用);缺省取当前系统时间。
 */
export function formatInstant(
  ms: number,
  timeZone?: string | null,
  now?: number,
): InstantFormats {
  const d = new Date(ms)
  if (!Number.isFinite(d.getTime())) throw new Error('时间戳超出可表示的日期范围')
  // 毫秒为 .000 时省略,保证常见秒级输入输出形如 …T22:13:20Z
  let iso = d.toISOString().replace(/\.000Z$/, 'Z')
  let zoneTime = ''
  if (timeZone && timeZone !== 'local') {
    const w = zoneWallParts(ms, timeZone)
    zoneTime = `${w.year}-${w.month}-${w.day} ${w.hour}:${w.minute}:${w.second}`
    iso = `${w.year}-${w.month}-${w.day}T${w.hour}:${w.minute}:${w.second}${w.offset || 'Z'}`
  }
  return {
    iso,
    utc: d.toUTCString(),
    local: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`,
    zoneTime,
    relative: formatRelative(ms, now),
  }
}

const REL_UNITS: Array<[string, number]> = [
  ['年', 365 * 86_400_000],
  ['月', 30 * 86_400_000],
  ['周', 7 * 86_400_000],
  ['天', 86_400_000],
  ['小时', 3_600_000],
  ['分钟', 60_000],
  ['秒', 1000],
]

/** 相对时间描述(中文风格):「3 小时前」「2 小时后」,1 秒内视为「刚刚」 */
export function formatRelative(ms: number, now: number = Date.now()): string {
  if (!Number.isFinite(new Date(ms).getTime())) throw new Error('时间戳超出可表示的日期范围')
  const gap = ms - now
  const suffix = gap >= 0 ? '后' : '前'
  const abs = Math.abs(gap)
  if (abs < 1000) return '刚刚'
  for (const [label, unitMs] of REL_UNITS) {
    const value = Math.floor(abs / unitMs)
    if (value >= 1) return `${value} ${label}${suffix}`
  }
  return `1 秒${suffix}`
}

const CN_UNIT_MS: Record<string, number> = {
  秒: 1000,
  分: 60_000,
  分钟: 60_000,
  小时: 3_600_000,
  天: 86_400_000,
  日: 86_400_000,
  周: 7 * 86_400_000,
  星期: 7 * 86_400_000,
  月: 30 * 86_400_000,
  年: 365 * 86_400_000,
}

const EN_UNIT_MS: Record<string, number> = {
  second: 1000,
  minute: 60_000,
  hour: 3_600_000,
  day: 86_400_000,
  week: 7 * 86_400_000,
  month: 30 * 86_400_000,
  year: 365 * 86_400_000,
}

/** 数值词:'3'/'1.5'/'半' → 数字,非法返回 undefined */
function readAmount(word: string): number | undefined {
  if (word === '半') return 0.5
  if (/^\d+(?:\.\d+)?$/.test(word)) return Number(word)
  return undefined
}

/**
 * 相对时间解析(中文优先):「3 天前」「半小时后」/「in 2 hours」「5 minutes ago」。
 * 成功返回绝对时间戳(epoch ms),无法识别返回 null。
 * 月按 30 天、年按 365 天近似。
 */
export function parseRelative(input: string, now: number = Date.now()): number | null {
  const raw = input.trim()
  if (!raw) return null

  // 中文形态:「N 单位 前|后」,空白可省略
  const cn = raw.replace(/\s+/g, '').match(/^(\d+(?:\.\d+)?|半)(秒钟?|分钟|小时|天|日|周|星期|月|年)(前|后)$/)
  if (cn) {
    const amount = readAmount(cn[1])
    const unit = CN_UNIT_MS[cn[2]]
    if (amount !== undefined && unit !== undefined) {
      const delta = Math.round(amount * unit)
      return cn[3] === '前' ? now - delta : now + delta
    }
    return null
  }

  // 英文形态:in N units / N units ago
  const en = raw.toLowerCase()
  const mIn = en.match(/^in\s+(\d+(?:\.\d+)?)\s+(seconds?|minutes?|hours?|days?|weeks?|months?|years?)$/)
  if (mIn) {
    const amount = readAmount(mIn[1])
    const base = mIn[2].replace(/s$/, '')
    const unit = EN_UNIT_MS[base]
    if (amount !== undefined && unit !== undefined) return now + Math.round(amount * unit)
    return null
  }
  const mAgo = en.match(/^(\d+(?:\.\d+)?)\s+(seconds?|minutes?|hours?|days?|weeks?|months?|years?)\s+ago$/)
  if (mAgo) {
    const amount = readAmount(mAgo[1])
    const base = mAgo[2].replace(/s$/, '')
    const unit = EN_UNIT_MS[base]
    if (amount !== undefined && unit !== undefined) return now - Math.round(amount * unit)
    return null
  }

  return null
}
