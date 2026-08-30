import { describe, expect, it } from 'vitest'
import {
  AMBIGUOUS_CHARS,
  MAX_PASSWORD_BATCH,
  PASSWORD_CHARSETS,
  buildPool,
  generatePassword,
  generatePasswords,
  passwordEntropyBits,
  secureRandomInt,
  strengthOf,
  type PasswordOptions,
  type RandomInt,
} from '../passwordGen'

/**
 * 密码/Token 生成器纯函数层(FE10 T2 批次一):
 * 随机源仅 Web Crypto(crypto.getRandomValues)拒绝采样(无模偏差),
 * 严禁 Math.random;随机性通过 RandomInt 注入实现测试确定性。
 */

const baseOpts: PasswordOptions = {
  lower: true,
  upper: true,
  digits: true,
  symbols: true,
  excludeAmbiguous: false,
  length: 16,
}

/** 确定性随机源:按序列循环取值(测试可精确断言输出) */
function seqRng(values: number[]): RandomInt {
  let i = 0
  return () => values[i++ % values.length]!
}

describe('buildPool:字符池构建', () => {
  it('全开组合池按 lower→upper→digits→symbols 固定顺序拼接', () => {
    expect(buildPool(baseOpts)).toBe(
      PASSWORD_CHARSETS.lower +
        PASSWORD_CHARSETS.upper +
        PASSWORD_CHARSETS.digits +
        PASSWORD_CHARSETS.symbols,
    )
  })

  it('子集只包含所选字符集', () => {
    expect(buildPool({ ...baseOpts, symbols: false, upper: false })).toBe(
      PASSWORD_CHARSETS.lower + PASSWORD_CHARSETS.digits,
    )
  })

  it('排除易混淆字符:仅剔除 0O1lI,池内其余字符不动', () => {
    const pool = buildPool({ ...baseOpts, excludeAmbiguous: true })
    for (const c of AMBIGUOUS_CHARS) expect(pool).not.toContain(c)
    expect(pool).toHaveLength(24 + 25 + 8 + 27)
    // 不排除时包含全部易混淆字符
    const full = buildPool(baseOpts)
    for (const c of AMBIGUOUS_CHARS) expect(full).toContain(c)
  })

  it('未选择任何字符集明确报错', () => {
    expect(() => buildPool({ ...baseOpts, lower: false, upper: false, digits: false, symbols: false })).toThrow(
      /至少选择一个字符集/,
    )
  })
})

describe('熵与强度', () => {
  it('熵 = length × log2(poolSize)', () => {
    expect(passwordEntropyBits(62, 12)).toBeCloseTo(12 * Math.log2(62), 10)
    expect(passwordEntropyBits(89, 16)).toBeCloseTo(16 * Math.log2(89), 10)
  })

  it('强度分级阈值', () => {
    expect(strengthOf(10).label).toBe('弱')
    expect(strengthOf(27.9).label).toBe('弱')
    expect(strengthOf(28).label).toBe('一般')
    expect(strengthOf(49.9).label).toBe('一般')
    expect(strengthOf(50).label).toBe('强')
    expect(strengthOf(79.9).label).toBe('强')
    expect(strengthOf(80).label).toBe('极强')
  })

  it('分级 tone 供徽章样式使用', () => {
    expect(strengthOf(20).tone).toBe('weak')
    expect(strengthOf(40).tone).toBe('fair')
    expect(strengthOf(60).tone).toBe('strong')
    expect(strengthOf(120).tone).toBe('excellent')
  })
})

describe('generatePassword:生成(注入随机源,确定性断言)', () => {
  it('按 rng 序列精确取字符', () => {
    const pool = 'abc'
    expect(generatePassword(pool, 4, seqRng([0, 1, 2, 0]))).toBe('abca')
  })

  it('长度与字符域合规(真实 crypto 端到端)', () => {
    const pool = buildPool({ ...baseOpts, excludeAmbiguous: true })
    for (let i = 0; i < 20; i++) {
      const pwd = generatePassword(pool, 24)
      expect(pwd).toHaveLength(24)
      for (const c of pwd) expect(pool).toContain(c)
      expect(pwd).not.toMatch(/[0O1lI]/)
    }
  })

  it('长度越界明确报错', () => {
    expect(() => generatePassword('abc', 3)).toThrow(/长度/)
    expect(() => generatePassword('abc', 129)).toThrow(/长度/)
  })
})

describe('generatePasswords:批量', () => {
  it('数量与逐条合规', () => {
    const pool = buildPool(baseOpts)
    const list = generatePasswords(pool, 12, 5, seqRng(Array.from({ length: 512 }, (_, i) => i % 89)))
    expect(list).toHaveLength(5)
    for (const pwd of list) {
      expect(pwd).toHaveLength(12)
      for (const c of pwd) expect(pool).toContain(c)
    }
  })

  it('批量上限保护', () => {
    const pool = buildPool(baseOpts)
    expect(MAX_PASSWORD_BATCH).toBe(50)
    expect(() => generatePasswords(pool, 8, 0)).toThrow(/1~50/)
    expect(() => generatePasswords(pool, 8, 51)).toThrow(/1~50/)
  })
})

describe('secureRandomInt:Web Crypto 拒绝采样', () => {
  it('取值始终落在 [0, max) 且为整数(大量抽样)', () => {
    for (let i = 0; i < 2000; i++) {
      const v = secureRandomInt(62)
      expect(Number.isInteger(v)).toBe(true)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(62)
    }
  })

  it('输出有变化(非恒定值)', () => {
    const seen = new Set<number>()
    for (let i = 0; i < 200; i++) seen.add(secureRandomInt(89))
    expect(seen.size).toBeGreaterThan(10)
  })

  it('非法 max 明确报错', () => {
    expect(() => secureRandomInt(0)).toThrow()
    expect(() => secureRandomInt(1)).toThrow()
    expect(() => secureRandomInt(257)).toThrow()
    expect(() => secureRandomInt(2.5)).toThrow()
  })
})
