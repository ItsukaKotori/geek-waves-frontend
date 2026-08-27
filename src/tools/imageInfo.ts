import { base64DecodeBytes } from './encodeDecode'

/**
 * dataURL / 图片二进制嗅探(纯函数,零 DOM 依赖,可测):
 * 预览缩略图交给组件渲染 <img>,尺寸信息在解码层就地算出。
 */

export interface ParsedDataUrl {
  mime: string
  bytes: Uint8Array
}

const DATA_URL_RE = /^data:([^;,]*)(;[^;,]*)*,([\s\S]*)$/

/** 解析 dataURL;mime/负载异常返回 null(base64 负载损坏也按 null 处理) */
export function parseDataUrl(input: string): ParsedDataUrl | null {
  const m = input.match(DATA_URL_RE)
  if (!m) return null
  const mime = m[1]
  const isBase64 = /;base64/i.test(m[2] ?? '')
  try {
    const bytes = isBase64 ? base64DecodeBytes(m[3]) : new TextEncoder().encode(m[3])
    return { mime: mime || 'application/octet-stream', bytes }
  } catch {
    return null
  }
}

export interface ImageSize {
  width: number
  height: number
}

const be16 = (b: Uint8Array, i: number): number => (b[i] << 8) | b[i + 1]
const le16 = (b: Uint8Array, i: number): number => b[i] | (b[i + 1] << 8)

function sniffPng(b: Uint8Array): ImageSize | null {
  if (b.length < 24) return null
  if (!(b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47)) return null
  const w = ((b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19]) >>> 0
  const h = ((b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23]) >>> 0
  return positive(w, h)
}

function sniffGif(b: Uint8Array): ImageSize | null {
  if (b.length < 10 || b[0] !== 0x47 || b[1] !== 0x49 || b[2] !== 0x46) return null
  return positive(le16(b, 6), le16(b, 8))
}

function sniffBmp(b: Uint8Array): ImageSize | null {
  if (b.length < 26 || b[0] !== 0x42 || b[1] !== 0x4d) return null
  const h = b[22] | (b[23] << 8) | (b[24] << 16) | (b[25] << 24)
  return positive(b[18] | (b[19] << 8) | (b[20] << 16) | (b[21] << 24), Math.abs(h))
}

function sniffWebp(b: Uint8Array): ImageSize | null {
  if (b.length < 30) return null
  if (
    !(b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50)
  ) {
    return null
  }
  // VP8L(lossless):payload 以 0x2f 开头,随后 14bit 宽-1、14bit 高-1
  if (b[15] === 0x4c && b[12 + 8] === 0x2f) {
    const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24)
    return positive((bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1)
  }
  // VP8(keyframe):帧头 9D 01 2A 之后 14bit 宽、14bit 高
  if (b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a) {
    return positive(le16(b, 26) & 0x3fff, le16(b, 28) & 0x3fff)
  }
  return null
}

/** JPEG 扫描 SOFn 段(C0-CF 除 C4/C8/CC),允许前置 EXIF 等任意段 */
function sniffJpeg(b: Uint8Array): ImageSize | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null
  let i = 2
  while (i + 3 < b.length) {
    if (b[i] !== 0xff) return null
    const marker = b[i + 1]
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2
      continue
    }
    const len = be16(b, i + 2)
    const isSof =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
    if (isSof) {
      if (i + 8 >= b.length) return null
      // SOF 内先高度后宽度
      return positive(be16(b, i + 7), be16(b, i + 5))
    }
    i += 2 + len
  }
  return null
}

const positive = (w: number, h: number): ImageSize | null =>
  w > 0 && h > 0 && Number.isFinite(w) && Number.isFinite(h) ? { width: w, height: h } : null

/**
 * 尽力嗅探图片二进制尺寸(PNG/JPEG/GIF/BMP/WEBP):
 * 无法识别或字段非法时返回 null(调用方显示「未知尺寸」,不阻塞预览)。
 */
export function sniffImageSize(bytes: Uint8Array): ImageSize | null {
  if (bytes.length === 0) return null
  for (const sniffer of [sniffPng, sniffGif, sniffBmp, sniffJpeg, sniffWebp]) {
    const size = sniffer(bytes)
    if (size) return size
  }
  return null
}
