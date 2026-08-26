// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import JsonFormatter from '../JsonFormatter.vue'

const textOf = (w: ReturnType<typeof mount>, sel: string) => {
  const el = w.find(sel)
  return el.exists() ? el.text() : '(absent)'
}

describe('JsonFormatter 组件(浏览器行为复现)', () => {
  it('JSON → YAML 转换点击后出结果', async () => {
    const w = mount(JsonFormatter)
    await w.find('textarea').setValue('{"a":1,"b":"x"}')
    const btn = w.findAll('button').find((b) => b.text().includes('JSON →'))
    expect(btn).toBeTruthy()
    await btn!.trigger('click')
    await w.vm.$nextTick()
    console.log('[forward] error:', textOf(w, '.text-error'), '| output:', textOf(w, 'pre').slice(0, 40))
    expect(textOf(w, 'pre')).toContain('a: 1')
  })

  it('反向 YAML → JSON', async () => {
    const w = mount(JsonFormatter)
    await w.find('textarea').setValue('a: 1\nb: x\n')
    const back = w.findAll('button').find((b) => b.text() === '←')
    expect((back!.element as HTMLButtonElement).disabled).toBe(false)
    await back!.trigger('click')
    const btn = w.findAll('button').find((b) => b.text().includes('→ JSON'))
    await btn!.trigger('click')
    await w.vm.$nextTick()
    console.log('[reverse] error:', textOf(w, '.text-error'), '| output:', textOf(w, 'pre').slice(0, 40))
    expect(JSON.parse(textOf(w, 'pre'))).toEqual({ a: 1, b: 'x' })
  })

  it('TS 单向:反向按钮被禁用', async () => {
    const w = mount(JsonFormatter)
    await w.find('select').setValue('ts')
    await w.vm.$nextTick()
    const back = w.findAll('button').find((b) => b.text() === '←')
    expect((back!.element as HTMLButtonElement).disabled).toBe(true)
  })

  it('Go 往返(组件路径)', async () => {
    const w = mount(JsonFormatter)
    await w.find('select').setValue('go')
    await w.find('textarea').setValue('{"a":1,"list":[1,2]}')
    const btn = w.findAll('button').find((b) => b.text().includes('JSON →'))
    await btn!.trigger('click')
    await w.vm.$nextTick()
    const go = textOf(w, 'pre')
    expect(go).toContain('map[string]interface{}')
    // 结果作为输入,反向
    await w.find('textarea').setValue(go)
    const back = w.findAll('button').find((b) => b.text() === '←')
    await back!.trigger('click')
    const btn2 = w.findAll('button').find((b) => b.text().includes('→ JSON'))
    await btn2!.trigger('click')
    await w.vm.$nextTick()
    expect(JSON.parse(textOf(w, 'pre'))).toEqual({ a: 1, list: [1, 2] })
  })
})
