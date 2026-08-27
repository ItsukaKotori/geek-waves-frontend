// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { webcrypto } from 'node:crypto'
import { md5 } from 'js-md5'
import HashUuid from '../HashUuid.vue'

const DEBOUNCE = 150

/** jsdom 环境缺 WebCrypto,统一替换为 Node 实现(SHA 系列/UUID 都依赖它) */
vi.stubGlobal('crypto', webcrypto)

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const hashOutText = (w: ReturnType<typeof mount>) => {
  const pre = w.find('pre')
  return pre.exists() ? pre.text() : ''
}

describe('HashUuid 实时式交互(FE3)', () => {
  it('文本哈希 ≤150ms 内实时产出,期间无陈旧结果', async () => {
    vi.useFakeTimers()
    const w = mount(HashUuid)
    await w.findAll('select')[0].setValue('MD5')
    await w.find('input[placeholder]').setValue('GeekWaves')
    await vi.advanceTimersByTimeAsync(DEBOUNCE - 1)
    await nextTick()
    expect(hashOutText(w)).toBe('')
    await vi.advanceTimersByTimeAsync(1)
    await nextTick()
    expect(hashOutText(w)).toBe(md5('GeekWaves'))
  })

  it('不再保留「计算」按钮', () => {
    const w = mount(HashUuid)
    expect(w.findAll('button').map((b) => b.text())).not.toContain('计算')
  })

  it('连续快速输入只产出末值哈希(防抖竞态)', async () => {
    vi.useFakeTimers()
    const w = mount(HashUuid)
    await w.findAll('select')[0].setValue('MD5')
    await w.find('input[placeholder]').setValue('a')
    await w.find('input[placeholder]').setValue('ab')
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await nextTick()
    expect(hashOutText(w)).toBe(md5('ab'))
  })

  it('清空输入立即失效旧哈希', async () => {
    vi.useFakeTimers()
    const w = mount(HashUuid)
    await w.findAll('select')[0].setValue('MD5')
    await w.find('input[placeholder]').setValue('GeekWaves')
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await w.find('input[placeholder]').setValue('')
    await nextTick()
    expect(hashOutText(w)).toBe('')
  })

  it('Ctrl+Enter 立即冲刷哈希计算(不等防抖)', async () => {
    vi.useFakeTimers()
    const w = mount(HashUuid)
    await w.findAll('select')[0].setValue('MD5')
    await w.find('input[placeholder]').setValue('GeekWaves')
    await w.find('input[placeholder]').trigger('keydown.ctrl.enter')
    await nextTick()
    expect(hashOutText(w)).toBe(md5('GeekWaves'))
  })

  it('UUID 生成保留显式「生成」按钮并可用(webcrypto stub)', async () => {
    const w = mount(HashUuid)
    const genBtn = w.findAll('button').find((b) => b.text() === '生成')
    expect(genBtn).toBeTruthy()
    await genBtn!.trigger('click')
    await nextTick()
    const text = w.findAll('pre').map((p) => p.text()).join('\n')
    expect(text).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/m)
  })
})
