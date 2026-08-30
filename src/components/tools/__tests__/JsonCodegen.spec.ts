// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import JsonCodegen from '../JsonCodegen.vue'

/**
 * JSON 类型生成组件交互(实时范式:输入即生成,150ms 防抖):
 * 关键路径 = 默认 Kotlin 输出 / 目标切换 Kotlin↔Rust / 非法 JSON 明确报错 /
 * 顶层非对象报错 / Ctrl+Enter 冲刷 / 输入与目标持久化。
 */

const DEBOUNCE = 150

beforeEach(() => {
  localStorage.clear()
})

describe('JsonCodegen 实时生成', () => {
  it('默认样例生成 Kotlin data class', async () => {
    vi.useFakeTimers()
    const w = mount(JsonCodegen)
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await nextTick()
    const out = w.find('[data-testid="codegen-output"]').text()
    expect(out).toContain('data class Root(')
    expect(out).toMatch(/val name: String,/)
  })

  it('切换目标为 Rust:snake_case + serde derive', async () => {
    vi.useFakeTimers()
    const w = mount(JsonCodegen)
    await w.find('[data-testid="codegen-target"]').setValue('rust')
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await nextTick()
    const out = w.find('[data-testid="codegen-output"]').text()
    expect(out).toContain('use serde::{Deserialize, Serialize};')
    expect(out).toContain('struct Root {')
  })

  it('非法 JSON 明确报错并清空输出', async () => {
    vi.useFakeTimers()
    const w = mount(JsonCodegen)
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await w.find('[data-testid="codegen-input"]').setValue('{')
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await nextTick()
    expect(w.text()).toContain('JSON')
    expect(w.find('[data-testid="codegen-output"]').exists()).toBe(false)
  })

  it('顶层非对象(数组)明确报错', async () => {
    vi.useFakeTimers()
    const w = mount(JsonCodegen)
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await w.find('[data-testid="codegen-input"]').setValue('[1,2]')
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await nextTick()
    expect(w.text()).toContain('顶层为对象')
  })

  it('输入实时重新生成(防抖窗口内不抢先)', async () => {
    vi.useFakeTimers()
    const w = mount(JsonCodegen)
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await w.find('[data-testid="codegen-input"]').setValue('{"num": 1.5}')
    await vi.advanceTimersByTimeAsync(DEBOUNCE - 1)
    expect(w.find('[data-testid="codegen-output"]').text()).toMatch(/val name: String/)
    await vi.advanceTimersByTimeAsync(1)
    await nextTick()
    expect(w.find('[data-testid="codegen-output"]').text()).toMatch(/val num: Double,/)
  })

  it('Ctrl+Enter 立即冲刷生成', async () => {
    vi.useFakeTimers()
    const w = mount(JsonCodegen)
    await w.find('[data-testid="codegen-input"]').setValue('{"key": null}')
    await w.find('[data-testid="codegen-input"]').trigger('keydown.ctrl.enter')
    await nextTick()
    expect(w.find('[data-testid="codegen-output"]').text()).toMatch(/val key: Any\?/)
  })

  it('输入与目标持久化', async () => {
    vi.useFakeTimers()
    const w = mount(JsonCodegen)
    await w.find('[data-testid="codegen-input"]').setValue('{"persisted": true}')
    await w.find('[data-testid="codegen-target"]').setValue('rust')
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await nextTick()
    const snapshot = localStorage.getItem('geekwaves-tools:codegen') ?? ''
    expect(snapshot).toContain('persisted')
    expect(snapshot).toContain('"targetId":"rust"')
  })
})
