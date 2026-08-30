// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import ColorTool from '../ColorTool.vue'

/**
 * 颜色工具组件交互(实时范式:任一输入全联动,150ms 防抖):
 * 关键路径 = 默认三格式联动与对比度展示 / HEX→RGB/HSL 联动 / RGB→HEX 联动 /
 * 非法输入报错且保留上次合法值 / 前景背景选取与设为前景/背景 / WCAG 判级徽章。
 */

const DEBOUNCE = 150

beforeEach(() => {
  localStorage.clear()
})

describe('ColorTool 三格式联动与对比度', () => {
  it('默认态:#336699 三格式联动,对比度 6.00 且判级徽章正确', async () => {
    vi.useFakeTimers()
    const w = mount(ColorTool)
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await nextTick()
    expect((w.find('[data-testid="color-hex"]').element as HTMLInputElement).value).toBe('#336699')
    expect((w.find('[data-testid="color-rgb"]').element as HTMLInputElement).value).toBe('rgb(51, 102, 153)')
    expect((w.find('[data-testid="color-hsl"]').element as HTMLInputElement).value).toBe('hsl(210, 50%, 40%)')
    expect(w.find('[data-testid="color-ratio"]').text()).toBe('6.00')
    expect(w.find('[data-testid="color-grade-normal-aa"]').text()).toContain('通过')
    expect(w.find('[data-testid="color-grade-normal-aaa"]').text()).toContain('未达标')
    expect(w.find('[data-testid="color-grade-large-aa"]').text()).toContain('通过')
  })

  it('编辑 HEX:RGB/HSL 实时联动;对比度跟随前景/背景(需显式「设为前景」)', async () => {
    vi.useFakeTimers()
    const w = mount(ColorTool)
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await w.find('[data-testid="color-hex"]').setValue('#ff0000')
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await nextTick()
    expect((w.find('[data-testid="color-rgb"]').element as HTMLInputElement).value).toBe('rgb(255, 0, 0)')
    expect((w.find('[data-testid="color-hsl"]').element as HTMLInputElement).value).toBe('hsl(0, 100%, 50%)')
    // 当前色不自动挤占已选前景:对比度仍为原前景 #336699 × 白 = 6.00
    expect(w.find('[data-testid="color-ratio"]').text()).toBe('6.00')
    // 显式桥接后对比度联动:#ff0000 × 白 = 4.00
    await w.find('[data-testid="color-set-fg"]').trigger('click')
    await nextTick()
    expect(w.find('[data-testid="color-ratio"]').text()).toBe('4.00')
  })

  it('编辑 RGB:HEX/HSL 联动', async () => {
    vi.useFakeTimers()
    const w = mount(ColorTool)
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await w.find('[data-testid="color-rgb"]').setValue('0, 128, 255')
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await nextTick()
    expect((w.find('[data-testid="color-hex"]').element as HTMLInputElement).value).toBe('#0080ff')
    expect((w.find('[data-testid="color-hsl"]').element as HTMLInputElement).value).toContain('209.9')
  })

  it('编辑 HSL:HEX 联动', async () => {
    vi.useFakeTimers()
    const w = mount(ColorTool)
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await w.find('[data-testid="color-hsl"]').setValue('hsl(120, 100%, 25%)')
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await nextTick()
    expect((w.find('[data-testid="color-hex"]').element as HTMLInputElement).value).toBe('#008000')
  })

  it('非法输入明确报错且保留上次合法联动值', async () => {
    vi.useFakeTimers()
    const w = mount(ColorTool)
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await w.find('[data-testid="color-hex"]').setValue('#zzzzzz')
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await nextTick()
    expect(w.text()).toContain('十六进制')
    expect((w.find('[data-testid="color-rgb"]').element as HTMLInputElement).value).toBe('rgb(51, 102, 153)')
  })

  it('前景/背景选取器与「设为前景/背景」', async () => {
    vi.useFakeTimers()
    const w = mount(ColorTool)
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    // 直接改背景为黑色:fg #336699 × #000000 = (0.125+0.05)/0.05 = 3.50
    await w.find('[data-testid="color-bg"]').setValue('#000000')
    await nextTick()
    expect(w.find('[data-testid="color-ratio"]').text()).toBe('3.50')
    // 恢复白色,把当前色设为背景:bg 变为 #336699,同色对比 1.00
    await w.find('[data-testid="color-bg"]').setValue('#ffffff')
    await w.find('[data-testid="color-set-bg"]').trigger('click')
    await nextTick()
    expect((w.find('[data-testid="color-bg"]').element as HTMLInputElement).value).toBe('#336699')
    expect(w.find('[data-testid="color-ratio"]').text()).toBe('1.00')
    // 设为前景同理
    await w.find('[data-testid="color-set-fg"]').trigger('click')
    await nextTick()
    expect((w.find('[data-testid="color-fg"]').element as HTMLInputElement).value).toBe('#336699')
  })

  it('前景色与背景色持久化', async () => {
    vi.useFakeTimers()
    const w = mount(ColorTool)
    await w.find('[data-testid="color-bg"]').setValue('#000000')
    await nextTick()
    expect(localStorage.getItem('geekwaves-tools:color')).toContain('#000000')
  })
})
