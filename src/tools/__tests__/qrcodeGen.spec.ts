// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { generateQr, type QrEcc } from '../qrcodeGen'

describe('generateQr 二维码生成', () => {
  it('产出 PNG dataURL 与 SVG 字符串', async () => {
    const r = await generateQr('https://tools.lylinux.net', { ecc: 'M', size: 320 })
    expect(r.pngDataUrl).toMatch(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/)
    expect(r.svgString).toContain('<svg')
    expect(r.svgString).toContain('</svg>')
  })

  it('纠错级别影响矩阵:同一输入不同级别产出不同', async () => {
    const lm = await generateQr('GeekWaves', { ecc: 'L', size: 256 })
    const hm = await generateQr('GeekWaves', { ecc: 'H', size: 256 })
    expect(lm.pngDataUrl).not.toBe(hm.pngDataUrl)
  })

  it('尺寸选项透传:不同 size 的 PNG 不同', async () => {
    const a = await generateQr('size', { ecc: 'M', size: 200 })
    const b = await generateQr('size', { ecc: 'M', size: 400 })
    expect(a.pngDataUrl).not.toBe(b.pngDataUrl)
  })

  it('同一输入确定性:两次生成一致', async () => {
    const text = '稳定输出'
    expect(await generateQr(text, { ecc: 'Q', size: 256 })).toEqual(
      await generateQr(text, { ecc: 'Q', size: 256 }),
    )
  })

  it('空内容报错', async () => {
    await expect(generateQr('   ', { ecc: 'M', size: 256 })).rejects.toThrow(/内容/)
  })

  it('超长内容给友好错误(qrcode 原始报错转译)', async () => {
    await expect(generateQr('x'.repeat(4000), { ecc: 'H', size: 256 })).rejects.toThrow(/过长|数据量/)
  })

  it('中文与 URL 内容均可编码', async () => {
    for (const text of ['你好,世界', 'https://example.com/路径?q=中文']) {
      const r = await generateQr(text, { ecc: 'M', size: 256 })
      expect(r.pngDataUrl.length).toBeGreaterThan(100)
    }
  })
})

describe('纠错级别取值域', () => {
  it('L/M/Q/H 均可用', async () => {
    for (const ecc of ['L', 'M', 'Q', 'H'] as QrEcc[]) {
      const r = await generateQr('ecc', { ecc, size: 256 })
      expect(r.svgString).toContain('<svg')
    }
  })
})
