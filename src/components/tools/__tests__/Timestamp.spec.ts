// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import Timestamp from '../Timestamp.vue'
import { tsToDate, dateToTs, parseRelative } from '../../../tools/timestamp'

const DEBOUNCE = 150

beforeEach(() => {
  localStorage.clear()
})

/** 两个方向的输出 pre(时间戳→日期 在前,日期→时间戳 在后) */
const pres = (w: ReturnType<typeof mount>) => w.findAll('pre').map((p) => p.text())

describe('Timestamp 实时式交互(FE3)', () => {
  it('时间戳输入 ≤150ms 内得到日期,期间无陈旧结果', async () => {
    vi.useFakeTimers()
    const w = mount(Timestamp)
    const inputs = w.findAll('input')
    await inputs[0].setValue('1700000000')
    await vi.advanceTimersByTimeAsync(DEBOUNCE - 1)
    await nextTick()
    expect(pres(w)).toEqual([])
    await vi.advanceTimersByTimeAsync(1)
    await nextTick()
    expect(pres(w)[0]).toBe(tsToDate(1700000000))
    expect(w.text()).toContain('秒级时间戳')
  })

  it('日期输入实时得到 s/ms 双值', async () => {
    vi.useFakeTimers()
    const w = mount(Timestamp)
    await w.find('input[type="datetime-local"]').setValue('2023-11-14T22:13:20')
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await nextTick()
    const expected = dateToTs(new Date('2023-11-14T22:13:20'))
    expect(pres(w)[0]).toContain(`s=${expected.s}`)
  })

  it('不再保留「转换」按钮', () => {
    const w = mount(Timestamp)
    expect(w.findAll('button').map((b) => b.text())).not.toContain('转换')
  })

  it('秒级/毫秒级解释说明随输入实时切换', async () => {
    vi.useFakeTimers()
    const w = mount(Timestamp)
    await w.findAll('input')[0].setValue('1700000000')
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await nextTick()
    expect(w.text()).toContain('秒级时间戳')
    await w.findAll('input')[0].setValue('1700000000000')
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await nextTick()
    expect(w.text()).toContain('按毫秒时间戳解释')
  })

  it('Ctrl+Enter 立即冲刷计算(不等防抖)', async () => {
    vi.useFakeTimers()
    const w = mount(Timestamp)
    await w.findAll('input')[0].setValue('1700000000000')
    await w.findAll('input')[0].trigger('keydown.ctrl.enter')
    await nextTick()
    expect(pres(w)[0]).toBe(tsToDate(1700000000000))
  })
})

describe('Timestamp FE5 功能补全', () => {
  it('「现在」按钮把当前秒级时间戳填入输入框并实时出结果', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-05-06T07:08:09Z'))
    const w = mount(Timestamp)
    const nowBtn = w.findAll('button').find((b) => b.text() === '现在')
    expect(nowBtn).toBeTruthy()
    await nowBtn!.trigger('click')
    const expectedS = Math.floor(Date.now() / 1000)
    expect(String(w.findAll('input')[0].element.value)).toBe(String(expectedS))
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await nextTick()
    expect(pres(w)[0]).toBe(tsToDate(expectedS))
    vi.useRealTimers()
  })

  it('同一输入多格式同显:ISO / UTC / 本地 / 相对时间并列', async () => {
    vi.useFakeTimers()
    const now = Date.UTC(2024, 5, 1, 12, 0, 0)
    vi.setSystemTime(now)
    const w = mount(Timestamp)
    await w.findAll('input')[0].setValue('1717243200') // 2024-06-01T12:00:00Z
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await nextTick()
    const text = w.text()
    expect(text).toContain('2024-06-01T12:00:00Z') // ISO8601
    expect(text).toContain('Sat, 01 Jun 2024 12:00:00 GMT') // UTC 字符串
    expect(text).toContain(tsToDate(1717243200)) // 本地格式
    expect(text).toContain('刚刚') // 相对时间
    vi.useRealTimers()
  })

  it('时区切换立即刷新 ISO 偏移与区内墙上时钟(含防抖窗口)', async () => {
    vi.useFakeTimers()
    const w = mount(Timestamp)
    await w.findAll('input')[0].setValue('1717243200')
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    const zoneSelect = w.findAll('select')[0]
    await zoneSelect.setValue('Asia/Tokyo')
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await nextTick()
    expect(w.text()).toContain('2024-06-01T21:00:00+09:00')
    expect(w.text()).toContain('2024-06-01 21:00:00')
    vi.useRealTimers()
  })

  it('自动刷新开关驱动实时当前时间戳每秒跳动', async () => {
    vi.useFakeTimers()
    const start = Date.UTC(2024, 0, 1, 0, 0, 0)
    vi.setSystemTime(start)
    const w = mount(Timestamp)
    const toggle = w.findAll('input[type="checkbox"]')[0]
    await toggle.setValue(true)
    const sAt = () => w.findAll('.now-clock')[0].text()
    expect(sAt()).toContain(String(Math.floor(start / 1000)))
    await vi.advanceTimersByTimeAsync(2000)
    await nextTick()
    expect(sAt()).toContain(String(Math.floor((start + 2000) / 1000)))
    vi.useRealTimers()
  })

  it('相对时间解析:「3 天前」→ 秒/毫秒与本地时间实时显示,乱码给行内错误', async () => {
    vi.useFakeTimers()
    const now = Date.UTC(2024, 0, 10)
    vi.setSystemTime(now)
    const w = mount(Timestamp)
    const relInputs = w.findAll('input').filter((i) => i.attributes('type') !== 'checkbox' && i.attributes('type') !== 'number' && i.attributes('type') !== 'datetime-local')
    const relInput = relInputs[relInputs.length - 1]
    await relInput.setValue('3 天前')
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await nextTick()
    const expectedMs = parseRelative('3 天前', now)!
    expect(w.text()).toContain(`s=${Math.floor(expectedMs / 1000)}`)
    expect(w.text()).toContain(tsToDate(Math.floor(expectedMs / 1000)))

    await relInput.setValue('乱码xyz')
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await nextTick()
    expect(w.text()).toContain('无法识别的相对时间表述')
    vi.useRealTimers()
  })

  it('超安全整数的大数输入给出行内精度错误而非错误日期', async () => {
    vi.useFakeTimers()
    const w = mount(Timestamp)
    await w.findAll('input')[0].setValue('90071992547409930')
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await nextTick()
    expect(w.text()).toContain('安全整数')
    vi.useRealTimers()
  })
})
