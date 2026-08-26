const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz'

export function radixConvert(value: string, from: number, to: number): string {
  if (from < 2 || from > 36 || to < 2 || to > 36) {
    throw new Error(`Radix must be between 2 and 36, got ${from} -> ${to}`)
  }
  const s = value.trim()
  if (s === '') throw new Error('Value is empty')

  let sign = ''
  let body = s
  if (body[0] === '-' || body[0] === '+') {
    if (body[0] === '-') sign = '-'
    body = body.slice(1)
  }
  if (body === '') throw new Error(`Invalid value: ${value}`)

  let num = 0
  for (const ch of body.toLowerCase()) {
    const d = DIGITS.indexOf(ch)
    if (d < 0 || d >= from) {
      throw new Error(`Invalid digit '${ch}' for base ${from}`)
    }
    num = num * from + d
  }
  if (num === 0) return '0'

  let out = ''
  let n = num
  while (n > 0) {
    out = DIGITS[n % to] + out
    n = Math.floor(n / to)
  }
  return sign + out
}
