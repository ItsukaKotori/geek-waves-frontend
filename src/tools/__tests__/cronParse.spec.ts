import { describe, expect, it } from 'vitest'
import {
  describeCron,
  formatCronRun,
  nextCronRun,
  nextCronRuns,
  parseCron,
} from '../cronParse'

/**
 * crontab 解析纯函数层(FE10 T2 批次一)。
 * 支持范围声明(报告同步):标准 5 段 cron(分 时 日 月 周),
 * 支持 * / 逗号列表 / 范围 / 步长(含 a-b/step 与 a/step)、英文月与星期缩写;
 * 周字段 0 或 7 均为周日;不支持 @宏、秒级与 Quartz 的 ?/L/W。
 * 日期语义按 Vixie cron:日与周同时受限时取「或」。
 * 推算基于本地时区墙钟(DST 缺口时刻顺延,重复时刻取首个偏移),由 JS Date 归一化保证。
 */

describe('parseCron:解析与报错', () => {
  it('段数错误明确报错', () => {
    expect(() => parseCron('* * * *')).toThrow(/5 段/)
    expect(() => parseCron('* * * * * *')).toThrow(/5 段/)
    expect(() => parseCron('')).toThrow(/5 段/)
  })

  it('越界值明确报错(带字段名与合法范围)', () => {
    expect(() => parseCron('60 * * * *')).toThrow(/分钟.*0~59/)
    expect(() => parseCron('* 24 * * *')).toThrow(/小时.*0~23/)
    expect(() => parseCron('* * 0 * *')).toThrow(/日.*1~31/)
    expect(() => parseCron('* * * 13 *')).toThrow(/月.*1~12/)
    expect(() => parseCron('* * * * 8')).toThrow(/周.*0~7/)
  })

  it('范围颠倒 / 步长非法 / 词法错误明确报错', () => {
    expect(() => parseCron('50-10 * * * *')).toThrow(/大于/)
    expect(() => parseCron('*/0 * * * *')).toThrow(/步长/)
    expect(() => parseCron('*/x * * * *')).toThrow(/无法识别|步长/)
    expect(() => parseCron('abc * * * *')).toThrow(/无法识别/)
    expect(() => parseCron('1,,2 * * * *')).toThrow(/空/)
  })

  it('列表 / 范围 / 步长组合解析为值集合', () => {
    const e = parseCron('0,15,30,45 * * * *')
    expect([...e.minute.values]).toEqual([0, 15, 30, 45])
    expect(e.minute.wildcard).toBe(false)

    const r = parseCron('10-20/5 * * * *')
    expect([...r.minute.values]).toEqual([10, 15, 20])

    const s = parseCron('5/25 * * * *')
    expect([...s.minute.values]).toEqual([5, 30, 55])
  })

  it('*/n 为受限步长,*/1 与 * 等价于不受限', () => {
    expect(parseCron('*/2 * * * *').minute.wildcard).toBe(false)
    expect(parseCron('*/1 * * * *').minute.wildcard).toBe(true)
    expect(parseCron('0-59 * * * *').minute.wildcard).toBe(true)
  })

  it('月与周支持英文缩写(大小写不敏感)', () => {
    const e = parseCron('0 0 1 JAN-MAR *')
    expect([...e.month.values]).toEqual([1, 2, 3])
    const w = parseCron('0 9 * * MON,WED,FRI')
    expect([...w.dow.values]).toEqual([1, 3, 5])
  })

  it('周字段 7 归一化为周日(0)', () => {
    const e = parseCron('0 0 * * 7')
    expect(e.dow.values.has(0)).toBe(true)
    expect(e.dow.values.has(7)).toBe(false)
    expect([...e.dow.values]).toEqual(parseCron('0 0 * * 0').dow.values ? [...parseCron('0 0 * * 0').dow.values] : [])
    const range = parseCron('0 0 * * 5-7')
    expect([...range.dow.values].sort((a, b) => a - b)).toEqual([0, 5, 6])
  })
})

describe('describeCron:中文描述(以人可读为准)', () => {
  it('每小时通配:每小时的第 0 分钟(brief 示例)', () => {
    expect(describeCron(parseCron('0 * * * *'))).toBe('每小时的第 0 分钟')
  })

  it('分钟步长:每隔 N 分钟', () => {
    expect(describeCron(parseCron('*/5 * * * *'))).toBe('每隔 5 分钟')
    expect(describeCron(parseCron('0,15,30,45 * * * *'))).toBe('每隔 15 分钟')
  })

  it('每日定时:每天 HH:mm', () => {
    expect(describeCron(parseCron('30 8 * * *'))).toBe('每天 08:30')
    expect(describeCron(parseCron('0 0 * * *'))).toBe('每天 00:00')
  })

  it('每周定时:周一至周五 + 时间', () => {
    expect(describeCron(parseCron('30 8 * * 1-5'))).toBe('每周一至周五 08:30')
    expect(describeCron(parseCron('0 12 * * 1,3'))).toBe('每周一、周三 12:00')
    expect(describeCron(parseCron('0 9 * * 0'))).toBe('每周日 09:00')
  })

  it('每月定时:每月 N 日 + 时间', () => {
    expect(describeCron(parseCron('0 0 1 * *'))).toBe('每月 1 日 00:00')
    expect(describeCron(parseCron('0 0 1,15 * *'))).toBe('每月 1、15 日 00:00')
    expect(describeCron(parseCron('0 0 */7 * *'))).toBe('每月每 7 日 00:00')
  })

  it('每小时字段受限 + 分钟通配', () => {
    expect(describeCron(parseCron('0 */6 * * *'))).toBe('每隔 6 小时')
    expect(describeCron(parseCron('* 9 * * *'))).toBe('每天 9 点的每分钟')
  })

  it('月份受限:前置「N 月」', () => {
    expect(describeCron(parseCron('0 0 1 1 *'))).toBe('1 月 1 日 00:00')
    expect(describeCron(parseCron('0 0 * 6-8 *'))).toBe('6~8 月 每天 00:00')
  })

  it('日与周同时受限:或语义', () => {
    expect(describeCron(parseCron('0 0 15 * 1'))).toBe('每月 15 日 或 每周一 00:00')
  })

  it('小时范围 + 分钟列表的兜底描述', () => {
    expect(describeCron(parseCron('0 9-18 * * *'))).toBe('每天 9~18 点的第 0 分')
  })
})

describe('nextCronRun:下次运行推算', () => {
  it('分钟步长:从 10:03 起,下次为 10:05', () => {
    const e = parseCron('*/5 * * * *')
    const from = new Date(2026, 0, 15, 10, 3, 30)
    expect(formatCronRun(nextCronRun(e, from))).toBe('2026-01-15 10:05 周四')
  })

  it('每日定时跨小时:07:00 → 当日 08:30', () => {
    const e = parseCron('30 8 * * *')
    expect(formatCronRun(nextCronRun(e, new Date(2026, 5, 1, 7, 0)))).toBe('2026-06-01 08:30 周一')
  })

  it('月末边界:1 月 31 日 12:00 → 2 月 1 日 00:00', () => {
    const e = parseCron('0 0 1 * *')
    expect(formatCronRun(nextCronRun(e, new Date(2026, 0, 31, 12, 0)))).toBe('2026-02-01 00:00 周日')
  })

  it('仅 31 日:2/4 等小月自动跳过', () => {
    const e = parseCron('0 0 31 * *')
    const runs = nextCronRuns(e, 3, new Date(2026, 0, 10, 0, 0))
    expect(runs.map(formatCronRun)).toEqual([
      '2026-01-31 00:00 周六',
      '2026-03-31 00:00 周二',
      '2026-05-31 00:00 周日',
    ])
  })

  it('周末边界:周一至周五 9 点,周五 10:00 → 下周一', () => {
    const e = parseCron('0 9 * * 1-5')
    // 2026-01-16 为周五
    expect(formatCronRun(nextCronRun(e, new Date(2026, 0, 16, 10, 0)))).toBe('2026-01-19 09:00 周一')
    // 周六与周日被跳过
    expect(formatCronRun(nextCronRun(e, new Date(2026, 0, 17, 8, 0)))).toBe('2026-01-19 09:00 周一')
  })

  it('周日 0 与 7 等价', () => {
    const from = new Date(2026, 0, 19, 2, 0) // 2026-01-19 周一
    const zero = nextCronRun(parseCron('0 0 * * 0'), from)
    const seven = nextCronRun(parseCron('0 0 * * 7'), from)
    expect(formatCronRun(zero)).toBe('2026-01-25 00:00 周日')
    expect(formatCronRun(seven)).toEqual(formatCronRun(zero))
  })

  it('日与周同时受限按「或」:15 日或周一', () => {
    const e = parseCron('0 0 15 * 1')
    const runs = nextCronRuns(e, 3, new Date(2026, 0, 12, 0, 0))
    // from 之后的匹配:01-15(或语义命中 15 日)→ 周一 01-19 → 周一 01-26
    expect(runs.map(formatCronRun)).toEqual([
      '2026-01-15 00:00 周四',
      '2026-01-19 00:00 周一',
      '2026-01-26 00:00 周一',
    ])
  })

  it('闰年:2 月 29 日(2026 平年跳到 2028)', () => {
    const e = parseCron('0 0 29 2 *')
    expect(formatCronRun(nextCronRun(e, new Date(2026, 1, 1, 0, 0)))).toBe('2028-02-29 00:00 周二')
  })

  it('跨年:12 月 31 日 23:59 → 次年 1 月 1 日', () => {
    const e = parseCron('0 0 1 1 *')
    expect(formatCronRun(nextCronRun(e, new Date(2026, 11, 31, 23, 59)))).toBe('2027-01-01 00:00 周五')
  })

  it('永不相配的表达式(2 月 31 日)在有限步内明确报错', () => {
    const e = parseCron('0 0 31 2 *')
    expect(() => nextCronRun(e, new Date(2026, 0, 1, 0, 0))).toThrow(/未找到匹配/)
  })

  it('nextCronRuns:数量与逐次递推', () => {
    const e = parseCron('*/10 * * * *')
    const runs = nextCronRuns(e, 5, new Date(2026, 7, 28, 8, 1))
    expect(runs).toHaveLength(5)
    expect(runs.map(formatCronRun)).toEqual([
      '2026-08-28 08:10 周五',
      '2026-08-28 08:20 周五',
      '2026-08-28 08:30 周五',
      '2026-08-28 08:40 周五',
      '2026-08-28 08:50 周五',
    ])
  })
})
