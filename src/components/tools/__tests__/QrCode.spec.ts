// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import QrCode from '../QrCode.vue'

const DEBOUNCE = 150

beforeEach(() => {
  localStorage.clear()
})

describe('QrCode 二维码工具', () => {
  it('输入内容后实时渲染 PNG 预览', async () => {
    vi.useFakeTimers()
    const w = mount(QrCode)
    await w.find('textarea').setValue('https://geekwaves.local')
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await vi.waitFor(() => {
      expect(w.find('img[data-qr]').attributes('src')).toMatch(/^data:image\/png;base64,/)
    })
    vi.useRealTimers()
  })

  it('空输入不渲染也不报错', async () => {
    vi.useFakeTimers()
    const w = mount(QrCode)
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    expect(w.find('img[data-qr]').exists()).toBe(false)
    expect(w.text()).not.toContain('错误')
    vi.useRealTimers()
  })

  it('切换纠错级别触发重渲染', async () => {
    vi.useFakeTimers()
    const w = mount(QrCode)
    await w.find('textarea').setValue('GeekWaves')
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await vi.waitFor(() => {
      expect(w.find('img[data-qr]').exists()).toBe(true)
    })
    const before = w.find('img[data-qr]').attributes('src')
    await w.findAll('button').find((b) => b.text().trim() === 'H')!.trigger('click')
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await vi.waitFor(() => {
      expect(w.find('img[data-qr]').attributes('src')).not.toBe(before)
    })
    vi.useRealTimers()
  })

  it('有结果时提供下载 PNG / SVG 按钮', async () => {
    vi.useFakeTimers()
    const w = mount(QrCode)
    await w.find('textarea').setValue('download me')
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await vi.waitFor(() => {
      expect(w.find('img[data-qr]').exists()).toBe(true)
    })
    const texts = w.findAll('a').map((a) => a.text())
    expect(texts.some((t) => t.includes('PNG'))).toBe(true)
    expect(texts.some((t) => t.includes('SVG'))).toBe(true)
    vi.useRealTimers()
  })

  it('输入与选项持久化,重挂载恢复', async () => {
    const w = mount(QrCode)
    await w.find('textarea').setValue('persist me')
    w.unmount()
    const w2 = mount(QrCode)
    expect((w2.find('textarea').element as HTMLTextAreaElement).value).toBe('persist me')
  })
})
