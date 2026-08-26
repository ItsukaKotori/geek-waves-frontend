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

export function base64Decode(text: string): string {
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
  return new TextDecoder().decode(new Uint8Array(bytes))
}
