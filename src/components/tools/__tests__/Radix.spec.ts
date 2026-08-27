// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import Radix from '../Radix.vue'

const DEBOUNCE = 150

const outText = (w: ReturnType<typeof mount>) => {
  const pre = w.find('pre')
  return pre.exists() ? pre.text() : ''
}

/** 默认 from=10→to=16;统一改为 16 进制输入 → 10 进制输出便于断言 */
async function setBases(w: ReturnType<typeof mount>): Promise<void> {
  await w.findAll('select')[0].setValue('16')
  await w.findAll('select')[1].setValue('10')
}

beforeEach(() => {
  localStorage.clear()
})

describe('Radix 实时式交互(FE3)', () => {
  it('输入变化后 ≤150ms 内结果更新,期间无陈旧/抢先结果', async () => {
    vi.useFakeTimers()
    const w = mount(Radix)
    await setBases(w)
    await w.find('input').setValue('ff')
    await vi.advanceTimersByTimeAsync(DEBOUNCE - 1)
    await nextTick()
    expect(outText(w)).toBe('')
    await vi.advanceTimersByTimeAsync(1)
    await nextTick()
    expect(outText(w)).toBe('255')
  })

  it('不再保留「转换」按钮', () => {
    const w = mount(Radix)
    expect(w.findAll('button').map((b) => b.text())).not.toContain('转换')
  })

  it('非法输入实时显示错误,清空立即失效', async () => {
    vi.useFakeTimers()
    const w = mount(Radix)
    await w.find('input').setValue('zz') // 默认 from=10,'z' 非法
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await nextTick()
    expect(w.text()).toContain("Invalid digit 'z'")
    await w.find('input').setValue('')
    await nextTick()
    expect(outText(w)).toBe('')
    expect(w.text()).not.toContain('Invalid digit')
  })

  it('Ctrl+Enter 立即冲刷计算(不等防抖)', async () => {
    vi.useFakeTimers()
    const w = mount(Radix)
    await setBases(w)
    await w.find('input').setValue('ff')
    await w.find('input').trigger('keydown.ctrl.enter')
    await nextTick()
    expect(outText(w)).toBe('255')
  })
})
