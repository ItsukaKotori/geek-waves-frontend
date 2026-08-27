// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import RegexMatch from '../RegexMatch.vue'

const DEBOUNCE = 150

beforeEach(() => {
  localStorage.clear()
})

async function setInput(w: ReturnType<typeof mount>, pattern: string, text: string): Promise<void> {
  const inputs = w.findAll('input')
  await inputs[0].setValue(pattern)
  await w.find('textarea').setValue(text)
}

describe('RegexMatch 实时式交互(FE3)', () => {
  it('输入 ≤150ms 内出现高亮与计数,期间无抢先结果', async () => {
    vi.useFakeTimers()
    const w = mount(RegexMatch)
    await setInput(w, '\\d+', 'a1 b22 c333')
    await vi.advanceTimersByTimeAsync(DEBOUNCE - 1)
    await nextTick()
    expect(w.text()).not.toContain('共 ')
    await vi.advanceTimersByTimeAsync(1)
    await nextTick()
    expect(w.text()).toContain('共 3 处匹配')
    const hl = w.findAll('span').filter((s) => s.classes().includes('bg-warning'))
    expect(hl.map((s) => s.text())).toEqual(['1', '22', '333'])
  })

  it('不再保留「匹配」按钮', () => {
    const w = mount(RegexMatch)
    expect(w.findAll('button').map((b) => b.text())).not.toContain('匹配')
  })

  it('非法正则实时报错', async () => {
    vi.useFakeTimers()
    const w = mount(RegexMatch)
    await setInput(w, '[unclosed', 'x')
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await nextTick()
    expect(w.text()).toContain('正则表达式非法')
  })

  it('空正则为空闲态,不残留错误或旧高亮', async () => {
    vi.useFakeTimers()
    const w = mount(RegexMatch)
    await setInput(w, '\\d+', 'a1 b22')
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await nextTick()
    expect(w.text()).toContain('共 2 处匹配')
    await w.findAll('input')[0].setValue('')
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await nextTick()
    expect(w.text()).not.toContain('共 2 处匹配')
  })

  it('Ctrl+Enter 立即冲刷匹配(不等防抖)', async () => {
    vi.useFakeTimers()
    const w = mount(RegexMatch)
    await setInput(w, '\\d+', 'a1 b22')
    await w.find('textarea').trigger('keydown.ctrl.enter')
    await nextTick()
    expect(w.text()).toContain('共 2 处匹配')
  })
})
