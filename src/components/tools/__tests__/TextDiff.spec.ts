// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import TextDiff from '../TextDiff.vue'
import { MAX_DIFF_LINES } from '../../../tools/textDiff'

/**
 * 文本 diff 组件交互(实时范式:输入即对比,150ms 防抖,无计算按钮):
 * 关键路径 = 双栏输入实时出结果 / 统计徽标 / 超阈值停止并提示 / Ctrl+Enter 冲刷。
 */

const DEBOUNCE = 150

beforeEach(() => {
  localStorage.clear()
})

describe('TextDiff 实时对比', () => {
  it('输入停止 150ms 后出结果,期间不抢先', async () => {
    vi.useFakeTimers()
    const w = mount(TextDiff)
    const [a, b] = w.findAll('textarea')
    await a.setValue('alpha\nbeta')
    await b.setValue('alpha\nBETA')
    await vi.advanceTimersByTimeAsync(DEBOUNCE - 1)
    expect(w.find('[data-testid="diff-rows"]').exists()).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await nextTick()
    const rows = w.findAll('[data-testid="diff-rows"] > div')
    expect(rows.map((r) => r.attributes('data-row-type'))).toEqual(['equal', 'del', 'add'])
  })

  it('统计徽标:未变/新增/删除计数', async () => {
    vi.useFakeTimers()
    const w = mount(TextDiff)
    const [a, b] = w.findAll('textarea')
    await a.setValue('x\ny\nz')
    await b.setValue('x\ny2\nz\nw')
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    const stats = w.find('[data-testid="diff-stats"]').text()
    expect(stats).toContain('未变 2')
    expect(stats).toContain('新增 2')
    expect(stats).toContain('删除 1')
  })

  it('两侧全等:只有未变行,无新增/删除', async () => {
    vi.useFakeTimers()
    const w = mount(TextDiff)
    const [a, b] = w.findAll('textarea')
    await a.setValue('same')
    await b.setValue('same')
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    const types = w.findAll('[data-testid="diff-rows"] > div').map((r) => r.attributes('data-row-type'))
    expect(types).toEqual(['equal'])
  })

  it(`任一侧超过 ${MAX_DIFF_LINES} 行:停止计算并提示,不渲染结果`, async () => {
    vi.useFakeTimers()
    const w = mount(TextDiff)
    const big = Array.from({ length: MAX_DIFF_LINES + 1 }, (_, i) => `L${i}`).join('\n')
    const [a, b] = w.findAll('textarea')
    await a.setValue('small')
    await b.setValue(big)
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    expect(w.text()).toContain(String(MAX_DIFF_LINES))
    expect(w.find('[data-testid="diff-rows"]').exists()).toBe(false)

    // 回到阈值内立即恢复计算
    await b.setValue('small')
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    expect(w.find('[data-testid="diff-rows"]').exists()).toBe(true)
  })

  it('清空输入回到引导态', async () => {
    vi.useFakeTimers()
    const w = mount(TextDiff)
    const [a, b] = w.findAll('textarea')
    await a.setValue('1')
    await b.setValue('2')
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    expect(w.find('[data-testid="diff-rows"]').exists()).toBe(true)
    await a.setValue('')
    await b.setValue('')
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    expect(w.find('[data-testid="diff-rows"]').exists()).toBe(false)
    expect(w.text()).toContain('实时对比')
  })

  it('Ctrl+Enter 立即冲刷(不等防抖)', async () => {
    vi.useFakeTimers()
    const w = mount(TextDiff)
    const [a, b] = w.findAll('textarea')
    await a.setValue('old')
    await b.setValue('new')
    await a.trigger('keydown.ctrl.enter')
    await nextTick()
    const types = w.findAll('[data-testid="diff-rows"] > div').map((r) => r.attributes('data-row-type'))
    expect(types).toEqual(['del', 'add'])
  })
})
