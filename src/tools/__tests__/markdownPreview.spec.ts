// @vitest-environment jsdom
// DOMPurify 需要真实 DOM(净化器构造于 window 之上),故本套件显式使用 jsdom 环境。
import { describe, expect, it } from 'vitest'
import { renderMarkdownPreview } from '../markdownPreview'

/**
 * Markdown 预览纯函数层(FE10 T2 批次一):
 * 渲染管道复用 utils/richContent(marked GFM + DOMPurify 净化),
 * 本套件固定工具视角的契约:GFM 常见语法可渲染,XSS 向量必须被剥除。
 */
describe('renderMarkdownPreview:GFM 渲染', () => {
  it('空输入返回空串', () => {
    expect(renderMarkdownPreview('')).toBe('')
    expect(renderMarkdownPreview('   \n  ')).toBe('')
  })

  it('标题与加粗渲染为 HTML', () => {
    const html = renderMarkdownPreview('# Hello\n\n**bold** world')
    expect(html).toContain('<h1')
    expect(html).toContain('<strong>bold</strong>')
  })

  it('表格(GFM)渲染为 table', () => {
    const html = renderMarkdownPreview('| a | b |\n| --- | --- |\n| 1 | 2 |')
    expect(html).toContain('<table>')
    expect(html).toContain('<td>1</td>')
  })

  it('任务列表(GFM)渲染为 checkbox', () => {
    const html = renderMarkdownPreview('- [x] 已完成\n- [ ] 待办')
    expect(html).toContain('type="checkbox"')
    expect(html).toContain('checked')
  })

  it('删除线(GFM)渲染为 del', () => {
    expect(renderMarkdownPreview('~~作废~~')).toContain('<del>作废</del>')
  })
})

describe('renderMarkdownPreview:XSS 净化(v-html 唯一数据源)', () => {
  it('script 标签被剥除', () => {
    const html = renderMarkdownPreview('<script>alert(1)</script>正文')
    expect(html).not.toContain('<script')
    expect(html).toContain('正文')
  })

  it('onerror 等事件属性被剥除', () => {
    const html = renderMarkdownPreview('<img src=x onerror="alert(1)">')
    expect(html).not.toContain('onerror')
  })

  it('javascript: 链接被剥除', () => {
    const html = renderMarkdownPreview('[点我](javascript:alert(1))')
    expect(html).not.toContain('javascript:')
  })

  it('正常外链保留且补安全属性(target=_blank + noopener)', () => {
    const html = renderMarkdownPreview('[GeekWaves](https://example.com)')
    expect(html).toContain('href="https://example.com"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
  })
})
