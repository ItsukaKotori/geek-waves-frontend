// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  COMMON_ZONES,
  formatInstant,
  formatRelative,
  parseRelative,
  parseTsNumber,
} from '../timestamp'

describe('parseTsNumber 大数与单位自适应', () => {
  it('10 位按秒解释、13 位按毫秒解释', () => {
    expect(parseTsNumber('1700000000')).toEqual({ s: 1700000000, ms: 1700000000000, unit: 's' })
    expect(parseTsNumber('1700000000000')).toEqual({
      s: 1700000000,
      ms: 1700000000000,
      unit: 'ms',
    })
  })

  it('临界值 1e12 起按毫秒解释(<1e12 为秒)', () => {
    expect(parseTsNumber('999999999999').unit).toBe('s')
    expect(parseTsNumber('1000000000000').unit).toBe('ms')
  })

  it('非法数值抛错', () => {
    expect(() => parseTsNumber('abc')).toThrow()
    expect(() => parseTsNumber('')).toThrow()
    expect(() => parseTsNumber('Infinity')).toThrow()
  })

  it('乘以 1000 后超过安全整数范围抛错(大数精度护栏)', () => {
    // 毫秒级输入越过 2^53 = 9007199254740992 边界
    expect(() => parseTsNumber('90071992547409930')).toThrow(/安全整数/)
    // 非整数毫秒同样拒绝(无法保证精度)
    expect(() => parseTsNumber('1500000000000.5')).toThrow(/安全整数/)
    // 合法近界毫秒仍可用
    expect(parseTsNumber('9007199254740991')).toEqual({
      s: 9007199254740,
      ms: 9007199254740991,
      unit: 'ms',
    })
  })
})

describe('formatInstant 多格式同显', () => {
  it('ISO 始终带 UTC 偏移的完整表示,UTC 行为 RFC 风格', () => {
    const f = formatInstant(Date.UTC(2023, 10, 14, 22, 13, 20))
    expect(f.iso).toBe('2023-11-14T22:13:20Z')
    expect(f.utc).toBe('Tue, 14 Nov 2023 22:13:20 GMT')
  })

  it('本地格式与旧版 tsToDate 兼容(YYYY-MM-DD HH:mm:ss)', () => {
    const ms = Date.UTC(2023, 10, 14, 22, 13, 20)
    const d = new Date(ms)
    const pad = (n: number) => String(n).padStart(2, '0')
    const expected = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
      d.getHours(),
    )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
    expect(formatInstant(ms).local).toBe(expected)
  })

  it('指定时区输出墙上时钟并带真实偏移的 ISO 表示', () => {
    const ms = Date.UTC(2023, 10, 14, 22, 13, 20)
    const f = formatInstant(ms, 'Asia/Shanghai')
    expect(f.zoneTime).toBe('2023-11-15 06:13:20')
    expect(f.iso).toBe('2023-11-15T06:13:20+08:00')
    expect(f.utc).toBe('Tue, 14 Nov 2023 22:13:20 GMT')
  })

  it('夏令时边界(America/New_York 春季跳变)偏移正确切换', () => {
    // 2024-03-10 EST(-05)→ EDT(-04),UTC 07:00 整跳变
    const before = formatInstant(Date.UTC(2024, 2, 10, 6, 59, 59), 'America/New_York')
    expect(before.zoneTime).toBe('2024-03-10 01:59:59')
    expect(before.iso).toBe('2024-03-10T01:59:59-05:00')

    const after = formatInstant(Date.UTC(2024, 2, 10, 7, 0, 0), 'America/New_York')
    expect(after.zoneTime).toBe('2024-03-10 03:00:00')
    expect(after.iso).toBe('2024-03-10T03:00:00-04:00')

    // 秋季回拨:2024-11-03 当地 02:00 EDT 结束,UTC 06:00 起回到 -05
    const fallBack = formatInstant(Date.UTC(2024, 10, 3, 6, 0, 0), 'America/New_York')
    expect(fallBack.iso).toBe('2024-11-03T01:00:00-05:00')
  })

  it('相对时间随前后方向切换(中文风格)', () => {
    const now = Date.UTC(2024, 0, 1, 0, 0, 0)
    expect(formatInstant(now - 3 * 3600_000, undefined, now).relative).toBe('3 小时前')
    expect(formatInstant(now + 120_000, undefined, now).relative).toBe('2 分钟后')
    expect(formatInstant(now, undefined, now).relative).toBe('刚刚')
    expect(formatInstant(now - 500, undefined, now).relative).toBe('刚刚')
  })

  it('无效时间戳抛错', () => {
    expect(() => formatInstant(Number.NaN)).toThrow()
  })

  it('未知时区抛错', () => {
    expect(() => formatInstant(0, 'Nope/Nope')).toThrow(/时区/)
  })
})

describe('formatRelative 刻度', () => {
  const now = Date.UTC(2024, 0, 1)
  const cases: Array<[number, string]> = [
    [-30_000, '30 秒前'],
    [-61_000, '1 分钟前'],
    [-3600_000, '1 小时前'],
    [-86_400_000, '1 天前'],
    [-7 * 86_400_000, '1 周前'],
    [-31 * 86_400_000, '1 月前'],
    [-366 * 86_400_000, '1 年前'],
    [45_000, '45 秒后'],
    [7200_000, '2 小时后'],
  ]
  it.each(cases)('%d ms → %s', (delta, label) => {
    expect(formatRelative(now + delta, now)).toBe(label)
  })
})

describe('parseRelative 相对时间解析(中文优先)', () => {
  const now = Date.UTC(2024, 0, 1)

  it('「N 天前」「3天前」(无空格)均解析', () => {
    expect(parseRelative('3 天前', now)).toBe(now - 3 * 86_400_000)
    expect(parseRelative('3天前', now)).toBe(now - 3 * 86_400_000)
  })

  it('全部中文单位与后半缀', () => {
    expect(parseRelative('2 小时后', now)).toBe(now + 2 * 3600_000)
    expect(parseRelative('5 分钟前', now)).toBe(now - 300_000)
    expect(parseRelative('10 秒后', now)).toBe(now + 10_000)
    expect(parseRelative('半年前', now)).toBe(now - 0.5 * 31_536_000_000)
    expect(parseRelative('1 周前', now)).toBe(now - 7 * 86_400_000)
    expect(parseRelative('3 星期后', now)).toBe(now + 21 * 86_400_000)
  })

  it('英文 in N units / N units ago', () => {
    expect(parseRelative('in 2 hours', now)).toBe(now + 7_200_000)
    expect(parseRelative('In 2 Hours', now)).toBe(now + 7_200_000)
    expect(parseRelative('5 minutes ago', now)).toBe(now - 300_000)
  })

  it('小数量值', () => {
    expect(parseRelative('1.5 小时前', now)).toBe(now - 1.5 * 3600_000)
    expect(parseRelative('in 0.5 day', now)).toBe(now + 43_200_000)
  })

  it('缺方向词 / 乱码 / 空串返回 null', () => {
    expect(parseRelative('2 hours', now)).toBeNull()
    expect(parseRelative('abc', now)).toBeNull()
    expect(parseRelative('', now)).toBeNull()
    expect(parseRelative('-3 天前', now)).toBeNull()
  })

  it('默认 now 取当前时刻', () => {
    const got = parseRelative('10 秒前')
    expect(typeof got).toBe('number')
    expect(got).toBeLessThanOrEqual(Date.now())
    expect(got).toBeGreaterThan(Date.now() - 20_000)
  })
})

describe('COMMON_ZONES', () => {
  it('包含常用 IANA 区且不含非法项(Intl 可解析)', () => {
    for (const z of COMMON_ZONES) {
      expect(() => new Intl.DateTimeFormat('en', { timeZone: z })).not.toThrow()
    }
    expect(COMMON_ZONES).toContain('Asia/Shanghai')
    expect(COMMON_ZONES.length).toBeGreaterThanOrEqual(6)
  })
})
