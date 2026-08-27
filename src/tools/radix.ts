/**
 * 任意进制 ↔ 任意进制转换(FE6 重做):
 * - 全程 BigInt 承载,超出 Number.MAX_SAFE_INTEGER 不丢精度
 * - 容忍空白/下划线分隔符(分组结果可直接回贴)
 * - 字节分组显示选项:仅对字节对齐的 2 幂进制(2/4/16)生效
 */

const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz'

/** 输入数字位长度护栏(去分隔符后),防止极端输入的 BigInt 运算卡死 UI */
export const MAX_RADIX_DIGITS = 4096

export interface ParsedBigValue {
  negative: boolean
  magnitude: bigint
}

function assertRadix(radix: number, what: string): void {
  if (!Number.isInteger(radix) || radix < 2 || radix > 36) {
    throw new Error(`${what} radix must be between 2 and 36, got ${radix}`)
  }
}

/**
 * 解析任意进制字符串 → 符号 + 绝对值(bigint 精度)。
 * 剥离空白与下划线分隔符;空串/非法字符显式报错。
 */
export function radixParse(value: string, from: number): ParsedBigValue {
  assertRadix(from, 'From')
  const cleaned = value.trim().replace(/[\s_]/g, '')
  if (cleaned === '') throw new Error('Value is empty')
  if (cleaned.length > MAX_RADIX_DIGITS) {
    throw new Error(`输入过长:最多支持 ${MAX_RADIX_DIGITS} 位数字`)
  }

  let negative = false
  let body = cleaned
  if (body[0] === '-' || body[0] === '+') {
    negative = body[0] === '-'
    body = body.slice(1)
  }
  if (body === '') throw new Error(`Invalid value: ${value}`)

  const base = BigInt(from)
  let magnitude = 0n
  for (const ch of body.toLowerCase()) {
    const d = DIGITS.indexOf(ch)
    if (d < 0 || d >= from) throw new Error(`Invalid digit '${ch}' for base ${from}`)
    magnitude = magnitude * base + BigInt(d)
  }
  return { negative: negative && magnitude !== 0n, magnitude }
}

/** 字节对齐的进制才可按字节边界分组:每字节位数 = 8 / log2(radix),仅 2/4/16 在合法范围内整除 */
export function byteGroupDigits(radix: number): number | null {
  const bits = Math.log2(radix)
  if (!Number.isInteger(bits)) return null
  const perByte = 8 / bits
  return Number.isInteger(perByte) ? perByte : null
}

/** 字节分组(已去符号的纯数位):高位补零到整字节后每 d 位以空格连接 */
export function groupDigits(digits: string, to: number): string {
  const perByte = byteGroupDigits(to)
  if (perByte === null || digits.length <= perByte) return digits
  const pad = digits.length % perByte
  const aligned = pad === 0 ? digits : '0'.repeat(perByte - pad) + digits
  return aligned.match(new RegExp(`.{1,${perByte}}`, 'g'))!.join(' ')
}

function formatMagnitude(magnitude: bigint, to: number): string {
  if (magnitude === 0n) return '0'
  const base = BigInt(to)
  let out = ''
  let n = magnitude
  while (n > 0n) {
    out = DIGITS[Number(n % base)] + out
    n /= base
  }
  return out
}

/**
 * 格式化 ParsedBigValue 为目标进制。
 * opts.group=true 时按字节边界以空格分组(仅 2/4/16 生效;符号在分组之外)。
 */
export function radixFormat(v: ParsedBigValue, to: number, opts?: { group?: boolean }): string {
  assertRadix(to, 'To')
  const sign = v.negative ? '-' : ''
  if (v.magnitude === 0n) return '0'
  const body = formatMagnitude(v.magnitude, to)
  return opts?.group ? sign + groupDigits(body, to) : sign + body
}

/** 兼容旧签名:小写输出、符号保留、非法输入抛错。 */
export function radixConvert(value: string, from: number, to: number): string {
  try {
    return radixFormat(radixParse(value, from), to)
  } catch (e) {
    // 统一抛错路径由组件收口展示
    throw e instanceof Error ? e : new Error(String(e))
  }
}

/** 带展示选项的转换入口(组件用)。 */
export function radixConvertEx(
  value: string,
  from: number,
  to: number,
  opts?: { group?: boolean },
): string {
  return radixFormat(radixParse(value, from), to, opts)
}
