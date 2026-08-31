// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { webcrypto } from 'node:crypto'
import CryptoTool from '../CryptoTool.vue'
import { PRIV_PEM, PUB_PEM } from '../../../tools/__tests__/cryptoFixtures'

/** jsdom 环境缺 Web Crypto,统一替换为 Node 实现 */
vi.stubGlobal('crypto', webcrypto)


beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const input = (w: ReturnType<typeof mount>, label: string) => w.find(`input[aria-label="${label}"]`)
const textarea = (w: ReturnType<typeof mount>, label: string) => w.find(`textarea[aria-label="${label}"]`)
const btn = (w: ReturnType<typeof mount>, text: string) =>
  w.findAll('button').find((b) => b.text().includes(text))

describe('CryptoTool 三区渲染与密钥生成', () => {
  it('三区标签齐全', () => {
    const w = mount(CryptoTool)
    for (const label of ['密钥生成', 'AES', 'RSA']) {
      expect(w.text()).toContain(label)
    }
  })

  it('生成 AES-256 密钥:输出 44 字符 base64 并可一键回填', async () => {
    vi.useFakeTimers()
    const w = mount(CryptoTool)
    await w.find('select').setValue('aes-256')
    await btn(w, '生成')!.trigger('click')
    await vi.advanceTimersByTimeAsync(0)
    const out = w.find('[data-gen="aes-key"]').text()
    expect(out).toMatch(/^[A-Za-z0-9+/]{43}=/)
    await btn(w, '用于 AES')!.trigger('click')
    expect((input(w, 'AES 密钥').element as HTMLInputElement).value).toBe(out)
    vi.useRealTimers()
  })

  it('生成 RSA-2048 密钥对:PEM 形式可切换显示', async () => {
    vi.useFakeTimers()
    const w = mount(CryptoTool)
    await w.find('select').setValue('rsa-2048')
    await btn(w, '生成')!.trigger('click')
    await vi.waitFor(() => {
      expect(w.text()).toContain('-----BEGIN PUBLIC KEY-----')
      expect(w.text()).toContain('-----BEGIN PRIVATE KEY-----')
    })
    vi.useRealTimers()
  })
})

describe('AES 加解密闭环(实时式)', () => {
  const KEY = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=' // 32 字节

  it('明文 → 密文,回填解密卡复原', async () => {
    const w = mount(CryptoTool)
    await input(w, 'AES 密钥').setValue(KEY)
    await textarea(w, '加密明文').setValue('GeekWaves 闭环')
    await vi.waitFor(() => {
      expect(w.find('[data-aes="cipher"]').text()).toMatch(/^[A-Za-z0-9+/=]+$/)
    })
    const cipher = w.find('[data-aes="cipher"]').text()
    const iv = w.find('[data-aes="iv"]').text()
    await textarea(w, '解密密文').setValue(cipher)
    await input(w, '解密 IV').setValue(iv)
    await vi.waitFor(() => {
      expect(w.find('[data-aes="plain"]').text()).toBe('GeekWaves 闭环')
    })
  })

  it('GCM 篡改密文 → 解密卡行内报错', async () => {
    const w = mount(CryptoTool)
    await input(w, 'AES 密钥').setValue(KEY)
    await textarea(w, '加密明文').setValue('auth')
    await vi.waitFor(() => {
      expect(w.find('[data-aes="cipher"]').text()).not.toBe('')
    })
    const cipher = Buffer.from(w.find('[data-aes="cipher"]').text(), 'base64')
    cipher[0]! ^= 0xff
    await textarea(w, '解密密文').setValue(cipher.toString('base64'))
    await input(w, '解密 IV').setValue(w.find('[data-aes="iv"]').text())
    await vi.waitFor(() => {
      expect(w.text()).toContain('解密失败')
    })
  })

  it('模式切换到 CBC 仍可往返', async () => {
    const w = mount(CryptoTool)
    await btn(w, 'CBC')!.trigger('click')
    await input(w, 'AES 密钥').setValue(KEY)
    await textarea(w, '加密明文').setValue('legacy')
    await vi.waitFor(() => {
      expect(w.find('[data-aes="cipher"]').text()).not.toBe('')
    })
    await textarea(w, '解密密文').setValue(w.find('[data-aes="cipher"]').text())
    await input(w, '解密 IV').setValue(w.find('[data-aes="iv"]').text())
    await vi.waitFor(() => {
      expect(w.find('[data-aes="plain"]').text()).toBe('legacy')
    })
  })
})

describe('RSA 四操作(PEM 密钥)', () => {
  it('加密 → 解密往返', async () => {
    const w = mount(CryptoTool)
    await textarea(w, 'RSA 公钥').setValue(PUB_PEM)
    await textarea(w, 'RSA 私钥').setValue(PRIV_PEM)
    await textarea(w, 'RSA 输入').setValue('rsa roundtrip')
    await vi.waitFor(() => {
      expect(w.find('[data-rsa="out"]').text()).toMatch(/^[A-Za-z0-9+/=]{100,}/)
    })
    const cipher = w.find('[data-rsa="out"]').text()
    await btn(w, '解密')!.trigger('click')
    // 解密页签下输入框语义为密文
    await textarea(w, 'RSA 输入').setValue(cipher)
    await vi.waitFor(() => {
      expect(w.find('[data-rsa="out"]').text()).toBe('rsa roundtrip')
    })
  })

  it('签名 → 验签通过;验签输出真值判定', async () => {
    const w = mount(CryptoTool)
    await textarea(w, 'RSA 公钥').setValue(PUB_PEM)
    await textarea(w, 'RSA 私钥').setValue(PRIV_PEM)
    await textarea(w, 'RSA 输入').setValue('sign me')
    await btn(w, '签名')!.trigger('click')
    await vi.waitFor(() => {
      expect(w.find('[data-rsa="out"]').text()).toMatch(/^[A-Za-z0-9+/=]{100,}/)
    })
    const sig = w.find('[data-rsa="out"]').text()
    await btn(w, '验签')!.trigger('click')
    await textarea(w, '待验签名').setValue(sig)
    await vi.waitFor(() => {
      expect(w.find('[data-rsa="verify"]').text()).toContain('true')
    })
  })

  it('私钥不持久化:重挂载后为空', async () => {
    const w = mount(CryptoTool)
    await textarea(w, 'RSA 私钥').setValue(PRIV_PEM)
    w.unmount()
    const w2 = mount(CryptoTool)
    expect((textarea(w2, 'RSA 私钥').element as HTMLTextAreaElement).value).toBe('')
  })
})
