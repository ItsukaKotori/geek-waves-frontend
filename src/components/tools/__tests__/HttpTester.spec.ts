// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

const httpRequestMock = vi.fn()

vi.mock('../../../api/toolsApi', () => ({
  httpRequest: (...args: unknown[]) => httpRequestMock(...args),
}))

import HttpTester from '../HttpTester.vue'

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

describe('HttpTester 显式式交互(FE3)', () => {
  it('保留唯一的「发送」按钮(HTTP 属副作用操作)', () => {
    const w = mount(HttpTester)
    expect(w.findAll('button').map((b) => b.text())).toContain('发送')
  })

  it('输入变化不自动发送(保持显式触发)', async () => {
    const w = mount(HttpTester)
    await w.find('input').setValue('https://example.com')
    await w.findAll('textarea')[0].setValue('{"A":"b"}')
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
    await w.findAll('button').find((b) => b.text() === '发送')!.trigger('click')
    await vi.waitFor(() => {
      expect(w.text()).toContain('"ok":true')
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
