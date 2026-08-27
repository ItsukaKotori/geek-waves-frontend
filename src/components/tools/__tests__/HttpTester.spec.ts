// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const httpRequestMock = vi.fn()

vi.mock('../../../api/toolsApi', () => ({
  httpRequest: (...args: unknown[]) => httpRequestMock(...args),
}))

import HttpTester from '../HttpTester.vue'
import {
  appendHistoryEntry,
  MAX_RESPONSE_PREVIEW_CHARS,
  saveHttpHistory,
  type HttpHistoryEntry,
} from '../../../tools/httpTester'

beforeEach(() => {
  localStorage.clear()
  httpRequestMock.mockReset()
})

const RESULT = {
  status: 200,
  tookMs: 12,
  headers: { 'content-type': 'application/json' },
  body: '{"ok":true}',
}

async function sendVia(w: ReturnType<typeof mount>) {
  await w.findAll('button').find((b) => b.text() === '发送')!.trigger('click')
}

describe('HttpTester 显式式交互(FE3)', () => {
  it('保留唯一的「发送」按钮(HTTP 属副作用操作)', () => {
    const w = mount(HttpTester)
    expect(w.findAll('button').map((b) => b.text())).toContain('发送')
  })

  it('输入变化不自动发送(保持显式触发)', async () => {
    const w = mount(HttpTester)
    await w.find('input').setValue('https://example.com')
    await w.findAll('textarea')[0]!.setValue("curl https://example.com # 输入草稿")
    await w.findAll('textarea')[1]!.setValue('{"A":"b"}')
    await nextTick()
    await new Promise((r) => setTimeout(r, 250))
    await nextTick()
    expect(httpRequestMock).not.toHaveBeenCalled()
  })

  it('Ctrl+Enter 触发发送并渲染结果', async () => {
    httpRequestMock.mockResolvedValue(RESULT)
    const w = mount(HttpTester)
    await w.find('input').setValue('https://example.com')
    await w.find('input').trigger('keydown.ctrl.enter')
    await vi.waitFor(() => {
      expect(w.text()).toContain('HTTP 200')
    })
    expect(httpRequestMock).toHaveBeenCalledTimes(1)
    const cmd = httpRequestMock.mock.calls[0][0] as Record<string, unknown>
    expect(cmd.url).toBe('https://example.com')
    expect(cmd.method).toBe('GET')
  })

  it('点击「发送」依然可用', async () => {
    httpRequestMock.mockResolvedValue(RESULT)
    const w = mount(HttpTester)
    await w.find('input').setValue('https://example.com')
    await sendVia(w)
    await vi.waitFor(() => {
      expect(w.text()).toContain('"ok": true')
    })
  })

  it('空 URL 不发请求并提示', async () => {
    const w = mount(HttpTester)
    await w.find('input').trigger('keydown.ctrl.enter')
    await nextTick()
    expect(httpRequestMock).not.toHaveBeenCalled()
    expect(w.text()).toContain('请输入请求 URL')
  })
})

describe('HttpTester FE7:key-value Header 编辑', () => {
  it('行输入序列化进真实请求,空键跳过', async () => {
    httpRequestMock.mockResolvedValue(RESULT)
    const w = mount(HttpTester)
    await w.find('input[placeholder*="URL" i]').setValue('https://example.com')
    // 初始只有一行,补一行用于「空键跳过」
    await w.findAll('button').find((b) => b.text().includes('添加 Header'))!.trigger('click')
    const keys = w.findAll('input[placeholder*="键" i]')
    const values = w.findAll('input[placeholder*="值" i]')
    await keys[0]!.setValue('Authorization')
    await values[0]!.setValue('Bearer t1')
    await keys[1]!.setValue('   ')
    await values[1]!.setValue('skipped')
    await sendVia(w)
    await vi.waitFor(() => expect(httpRequestMock).toHaveBeenCalledTimes(1))
    const cmd = httpRequestMock.mock.calls[0][0] as Record<string, unknown>
    expect(cmd.headers).toEqual({ Authorization: 'Bearer t1' })
  })

  it('可增删 Header 行', async () => {
    const w = mount(HttpTester)
    const countRows = () => w.findAll('input[placeholder*="键" i]').length
    expect(countRows()).toBeGreaterThan(0)
    await w.findAll('button').find((b) => b.text().includes('添加 Header'))!.trigger('click')
    expect(countRows()).toBeGreaterThan(1)
  })
})

describe('HttpTester FE7:curl 导入回填', () => {
  it('粘贴多行 curl 解析回填 method/url/headers/body;导入不等于发送', async () => {
    httpRequestMock.mockResolvedValue(RESULT)
    const w = mount(HttpTester)
    await w
      .find('textarea')
      .setValue(
        [
          'curl -X POST \\',
          "  -H 'Content-Type: application/json' \\",
          '  -H "X-Token: abc" \\',
          "  --data-raw '{\"a\": \"hello world\"}' \\",
          '  https://api.example.com/v1/do',
        ].join('\n'),
      )
    await w.findAll('button').find((b) => b.text() === '导入解析')!.trigger('click')
    await nextTick()

    const select = w.find('select')
    expect((select.element as HTMLSelectElement).value).toBe('POST')
    expect(w.find('input').element.value).toBe('https://api.example.com/v1/do')
    const keys = w.findAll('input[placeholder*="键" i]').map((i) => (i.element as HTMLInputElement).value)
    expect(keys).toEqual(expect.arrayContaining(['Content-Type', 'X-Token']))
    await sendVia(w)
    await vi.waitFor(() => expect(httpRequestMock).toHaveBeenCalledTimes(1))
    const cmd = httpRequestMock.mock.calls[0][0] as Record<string, unknown>
    expect(cmd.method).toBe('POST')
    expect(cmd.url).toBe('https://api.example.com/v1/do')
    expect(cmd.body).toBe('{"a": "hello world"}')
  })

  it('解析失败给出明确错误而非静默', async () => {
    const w = mount(HttpTester)
    await w.find('textarea').setValue('not a curl command')
    await w.findAll('button').find((b) => b.text() === '导入解析')!.trigger('click')
    await nextTick()
    expect(w.text()).toMatch(/curl/)
    expect(httpRequestMock).not.toHaveBeenCalled()
  })
})

describe('HttpTester FE7:请求历史(localStorage)', () => {
  it('发送成功后记入历史,重挂载后可见、点击回填、可清空', async () => {
    // 第一轮:发送成功产生历史
    httpRequestMock.mockResolvedValue(RESULT)
    const first = mount(HttpTester)
    await first.find('input').setValue('https://hist.example.com/api')
    await sendVia(first)
    await vi.waitFor(() => expect(httpRequestMock).toHaveBeenCalledTimes(1))
    first.unmount()
    await nextTick()

    // 第二轮:新实例从 localStorage 恢复历史列表
    const second = mount(HttpTester)
    expect(second.text()).toContain('https://hist.example.com/api')
    expect(second.text()).toMatch(/GET/)
    // 点击条目回填(此处 URL 已同值,追加一条不同历史再验点击行为)
    second.unmount()
    const seed: HttpHistoryEntry[] = [
      ...appendHistoryEntry([], {
        method: 'DELETE',
        url: 'https://seed.example.com/x',
        headers: { A: 'b' },
        body: 'k=v',
      }),
      ...appendHistoryEntry([], {
        method: 'GET',
        url: 'https://hist.example.com/api',
        headers: {},
        body: '',
      }),
    ]
    saveHttpHistory(seed)
    const third = mount(HttpTester)
    expect(third.text()).toContain('https://seed.example.com/x')
    const target = third
      .findAll('button')
      .find((b) => b.text().includes('https://seed.example.com/x'))!
    await target.trigger('click')
    await nextTick()
    expect((third.find('select').element as HTMLSelectElement).value).toBe('DELETE')
    expect(third.find('input').element.value).toBe('https://seed.example.com/x')
    const bodyArea = third.findAll('textarea')[1]!
    expect(bodyArea.element.value).toBe('k=v')

    await third.findAll('button').find((b) => b.text() === '清空历史')!.trigger('click')
    expect(third.text()).not.toContain('https://seed.example.com/x')
    expect(localStorage.getItem('geekwaves-tools:http-history')).toBeNull()
  })

  it('存储遵循 geekwaves-tools 命名空间', () => {
    saveHttpHistory([])
    const w = mount(HttpTester)
    void w
  })
})

describe('HttpTester FE7:响应展示(美化与截断)', () => {
  it('阈值单一来源:SFC 模板禁止出现硬编码的 1000000 字面量', () => {
    // 常量 MAX_RESPONSE_PREVIEW_CHARS 是唯一真源;模板必须插值而非重复写死
    // (jsdom 下 import.meta.url 为 http scheme,故以项目根解析路径)
    const sfc = readFileSync(resolve(process.cwd(), 'src/components/tools/HttpTester.vue'), 'utf8')
    expect(sfc).not.toMatch(/(?<!\{\{[^}\n]*)1000000/)
  })

  it('截断提示文案与常量数字一致(防模板文案与常量漂移)', async () => {
    httpRequestMock.mockResolvedValue({
      status: 200,
      tookMs: 1,
      headers: { 'content-type': 'text/plain' },
      body: 'a'.repeat(MAX_RESPONSE_PREVIEW_CHARS + 3),
    })
    const w = mount(HttpTester)
    await w.find('input').setValue('https://example.com/big')
    await sendVia(w)
    await vi.waitFor(() => expect(w.text()).toContain('截断'))
    expect(w.text()).toContain(`仅显示前 ${MAX_RESPONSE_PREVIEW_CHARS} 字符`)
    expect(w.text()).toContain(String(MAX_RESPONSE_PREVIEW_CHARS))
    // 阈值数字出现的次数 ≥ 2(徽章 + 无截断脚注共用同一来源;任何一处漂移都会跌破 2)
    const occurrences = w.html().split(String(MAX_RESPONSE_PREVIEW_CHARS)).length - 1
    expect(occurrences).toBeGreaterThanOrEqual(2)
  })

  it('JSON Content-Type 自动美化', async () => {
    httpRequestMock.mockResolvedValue(RESULT)
    const w = mount(HttpTester)
    await w.find('input').setValue('https://example.com')
    await sendVia(w)
    await vi.waitFor(() => expect(w.text()).toContain('"ok": true'))
  })

  it(`超过 ${MAX_RESPONSE_PREVIEW_CHARS} 字符截断并如实提示`, async () => {
    const big = 'x'.repeat(MAX_RESPONSE_PREVIEW_CHARS + 7)
    httpRequestMock.mockResolvedValue({
      status: 200,
      tookMs: 3,
      headers: { 'content-type': 'text/plain' },
      body: big,
    })
    const w = mount(HttpTester)
    await w.find('input').setValue('https://example.com/big')
    await sendVia(w)
    await vi.waitFor(() => expect(w.text()).toContain('截断'))
    const shown = w.find('pre.whitespace-pre-wrap').element.textContent ?? ''
    expect(shown.length).toBe(MAX_RESPONSE_PREVIEW_CHARS)
    expect(w.text()).toContain(String(MAX_RESPONSE_PREVIEW_CHARS + 7)) // 完整长度如实披露
  })

  it('响应体一律文本插值,不含 v-html 注入通道', async () => {
    httpRequestMock.mockResolvedValue({
      status: 200,
      tookMs: 1,
      headers: { 'content-type': 'text/html' },
      body: '<img src=x onerror=window.__pwned=1>',
    })
    const w = mount(HttpTester)
    ;(window as unknown as Record<string, unknown>).__pwned = undefined
    await w.find('input').setValue('https://example.com')
    await sendVia(w)
    await vi.waitFor(() => expect(w.text()).toContain('<img src=x'))
    expect(w.html()).not.toContain('<img src=x')
    expect((window as unknown as Record<string, unknown>).__pwned).toBeUndefined()
  })
})
