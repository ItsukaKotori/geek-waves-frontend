// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import EncoderDecoder from '../EncoderDecoder.vue'
import { base64Encode } from '../../../tools/encodeDecode'

const DEBOUNCE = 150

/** 输出区:第一个 pre 为编码结果,第二个为解码结果 */
const pres = (w: ReturnType<typeof mount>) => {
  return w.findAll('pre').map((p) => p.text())
}

beforeEach(() => {
  localStorage.clear()
})

describe('EncoderDecoder 实时式交互(FE3)', () => {
  it('输入变化后 ≤150ms 内编码结果更新,期间无陈旧/抢先结果', async () => {
    vi.useFakeTimers()
    const w = mount(EncoderDecoder)
    await w.find('textarea').setValue('GeekWaves')
    await vi.advanceTimersByTimeAsync(DEBOUNCE - 1)
    await nextTick()
    expect(pres(w)).toEqual([])
    await vi.advanceTimersByTimeAsync(1)
    await nextTick()
    expect(pres(w)[0]).toBe(base64Encode('GeekWaves'))
    // 输入清空 → 旧结果立即失效
    await w.find('textarea').setValue('')
    await nextTick()
    expect(pres(w)).toEqual([])
  })

  it('双向同时实时产出:合法 Base64 即时解出明文', async () => {
    vi.useFakeTimers()
    const w = mount(EncoderDecoder)
    await w.find('textarea').setValue(base64Encode('GeekWaves'))
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await nextTick()
    expect(pres(w)[1]).toBe('GeekWaves')
  })

  it('非法 Base64 在解码面板给出行内错误而非陈旧明文', async () => {
    vi.useFakeTimers()
    const w = mount(EncoderDecoder)
    await w.find('textarea').setValue('!!!')
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await nextTick()
    expect(w.text()).toContain('Invalid base64')
  })

  it('不再保留「编码 / 解码」等计算按钮,仅余复制类按钮', () => {
    const w = mount(EncoderDecoder)
    const labels = w.findAll('button').map((b) => b.text())
    expect(labels.filter((t) => ['编码', '解码', '计算'].includes(t))).toEqual([])
  })

  it('URL 模式同样实时:', async () => {
    vi.useFakeTimers()
    const w = mount(EncoderDecoder)
    const urlTab = w.findAll('button').find((b) => b.classes().includes('tab') && b.text() === 'URL')
    await urlTab!.trigger('click')
    await w.find('textarea').setValue('a b&c')
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await nextTick()
    expect(pres(w)[0]).toBe(encodeURIComponent('a b&c'))
  })

  it('Ctrl+Enter 立即冲刷计算(不等防抖)', async () => {
    vi.useFakeTimers()
    const w = mount(EncoderDecoder)
    await w.find('textarea').setValue('GeekWaves')
    await w.find('textarea').trigger('keydown.ctrl.enter')
    await nextTick()
    expect(pres(w)[0]).toBe(base64Encode('GeekWaves'))
  })
})
