// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { looksLikeHtml, renderMarkdown, sanitizeHtml } from '../richContent'

describe('looksLikeHtml', () => {
  it('识别以 < 开头的 HTML 片段(含空白前缀)', () => {
    expect(looksLikeHtml('<p>hello</p>')).toBe(true)
    expect(looksLikeHtml('  <div>x</div>')).toBe(true)
    expect(looksLikeHtml('<img src="x"><br>text')).toBe(true)
  })

  it('识别正文任意位置出现的块级标签(含闭合、大小写不敏感)', () => {
    expect(looksLikeHtml('前置文本 <h2>标题</h2> 后续')).toBe(true)
    expect(looksLikeHtml('release notes</ul>')).toBe(true)
    expect(looksLikeHtml('<DIV>x</DIV>')).toBe(true)
    expect(looksLikeHtml('表格 <table><tr><td>1</td></tr></table>')).toBe(true)
  })

  it('framework markdown 与纯文本不被误判(假样例)', () => {
    expect(looksLikeHtml("## What's Changed\n- Bump **spring-batch** to `5.1.1`\n* minor fix")).toBe(false)
    expect(looksLikeHtml('> 引用块\n正文段落')).toBe(false)
    expect(looksLikeHtml('比较运算 1 < 2 且 p > 0 的普通文本')).toBe(false)
    expect(looksLikeHtml('纯文本摘要,不含任何标签')).toBe(false)
    expect(looksLikeHtml('')).toBe(false)
    expect(looksLikeHtml('   ')).toBe(false)
  })
})

describe('renderMarkdown', () => {
  it('渲染标题与加粗', () => {
    const html = renderMarkdown('## h\n**b**')
    expect(html).toContain('<h2>h</h2>')
    expect(html).toContain('<strong>b</strong>')
  })

  it('breaks 开启时单换行转为 <br>', () => {
    const html = renderMarkdown('第一行\n第二行')
    expect(html).toContain('<br')
  })

  it('GFM 表格渲染为 table', () => {
    const html = renderMarkdown('| a | b |\n| --- | --- |\n| 1 | 2 |')
    expect(html).toContain('<table')
  })

  it('GitHub 表情短码(:warning: 等)被转换为 emoji', () => {
    const html = renderMarkdown(':warning: Attention Required')
    expect(html).toContain('⚠️')
    expect(html).not.toContain(':warning:')
  })

  it('多个表情短码在渲染时一并转换', () => {
    const html = renderMarkdown(':lady_beetle: Bug Fixes')
    expect(html).toContain('🐞')
    expect(html).not.toContain(':lady_beetle:')
  })

  it('未识别的短码保持原样,不影响其余内容', () => {
    const html = renderMarkdown(':unknown_code: text')
    expect(html).toContain('text')
  })
})

describe('sanitizeHtml', () => {
  it('剥离 script 标签与事件属性,保留安全内容', () => {
    const out = sanitizeHtml(
      '<p onclick="alert(1)">ok</p><script>evil()</script><img src="x" onerror="evil()">',
    )
    expect(out).toContain('<p')
    expect(out).toContain('ok')
    expect(out).not.toContain('<script')
    expect(out).not.toContain('onclick')
    expect(out).not.toContain('onerror')
  })

  it('a[href] 统一追加 target="_blank" 与 rel="noopener noreferrer"', () => {
    const out = sanitizeHtml('<p><a href="https://example.com">link</a></p>')
    expect(out).toContain('href="https://example.com"')
    expect(out).toContain('target="_blank"')
    expect(out).toContain('rel="noopener noreferrer"')
  })

  it('空字符串原样返回', () => {
    expect(sanitizeHtml('')).toBe('')
  })
})
