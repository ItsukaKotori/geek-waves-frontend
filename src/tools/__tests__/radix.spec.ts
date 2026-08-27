import { describe, expect, it } from 'vitest'
import {
  MAX_RADIX_DIGITS,
  radixConvert,
  radixConvertEx,
  radixFormat,
  radixParse,
} from '../radix'

describe('radix 大数精度(BigInt)', () => {
  it('超过 Number.MAX_SAFE_INTEGER 不得静默丢精度', () => {
    // Number.MAX_SAFE_INTEGER = 2^53-1;再 +1、+2 的十进制在 Number 下会丢失尾数
    expect(radixConvert('9007199254740993', 10, 10)).toBe('9007199254740993')
    expect(radixConvert('9007199254740993', 10, 16)).toBe('20000000000001')
    expect(radixConvert('7fffffffffffffff', 16, 10)).toBe('9223372036854775807')
  })

  it('u64 边界:2^64-1 hex↔dec 往返一致', () => {
    const hex = radixConvert('18446744073709551615', 10, 16)
    expect(hex).toBe('ffffffffffffffff')
    expect(radixConvert(hex, 16, 10)).toBe('18446744073709551615')
  })

  it('有符号极值:-2^63 往返保留符号', () => {
    const hex = radixConvert('-9223372036854775808', 10, 16)
    expect(hex).toBe('-8000000000000000')
    expect(radixConvert(hex, 16, 10)).toBe('-9223372036854775808')
  })

  it('超长大数往返(基址 36)保持逐位一致', () => {
    const dec = '123456789012345678901234567890123456789012345678901234567890'
    expect(radixConvert(radixConvert(dec, 10, 36), 36, 10)).toBe(dec.toLowerCase())
  })
})

describe('radix 解析/格式化分步接口', () => {
  it('radixParse 拆出符号与绝对值(bigint)', () => {
    expect(radixParse('-ff', 16)).toEqual({ negative: true, magnitude: 255n })
    expect(radixParse('+2a', 16)).toEqual({ negative: false, magnitude: 42n })
  })

  it('radixFormat 复原;零值归一化', () => {
    expect(radixFormat(radixParse('-1010', 2), 16)).toBe('-a')
    expect(radixFormat(radixParse('-0', 10), 16)).toBe('0')
    expect(radixFormat(radixParse('000', 8), 10)).toBe('0')
  })

  it('非法进制(<2 / >36)显式报错,包括分步函数', () => {
    expect(() => radixParse('1', 1)).toThrow()
    expect(() => radixFormat(radixParse('1', 10), 37)).toThrow()
    expect(() => radixConvert('1', 0, 10)).toThrow()
    expect(() => radixConvert('1', 10, 99)).toThrow()
  })

  it('小数点/分数形式被拒绝而非静默截断', () => {
    expect(() => radixConvert('12.5', 10, 2)).toThrow(/Invalid digit/)
  })

  it('空白与下划线作为分隔符被剥离(方便回贴分组结果)', () => {
    expect(radixConvert('ffff ffff', 16, 10)).toBe('4294967295')
    expect(radixConvert('ffff_ffff', 16, 10)).toBe('4294967295')
  })

  it(`超过 ${String(MAX_RADIX_DIGITS)} 位护栏报错而非卡死`, () => {
    const huge = 'f'.repeat(MAX_RADIX_DIGITS + 1)
    expect(() => radixConvert(huge, 16, 10)).toThrow(/过长/)
  })
})

describe('radix 字节分组显示', () => {
  it('hex 每字节 2 位分组', () => {
    expect(
      radixConvertEx('deadbeefdeadbeef', 16, 16, { group: true }),
    ).toBe('de ad be ef de ad be ef')
  })

  it('二进制每字节 8 位分组', () => {
    expect(
      radixConvertEx('1111111111111111', 2, 2, { group: true }),
    ).toBe('11111111 11111111')
  })

  it('不足整字节高位补零对齐(hex)', () => {
    expect(radixConvertEx('fff', 16, 16, { group: true })).toBe('0f ff')
  })

  it('符号位于分组之外', () => {
    expect(radixConvertEx('-deadbeef', 16, 16, { group: true })).toBe('-de ad be ef')
  })

  it('10 进制等非 2 幂进制不受分组选项影响', () => {
    expect(radixConvertEx('1234567890', 10, 10, { group: true })).toBe('1234567890')
    expect(radixConvertEx('101010101', 3, 3, { group: true })).toBe('101010101')
  })

  it('分组结果(含补零与空格)可直接回贴解析成同一数值', () => {
    const grouped = radixConvertEx('deadbeef', 16, 16, { group: true })
    expect(radixConvert(grouped, 16, 10)).toBe(radixConvert('deadbeef', 16, 10))
  })
})
