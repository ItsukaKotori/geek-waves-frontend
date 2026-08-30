/**
 * 密码/Token 生成器纯函数层(FE10 T2 批次一)。
 *
 * 随机源纪律:仅使用 Web Crypto(crypto.getRandomValues)的拒绝采样
 * (无模偏差),全链路禁止 Math.random。随机源抽象为 RandomInt 注入,
 * 测试以确定性序列断言;默认实现 secureRandomInt 走真实 crypto。
 *
 * Token 形态:关闭符号字符集(或全开)由字符集选项自由组合,
 * 长度上限 128 满足常见 API Token 需求。
 */

export const PASSWORD_CHARSETS = {
  lower: 'abcdefghijklmnopqrstuvwxyz',
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digits: '0123456789',
  symbols: '!@#$%^&*()-_=+[]{};:,.<>?/~',
} as const

export type PasswordCharsetKey = keyof typeof PASSWORD_CHARSETS

/** 易混淆字符(视觉难分辨):排除选项勾选后从池中剔除 */
export const AMBIGUOUS_CHARS = '0O1lI'

export const PASSWORD_MIN_LENGTH = 4
export const PASSWORD_MAX_LENGTH = 128
/** 单批生成数量上限 */
export const MAX_PASSWORD_BATCH = 50

export interface PasswordOptions {
  lower: boolean
  upper: boolean
  digits: boolean
  symbols: boolean
  /** 排除易混淆字符(0O1lI) */
  excludeAmbiguous: boolean
  length: number
}

/** 按选项构建字符池:固定顺序 lower→upper→digits→symbols;无字符集/排除后为空抛错 */
export function buildPool(opts: PasswordOptions): string {
  if (!opts.lower && !opts.upper && !opts.digits && !opts.symbols) {
    throw new Error('至少选择一个字符集')
  }
  let pool = ''
  if (opts.lower) pool += PASSWORD_CHARSETS.lower
  if (opts.upper) pool += PASSWORD_CHARSETS.upper
  if (opts.digits) pool += PASSWORD_CHARSETS.digits
  if (opts.symbols) pool += PASSWORD_CHARSETS.symbols
  if (opts.excludeAmbiguous) {
    pool = [...pool].filter((c) => !AMBIGUOUS_CHARS.includes(c)).join('')
  }
  if (pool === '') throw new Error('排除易混淆字符后字符池为空,请调整选项')
  return pool
}

/** 熵估算(位):length × log2(poolSize) —— 均匀抽样下的 Shannon 熵上界 */
export function passwordEntropyBits(poolSize: number, length: number): number {
  return length * Math.log2(poolSize)
}

export type StrengthTone = 'weak' | 'fair' | 'strong' | 'excellent'

/** 强度分级阈值(熵位):<28 弱 / <50 一般 / <80 强 / ≥80 极强 */
export const STRENGTH_THRESHOLDS = [
  { min: 80, label: '极强', tone: 'excellent' },
  { min: 50, label: '强', tone: 'strong' },
  { min: 28, label: '一般', tone: 'fair' },
  { min: 0, label: '弱', tone: 'weak' },
] as const satisfies ReadonlyArray<{ min: number; label: string; tone: StrengthTone }>

export function strengthOf(bits: number): { label: string; tone: StrengthTone } {
  const hit = STRENGTH_THRESHOLDS.find((t) => bits >= t.min) ?? STRENGTH_THRESHOLDS[STRENGTH_THRESHOLDS.length - 1]!
  return { label: hit.label, tone: hit.tone }
}

/** 随机整数 [0, maxExclusive) 抽象;测试注入确定性实现 */
export type RandomInt = (maxExclusive: number) => number

/**
 * 默认随机源:crypto.getRandomValues 单字节 + 拒绝采样。
 * limit = ⌊256/max⌋×max,仅接受 < limit 的字节,消除取模偏差;
 * 字符池恒 < 256,单字节足够(更直观且无缓冲分配)。
 */
export function secureRandomInt(maxExclusive: number): number {
  if (!Number.isInteger(maxExclusive) || maxExclusive < 2 || maxExclusive > 256) {
    throw new Error(`随机数上限非法:${maxExclusive}(须为 2~256 的整数)`)
  }
  const cryptoObj = globalThis.crypto
  if (!cryptoObj || typeof cryptoObj.getRandomValues !== 'function') {
    throw new Error('当前环境不支持 Web Crypto(crypto.getRandomValues),无法安全生成')
  }
  const limit = Math.floor(256 / maxExclusive) * maxExclusive
  const buf = new Uint8Array(1)
  for (;;) {
    cryptoObj.getRandomValues(buf)
    const v = buf[0]!
    if (v < limit) return v % maxExclusive
  }
}

function validateLength(length: number): void {
  if (!Number.isInteger(length) || length < PASSWORD_MIN_LENGTH || length > PASSWORD_MAX_LENGTH) {
    throw new Error(`长度须为 ${PASSWORD_MIN_LENGTH}~${PASSWORD_MAX_LENGTH} 的整数`)
  }
}

/** 生成单条密码:逐位从池中均匀抽取(注入 rng,缺省真实 crypto) */
export function generatePassword(pool: string, length: number, rng: RandomInt = secureRandomInt): string {
  validateLength(length)
  if (pool === '') throw new Error('字符池为空')
  let out = ''
  for (let i = 0; i < length; i++) out += pool[rng(pool.length)]!
  return out
}

/** 批量生成(1~MAX_PASSWORD_BATCH 条),复用同一随机源 */
export function generatePasswords(
  pool: string,
  length: number,
  count: number,
  rng: RandomInt = secureRandomInt,
): string[] {
  validateLength(length)
  if (!Number.isInteger(count) || count < 1 || count > MAX_PASSWORD_BATCH) {
    throw new Error(`生成数量须为 1~${MAX_PASSWORD_BATCH} 的整数`)
  }
  const out: string[] = []
  for (let i = 0; i < count; i++) out.push(generatePassword(pool, length, rng))
  return out
}
