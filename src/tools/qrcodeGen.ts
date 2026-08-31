/**
 * 二维码生成:文本/URL → PNG dataURL + SVG 字符串(qrcode 库封装)。
 * 纠错级别 L(7%)/M(15%)/Q(25%)/H(30%),尺寸做边界收敛,全部本地渲染。
 */
import QRCode from 'qrcode'

export type QrEcc = 'L' | 'M' | 'Q' | 'H'

export interface QrOptions {
  ecc: QrEcc
  /** 逻辑像素边长,收敛到 [128, 1024] */
  size: number
}

export interface QrResult {
  pngDataUrl: string
  svgString: string
}

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))

export async function generateQr(text: string, opts: QrOptions): Promise<QrResult> {
  const content = text.trim()
  if (!content) throw new Error('请输入要编码的内容')
  const common = {
    errorCorrectionLevel: opts.ecc,
    width: clamp(Math.round(opts.size) || 320, 128, 1024),
    margin: 2,
  }
  try {
    const [pngDataUrl, svgString] = await Promise.all([
      QRCode.toDataURL(content, common),
      QRCode.toString(content, { ...common, type: 'svg' }),
    ])
    return { pngDataUrl, svgString }
  } catch (e) {
    const raw = (e as Error).message || ''
    if (/too long|big|exceed/i.test(raw)) {
      throw new Error('内容过长:该纠错级别下超出二维码容量,请缩短内容或改用 L 级别')
    }
    throw new Error(raw || '二维码生成失败')
  }
}
