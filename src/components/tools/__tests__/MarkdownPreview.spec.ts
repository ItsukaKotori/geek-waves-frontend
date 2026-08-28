// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import MarkdownPreview from '../MarkdownPreview.vue'

/**
 * Markdown 预览组件交互(实时范式:输入即渲染,150ms 防抖,无计算按钮):
 * 关键路径 = 防抖窗口内不抢先渲染 / 窗口结束渲染 / XSS 向量不落进 v-html /
 * Ctrl+Enter 立即冲刷 / useToolState 持久化恢复。
 */

const DEBOUNCE = 150

beforeEach(() => {
  localStorage.clear()
})

describe('MarkdownPreview 实时渲染', () => {
  it('输入停止 150ms 后渲染,期间不抢先', async () => {
    vi.useFakeTimers()
    const w = mount(MarkdownPreview)
    await w.find('[data-testid="md-input"]').setValue('# 标题一\n\n正文**加粗**')
    await vi.advanceTimersByTimeAsync(DEBOUNCE - 1)
    expect(w.find('[data-testid="md-preview"]').html()).not.toContain('<h1')
    await vi.advanceTimersByTimeAsync(1)
    await nextTick()
    expect(w.find('[data-testid="md-preview"]').html()).toContain('<h1')
    expect(w.find('[data-testid="md-preview"]').html()).toContain('<strong>加粗</strong>')
  })

  it('清空输入后预览复位为空', async () => {
    vi.useFakeTimers()
    const w = mount(MarkdownPreview)
    const input = w.find('[data-testid="md-input"]')
    await input.setValue('**x**')
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    expect(w.find('[data-testid="md-preview"]').html()).toContain('<strong>')
    await input.setValue('')
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    expect(w.find('[data-testid="md-preview"]').text()).toBe('')
  })

  it('GFM 表格进入预览(与 marked 默认一致)', async () => {
    vi.useFakeTimers()
    const w = mount(MarkdownPreview)
    await w.find('[data-testid="md-input"]').setValue('| a | b |\n| --- | --- |\n| 1 | 2 |')
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    expect(w.find('[data-testid="md-preview"]').find('table').exists()).toBe(true)
  })

  it('脚本与事件属性被 DOMPurify 剥除,v-html 仅接收净化后 HTML', async () => {
    vi.useFakeTimers()
    const w = mount(MarkdownPreview)
    await w.find('[data-testid="md-input"]').setValue('<img src=x onerror="window.__pwned=1"><script>window.__pwned=1</script>')
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    const preview = w.find('[data-testid="md-preview"]').element as HTMLElement
    expect((window as { __pwned?: number }).__pwned).toBeUndefined()
    expect(preview.querySelector('img[onerror]')).toBeNull()
    expect(preview.querySelector('script')).toBeNull()
    expect(preview.querySelector('img')).not.toBeNull()
  })

  it('Ctrl+Enter 立即冲刷渲染(不等防抖)', async () => {
    vi.useFakeTimers()
    const w = mount(MarkdownPreview)
    await w.find('[data-testid="md-input"]').setValue('## 冲刷目标')
    await w.find('[data-testid="md-input"]').trigger('keydown.ctrl.enter')
    await nextTick()
    expect(w.find('[data-testid="md-preview"]').html()).toContain('<h2')
  })

  it('刷新后经 useToolState 恢复输入并自动重渲染', async () => {
    localStorage.setItem('geekwaves-tools:markdown', JSON.stringify({ input: '# 持久化恢复' }))
    vi.useFakeTimers()
    const w = mount(MarkdownPreview)
    expect((w.find('[data-testid="md-input"]').element as HTMLTextAreaElement).value).toBe('# 持久化恢复')
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await nextTick()
    expect(w.find('[data-testid="md-preview"]').html()).toContain('<h1')
  })
})
