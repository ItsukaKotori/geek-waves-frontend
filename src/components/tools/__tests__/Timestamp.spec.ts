// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import Timestamp from '../Timestamp.vue'
import { tsToDate, dateToTs } from '../../../tools/timestamp'

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
