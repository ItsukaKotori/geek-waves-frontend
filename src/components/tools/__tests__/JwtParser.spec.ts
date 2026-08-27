// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import JwtParser from '../JwtParser.vue'
import { base64Encode } from '../../../tools/encodeDecode'

const DEBOUNCE = 150

function b64url(obj: unknown): string {
  return base64Encode(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

/** 固定 exp 的样例 token(未来/过去,断言与时钟弱耦合) */
function makeToken(payload: Record<string, unknown>): string {
  return makeHeaderToken('HS256', payload)
}

/** 指定 header.alg 的样例 token */
function makeHeaderToken(alg: string, payload: Record<string, unknown> = { sub: 'u' }): string {
  return `${b64url({ alg, typ: 'JWT' })}.${b64url(payload)}.sig`
}

beforeEach(() => {
  localStorage.clear()
})

describe('JwtParser 实时式交互(FE3)', () => {
  it('token 输入 ≤150ms 内解析出 Header/Payload,期间无抢先结果', async () => {
    vi.useFakeTimers()
    const w = mount(JwtParser)
    const token = makeToken({ sub: 'u1', name: 'GeekWaves' })
    await w.find('textarea').setValue(token)
    await vi.advanceTimersByTimeAsync(DEBOUNCE - 1)
    await nextTick()
    expect(w.text()).not.toContain('Payload')
    await vi.advanceTimersByTimeAsync(1)
    await nextTick()
    expect(w.text()).toContain('GeekWaves')
    expect(w.text()).toContain('HS256')
  })

  it('不再保留「解析」按钮', () => {
    const w = mount(JwtParser)
    expect(w.findAll('button').map((b) => b.text())).not.toContain('解析')
  })

  it('非法 token 实时报错', async () => {
    vi.useFakeTimers()
    const w = mount(JwtParser)
    await w.find('textarea').setValue('not-a-jwt')
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await nextTick()
    expect(w.text()).toContain('Invalid JWT')
  })

  it('过期徽章随输入实时切换(未来/过去 exp)', async () => {
    vi.useFakeTimers()
    const w = mount(JwtParser)
    await w.find('textarea').setValue(makeToken({ exp: 4102444800 })) // 2100-01-01,远期未来
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await nextTick()
    expect(w.text()).toContain('未过期')
    await w.find('textarea').setValue(makeToken({ exp: 1000000000 })) // 2001 年,已过期
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await nextTick()
    expect(w.text()).toContain('已过期')
  })

  it('Ctrl+Enter 立即冲刷解析(不等防抖)', async () => {
    vi.useFakeTimers()
    const w = mount(JwtParser)
    await w.find('textarea').setValue(makeToken({ sub: 'u2' }))
    await w.find('textarea').trigger('keydown.ctrl.enter')
    await nextTick()
    expect(w.text()).toContain('u2')
  })
})

describe('JwtParser alg 安全徽章与人性化时间(FE6)', () => {
  it('安全算法显示安全徽章,且始终提示未验签', async () => {
    vi.useFakeTimers()
    const w = mount(JwtParser)
    await w.find('textarea').setValue(makeToken({ sub: 'u1' }))
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await nextTick()
    expect(w.text()).toContain('安全算法 HS256')
    expect(w.text()).toContain('未验签')
  })

  it('none 算法给危险级徽章(含空签名段)', async () => {
    vi.useFakeTimers()
    const w = mount(JwtParser)
    await w.find('textarea').setValue(`${b64url({ alg: 'none', typ: 'JWT' })}.${b64url({ sub: 'u' })}.`)
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await nextTick()
    expect(w.text()).toContain('危险算法 none')
    expect(w.text()).toContain('签名为空')
  })

  it('大小写不符或未知算法降级为可疑徽章', async () => {
    vi.useFakeTimers()
    const w = mount(JwtParser)
    await w.find('textarea').setValue(makeHeaderToken('hs256'))
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await nextTick()
    expect(w.text()).toContain('可疑算法')
    await w.find('textarea').setValue(makeHeaderToken('FAKE999'))
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await nextTick()
    expect(w.text()).toContain('可疑算法 FAKE999')
  })

  it('iat/exp 人性化双显:绝对 ISO + 相对时间', async () => {
    vi.useFakeTimers()
    const w = mount(JwtParser)
    // 固定过去时刻(2023-11-14T22:13:20Z),相对时间恒为「…前」
    await w.find('textarea').setValue(makeToken({ iat: 1700000000, exp: 4102444800 }))
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await nextTick()
    expect(w.text()).toContain('2023-11-14T22:13:20Z')
    expect(w.text()).toMatch(/iat[^\n]*前/)
    expect(w.text()).toContain('2100-01-01T00:00:00Z')
    expect(w.text()).toMatch(/exp[^\n]*后/)
  })
})
