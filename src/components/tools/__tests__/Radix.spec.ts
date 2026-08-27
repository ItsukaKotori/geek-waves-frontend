// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import Radix from '../Radix.vue'

const DEBOUNCE = 150

const decInput = (w: ReturnType<typeof mount>) => w.find('input[aria-label="10 进制"]')
const binInput = (w: ReturnType<typeof mount>) => w.find('input[aria-label="2 进制"]')
const octInput = (w: ReturnType<typeof mount>) => w.find('input[aria-label="8 进制"]')
const hexInput = (w: ReturnType<typeof mount>) => w.find('input[aria-label="16 进制"]')
const customInput = (w: ReturnType<typeof mount>) => w.find('input[aria-label="自定义进制"]')

beforeEach(() => {
  localStorage.clear()
})

describe('Radix 多进制同显(FE6)', () => {
  it('十进制输入后 ≤150ms 内 2/8/16 同步显示', async () => {
    vi.useFakeTimers()
    const w = mount(Radix)
    await decInput(w).setValue('255')
    await vi.advanceTimersByTimeAsync(DEBOUNCE - 1)
    await nextTick()
    expect((hexInput(w).element as HTMLInputElement).value).toBe('')
    await vi.advanceTimersByTimeAsync(1)
    await nextTick()
    expect((hexInput(w).element as HTMLInputElement).value).toBe('ff')
    expect((binInput(w).element as HTMLInputElement).value).toBe('11111111')
    expect((octInput(w).element as HTMLInputElement).value).toBe('377')
  })

  it('任一进制行可作输入源:改写 16 进制驱动其余联动', async () => {
    vi.useFakeTimers()
    const w = mount(Radix)
    await hexInput(w).setValue('ff')
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await nextTick()
    expect((decInput(w).element as HTMLInputElement).value).toBe('255')
  })

  it('自定义进制实时联动(32 进制)', async () => {
    vi.useFakeTimers()
    const w = mount(Radix)
    await w.find('select[aria-label="自定义进制基数"]').setValue('32')
    await decInput(w).setValue('1023')
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await nextTick()
    // 1023 = 31*32+31 → 32 进制最大两位字符 vv
    expect((customInput(w).element as HTMLInputElement).value).toBe('vv')
  })

  it('大数不丢精度:MAX_SAFE_INTEGER+1 原样保留并可跨进制往返', async () => {
    vi.useFakeTimers()
    const w = mount(Radix)
    await decInput(w).setValue('9007199254740993')
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await nextTick()
    expect((decInput(w).element as HTMLInputElement).value).toBe('9007199254740993')
    expect((hexInput(w).element as HTMLInputElement).value).toBe('20000000000001')
  })

  it('字节分组开关只影响展示位(hex 每字节 2 位,其他进制不受影响)', async () => {
    vi.useFakeTimers()
    const w = mount(Radix)
    await decInput(w).setValue('3735928559')
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await w.find('input[type="checkbox"]').setValue(true)
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await nextTick()
    expect((hexInput(w).element as HTMLInputElement).value).toBe('de ad be ef')
    // 十进制不是 2 幂进制,分组选项不改变其展示
    expect((decInput(w).element as HTMLInputElement).value).toBe('3735928559')
  })

  it('非法输入实时报错并清空其余行,清空输入立即失效旧结果', async () => {
    vi.useFakeTimers()
    const w = mount(Radix)
    await decInput(w).setValue('1a') // 十进制里 'a' 非法
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await nextTick()
    expect(w.text()).toContain("Invalid digit")
    expect((hexInput(w).element as HTMLInputElement).value).toBe('')
    await decInput(w).setValue('')
    await nextTick()
    expect(w.text()).not.toContain('Invalid digit')
    expect((binInput(w).element as HTMLInputElement).value).toBe('')
  })

  it('非法输入绝不清空正在编辑的行本身(仅失效其余行,防击键被吞)', async () => {
    vi.useFakeTimers()
    const w = mount(Radix)
    await hexInput(w).setValue('zz')
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await nextTick()
    // 编辑行原文原样保留;错误可见;其余行失效而非残留陈旧输出
    expect((hexInput(w).element as HTMLInputElement).value).toBe('zz')
    expect(w.text()).toContain('Invalid digit')
    expect((decInput(w).element as HTMLInputElement).value).toBe('')
    expect((binInput(w).element as HTMLInputElement).value).toBe('')
  })

  it('合法输入防抖后编辑行保留原文(+ 前缀/大小写/前导零不被规范化重写)', async () => {
    vi.useFakeTimers()
    const w = mount(Radix)
    await hexInput(w).setValue('+00Ff')
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await nextTick()
    expect((hexInput(w).element as HTMLInputElement).value).toBe('+00Ff')
    expect((decInput(w).element as HTMLInputElement).value).toBe('255')
  })

  it('Ctrl+Enter 立即冲刷计算(不等防抖)', async () => {
    vi.useFakeTimers()
    const w = mount(Radix)
    await decInput(w).setValue('255')
    await w.find('.tool-root').trigger('keydown.ctrl.enter')
    await nextTick()
    expect((hexInput(w).element as HTMLInputElement).value).toBe('ff')
  })
})
