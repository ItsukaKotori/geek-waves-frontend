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
    // 视图切换 ×4(转换/美化/压缩/树)+ 方向 →/← = 6
    expect(w.findAll('button')).toHaveLength(6)
    for (const label of ['转换视图', '美化视图', '压缩视图', '树视图']) {
      expect(labels, label).toContain(label)
    }
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

describe('JsonFormatter FE6 补全(压缩/JSONPath/折叠树)', () => {
  async function setInputAndRun(
    w: ReturnType<typeof mount>,
    v: string,
  ): Promise<void> {
    await w.find('textarea').setValue(v)
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await nextTick()
  }

  const clickView = async (w: ReturnType<typeof mount>, label: string): Promise<void> => {
    const tab = w.findAll('.tab').find((t) => t.text() === label)
    await tab!.trigger('click')
    await w.vm.$nextTick()
  }

  it('压缩视图实时输出单行 minify', async () => {
    vi.useFakeTimers()
    const w = mount(JsonFormatter)
    await clickView(w, '压缩视图')
    await setInputAndRun(w, '{ "a": 1,\n "b": [1, 2] }')
    expect(preText(w)).toBe('{"a":1,"b":[1,2]}')
  })

  it('JSONPath 查询实时命中(* 通配与属性链子集)', async () => {
    vi.useFakeTimers()
    const w = mount(JsonFormatter)
    await setInputAndRun(w, '{"book":[{"author":"A","price":8},{"author":"B","price":12}]}')
    await w.find('input.jsonpath-input').setValue('$.book[*].author')
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await nextTick()
    const results = w.find('.jsonpath-results').text()
    expect(results).toContain('"A"')
    expect(results).toContain('"B"')
    expect(w.text()).toContain('命中 2 处')
  })

  it('JSONPath 表达式非法时实时报错(不以 $ 开头 / 不支持的过滤语法)', async () => {
    vi.useFakeTimers()
    const w = mount(JsonFormatter)
    await setInputAndRun(w, '{"a":1}')
    await w.find('input.jsonpath-input').setValue('a.b')
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await nextTick()
    expect(w.text()).toMatch(/必须以 \$ 开头/)
    await w.find('input.jsonpath-input').setValue('$.a[?(@.x>1)]')
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await nextTick()
    expect(w.text()).toMatch(/不支持/)
    // 清空表达式恢复空闲态
    await w.find('input.jsonpath-input').setValue('')
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await nextTick()
    expect(w.find('.jsonpath-results').exists()).toBe(false)
  })

  it('树视图默认展开浅层、深层自动折叠', async () => {
    vi.useFakeTimers()
    const w = mount(JsonFormatter)
    await clickView(w, '树视图')
    await setInputAndRun(w, '{"obj":{"deep":{"leaf":"MAGIC"}},"s":"v"}')
    const pane = w.find('.tree-pane')
    expect(pane.exists()).toBe(true)
    expect(pane.text()).toContain('$')
    expect(pane.text()).toContain('obj')
    expect(pane.text()).toContain('deep')
    // 深层(默认展开深度之外)初始不可见
    expect(pane.text()).not.toContain('MAGIC')
  })

  it('树视图节点可手动折叠/展开(逐层展开至叶子可见,折叠根即全部隐藏)', async () => {
    vi.useFakeTimers()
    const w = mount(JsonFormatter)
    await clickView(w, '树视图')
    await setInputAndRun(w, '{"obj":{"deep":{"leaf":"MAGIC"}}}')
    let pane = w.find('.tree-pane')
    // 每轮点击 DOM 中最后一个展开钮(最深可见层),直至目标叶子出现
    for (let i = 0; i < 6 && !pane.text().includes('MAGIC'); i++) {
      const toggles = pane.findAll('button.tree-toggle')
      if (!toggles.length) break
      await toggles[toggles.length - 1]!.trigger('click')
      pane = w.find('.tree-pane')
    }
    expect(pane.text()).toContain('MAGIC')
    // 折叠根节点:整棵子树从行列表消失
    const rootToggle = pane.findAll('button.tree-toggle')[0]!
    await rootToggle.trigger('click')
    pane = w.find('.tree-pane')
    expect(pane.text()).not.toContain('MAGIC')
    expect(pane.text()).not.toContain('obj')
  })
})
