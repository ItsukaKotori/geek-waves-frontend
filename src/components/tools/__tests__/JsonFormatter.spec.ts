// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import JsonFormatter from '../JsonFormatter.vue'

const DEBOUNCE = 150

beforeEach(() => {
  localStorage.clear()
})

const preText = (w: ReturnType<typeof mount>) => {
  const pre = w.find('pre')
  return pre.exists() ? pre.text() : ''
}

async function pickTarget(w: ReturnType<typeof mount>, id: string): Promise<void> {
  await w.find('select').setValue(id)
}

describe('JsonFormatter 实时式交互(FE3)', () => {
  it('JSON → YAML 输入 ≤150ms 内出结果,期间无陈旧/抢先结果', async () => {
    vi.useFakeTimers()
    const w = mount(JsonFormatter)
    await w.find('textarea').setValue('{"a":1,"b":"x"}')
    await vi.advanceTimersByTimeAsync(DEBOUNCE - 1)
    await nextTick()
    expect(preText(w)).toBe('')
    await vi.advanceTimersByTimeAsync(1)
    await nextTick()
    expect(preText(w)).toContain('a: 1')
  })

  it('不再保留任何「计算」类按钮(旧 JSON → x / 格式化按钮均转为实时)', () => {
    const w = mount(JsonFormatter)
    const labels = w.findAll('button').map((b) => b.text())
    expect(labels.some((t) => t.includes('JSON →') || t.includes('→ JSON'))).toBe(false)
    expect(labels.some((t) => t.includes('转换') || t.includes('格式化'))).toBe(true)
    expect(w.findAll('button')).toHaveLength(4) // 视图切换 ×2 + 方向 →/←
  })

  it('反向 YAML → JSON 实时生效', async () => {
    vi.useFakeTimers()
    const w = mount(JsonFormatter)
    const back = w.findAll('button').find((b) => b.text() === '←')
    await back!.trigger('click')
    await w.find('textarea').setValue('a: 1\nb: x\n')
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await nextTick()
    expect(JSON.parse(preText(w))).toEqual({ a: 1, b: 'x' })
  })

  it('TS 单向:反向按钮仍被禁用', async () => {
    const w = mount(JsonFormatter)
    await pickTarget(w, 'ts')
    await w.vm.$nextTick()
    const back = w.findAll('button').find((b) => b.text() === '←')
    expect((back!.element as HTMLButtonElement).disabled).toBe(true)
  })

  it('「格式化」视图实时美化 JSON', async () => {
    vi.useFakeTimers()
    const w = mount(JsonFormatter)
    const prettyTab = w.findAll('.tab').find((t) => t.text() === '美化视图')
    await prettyTab!.trigger('click')
    await w.find('textarea').setValue('{"a":1}')
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await nextTick()
    expect(preText(w)).toContain('"a": 1')
  })

  it('转换失败实时显示错误', async () => {
    vi.useFakeTimers()
    const w = mount(JsonFormatter)
    await w.find('textarea').setValue('{invalid')
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await nextTick()
    expect(preText(w)).toBe('')
    expect(w.find('.text-error').exists()).toBe(true)
  })

  it('Go 往返(组件路径,全程实时)', async () => {
    vi.useFakeTimers()
    const w = mount(JsonFormatter)
    await pickTarget(w, 'go')
    await w.find('textarea').setValue('{"a":1,"list":[1,2]}')
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await nextTick()
    const go = preText(w)
    expect(go).toContain('map[string]interface{}')
    // 结果作为输入,切反向实时转回 JSON
    await w.find('textarea').setValue(go)
    const back = w.findAll('button').find((b) => b.text() === '←')
    await back!.trigger('click')
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await nextTick()
    expect(JSON.parse(preText(w))).toEqual({ a: 1, list: [1, 2] })
  })

  it('Ctrl+Enter 立即冲刷转换(不等防抖)', async () => {
    vi.useFakeTimers()
    const w = mount(JsonFormatter)
    await w.find('textarea').setValue('{"k":[1,2]}')
    await w.find('textarea').trigger('keydown.ctrl.enter')
    await nextTick()
    expect(preText(w)).not.toBe('')
  })
})
