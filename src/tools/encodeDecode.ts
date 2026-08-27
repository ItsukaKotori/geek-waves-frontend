const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

export function base64Encode(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let out = ''
  let i = 0
  for (; i + 3 <= bytes.length; i += 3) {
    const b0 = bytes[i]
    const b1 = bytes[i + 1]
    const b2 = bytes[i + 2]
    out +=
      B64[b0 >> 2] +
      B64[((b0 & 3) << 4) | (b1 >> 4)] +
      B64[((b1 & 15) << 2) | (b2 >> 6)] +
      B64[b2 & 63]
  }
  const rest = bytes.length - i
  if (rest === 1) {
    const b0 = bytes[i]
    out += B64[b0 >> 2] + B64[(b0 & 3) << 4] + '=='
  } else if (rest === 2) {
    const b0 = bytes[i]
    const b1 = bytes[i + 1]
    out += B64[b0 >> 2] + B64[((b0 & 3) << 4) | (b1 >> 4)] + B64[(b1 & 15) << 2] + '='
  }
  return out
}

/** Base64 字符串 → 原始字节(容忍 URL-safe 字符,非法字符抛错);不含 UTF-8 解码 */
export function base64DecodeBytes(text: string): Uint8Array {
  const clean = text.replace(/-/g, '+').replace(/_/g, '/').replace(/[^A-Za-z0-9+/=]/g, '')
  if (clean === '' && text !== '') throw new Error('Invalid base64 input')
  const bytes: number[] = []
  for (let i = 0; i < clean.length; i += 4) {
    const a = B64.indexOf(clean[i])
    const b = B64.indexOf(clean[i + 1])
    if (a < 0 || b < 0) throw new Error('Invalid base64 input')
    bytes.push((a << 2) | (b >> 4))
    if (i + 2 < clean.length && clean[i + 2] !== '=') {
      const c = B64.indexOf(clean[i + 2])
      if (c < 0) throw new Error('Invalid base64 input')
      bytes.push(((b & 15) << 4) | (c >> 2))
      if (i + 3 < clean.length && clean[i + 3] !== '=') {
        const d = B64.indexOf(clean[i + 3])
        if (d < 0) throw new Error('Invalid base64 input')
        bytes.push(((c & 3) << 6) | d)
      }
    }
  }
  return new Uint8Array(bytes)
}

/**
 * fatal UTF-8 解码诊断(FE5):字节流不是合法 UTF-8 时抛出明确的
 * 「疑似编码不符」提示,而非静默输出乱码替换符。
 */
export function decodeUtf8Strict(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new Error('疑似编码不符:字节序列不是有效的 UTF-8 文本')
  }
}

export function base64Decode(text: string): string {
  return decodeUtf8Strict(base64DecodeBytes(text))
}

const HEX_CLEAN_RE = /[\s:-]/g
const HEX_VALID_RE = /^[0-9a-fA-F]+$/

/** 文本 → UTF-8 字节 → 连续小写 hex */
export function hexEncode(text: string): string {
  return Array.from(new TextEncoder().encode(text))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** hex(容忍空格/冒号/换行分隔与大小写混排)→ UTF-8 文本;奇数长度或非法字符抛错 */
export function hexDecode(text: string): string {
  const clean = text.replace(HEX_CLEAN_RE, '')
  if (clean.length % 2 !== 0 || (clean !== '' && !HEX_VALID_RE.test(clean))) {
    throw new Error('Invalid hex input:需要成对的十六进制字符')
  }
  const bytes = new Uint8Array(clean.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  }
  return decodeUtf8Strict(bytes)
}
