// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { formatBigCount, parseCidr } from '../cidrCalc'

/**
 * CIDR/IP 子网计算纯函数层:
 * IPv4/IPv6 双栈,BigInt 全程(不得丢精度),边界 /0 /31 /32 /127 /128,
 * 非法输入逐类明确报错;超大主机数用科学计数 + 分段显示双轨。
 */

describe('IPv4 解析与计算', () => {
  it('/24 经典形态:网络/广播/掩码/反掩码/可用范围', () => {
    const r = parseCidr('192.168.1.0/24')
    expect(r.version).toBe(4)
    expect(r.prefix).toBe(24)
    expect(r.hostBits).toBe(8)
    expect(r.network).toBe('192.168.1.0')
    expect(r.broadcast).toBe('192.168.1.255')
    expect(r.netmask).toBe('255.255.255.0')
    expect(r.wildcardMask).toBe('0.0.0.255')
    expect(r.rangeStart).toBe('192.168.1.1')
    expect(r.rangeEnd).toBe('192.168.1.254')
    expect(r.totalAddresses).toBe(256n)
    expect(r.usableHosts).toBe(254n)
  })

  it('输入未对齐网络地址:按掩码归位展示网络地址', () => {
    const r = parseCidr('192.168.1.77/24')
    expect(r.ip).toBe('192.168.1.77')
    expect(r.network).toBe('192.168.1.0')
    expect(r.broadcast).toBe('192.168.1.255')
  })

  it('/0 边界:全地址空间', () => {
    const r = parseCidr('0.0.0.0/0')
    expect(r.network).toBe('0.0.0.0')
    expect(r.broadcast).toBe('255.255.255.255')
    expect(r.netmask).toBe('0.0.0.0')
    expect(r.wildcardMask).toBe('255.255.255.255')
    expect(r.totalAddresses).toBe(2n ** 32n)
    expect(r.usableHosts).toBe(2n ** 32n - 2n)
  })

  it('/31 边界(RFC 3021 点对点):两地址均可用', () => {
    const r = parseCidr('10.0.0.4/31')
    expect(r.totalAddresses).toBe(2n)
    expect(r.usableHosts).toBe(2n)
    expect(r.network).toBe('10.0.0.4')
    expect(r.broadcast).toBe('10.0.0.5')
    expect(r.rangeStart).toBe('10.0.0.4')
    expect(r.rangeEnd).toBe('10.0.0.5')
    expect(r.netmask).toBe('255.255.255.254')
  })

  it('/32 边界(单机路由):可用 1,起止均为本地址', () => {
    const r = parseCidr('10.0.0.4/32')
    expect(r.totalAddresses).toBe(1n)
    expect(r.usableHosts).toBe(1n)
    expect(r.network).toBe('10.0.0.4')
    expect(r.broadcast).toBe('10.0.0.4')
    expect(r.rangeStart).toBe('10.0.0.4')
    expect(r.rangeEnd).toBe('10.0.0.4')
    expect(r.netmask).toBe('255.255.255.255')
    expect(r.wildcardMask).toBe('0.0.0.0')
  })

  it('/8 掩码形态正确', () => {
    const r = parseCidr('10.1.2.3/8')
    expect(r.netmask).toBe('255.0.0.0')
    expect(r.wildcardMask).toBe('0.255.255.255')
    expect(r.network).toBe('10.0.0.0')
    expect(r.broadcast).toBe('10.255.255.255')
  })

  it('裸 IP(无前缀)按 /32 处理', () => {
    const r = parseCidr('10.0.0.4')
    expect(r.prefix).toBe(32)
    expect(r.usableHosts).toBe(1n)
  })
})

describe('IPv6 解析与计算(BigInt 不丢精度)', () => {
  it('/32 经典形态:范围末地址与总数(BigInt 精确)', () => {
    const r = parseCidr('2001:db8::/32')
    expect(r.version).toBe(6)
    expect(r.prefix).toBe(32)
    expect(r.network).toBe('2001:db8::')
    expect(r.broadcast).toBe('')
    expect(r.wildcardMask).toBe('')
    // 末地址 = 2001:db8:ffff:ffff:ffff:ffff:ffff:ffff(无零段可压缩)
    expect(r.rangeEnd).toBe('2001:db8:ffff:ffff:ffff:ffff:ffff:ffff')
    expect(r.rangeStart).toBe('2001:db8::')
    expect(r.totalAddresses).toBe(2n ** 96n)
    expect(r.usableHosts).toBe(2n ** 96n)
    expect(r.netmask).toBe('ffff:ffff:0000:0000:0000:0000:0000:0000')
  })

  it('/48 前缀掩码归位到第三段', () => {
    const r = parseCidr('2001:db8:1234:5678::/48')
    expect(r.network).toBe('2001:db8:1234::')
    expect(r.netmask).toBe('ffff:ffff:ffff:0000:0000:0000:0000:0000')
  })

  it('/127 边界:两地址子网', () => {
    const r = parseCidr('::/127')
    expect(r.network).toBe('::')
    expect(r.rangeStart).toBe('::')
    expect(r.rangeEnd).toBe('::1')
    expect(r.totalAddresses).toBe(2n)
    expect(r.usableHosts).toBe(2n)
  })

  it('/128 边界:单地址', () => {
    const r = parseCidr('2001:db8::1/128')
    expect(r.totalAddresses).toBe(1n)
    expect(r.usableHosts).toBe(1n)
    expect(r.rangeStart).toBe('2001:db8::1')
    expect(r.rangeEnd).toBe('2001:db8::1')
  })

  it('展开输入归一化为压缩形式(RFC 5952)', () => {
    const r = parseCidr('2001:0db8:0000:0000:0000:0000:0000:0001/128')
    expect(r.ip).toBe('2001:db8::1')
    expect(r.cidr).toBe('2001:db8::1/128')
  })

  it('::/0 全地址空间(BigInt 2^128)', () => {
    const r = parseCidr('::/0')
    expect(r.totalAddresses).toBe(2n ** 128n)
    expect(r.network).toBe('::')
    expect(r.netmask).toBe('0000:0000:0000:0000:0000:0000:0000:0000')
  })

  it('裸 IPv6 地址按 /128 处理', () => {
    const r = parseCidr('fe80::1')
    expect(r.prefix).toBe(128)
    expect(r.totalAddresses).toBe(1n)
  })

  it('IPv6 无广播概念:usable = 总数(声明口径)', () => {
    const r = parseCidr('2001:db8::/64')
    expect(r.usableHosts).toBe(2n ** 64n)
  })
})

describe('超大主机数显示(科学计数 + 分段)', () => {
  it('小于 2^53:仅分段显示,不启用科学计数', () => {
    const f = formatBigCount(254n)
    expect(f).toEqual({ exact: '254', display: '254', scientific: false })
    expect(formatBigCount(9007199254740991n)).toEqual({
      exact: '9,007,199,254,740,991',
      display: '9,007,199,254,740,991',
      scientific: false,
    })
  })

  it('达到 2^53:启用科学计数,exact 保持完整分段', () => {
    const f = formatBigCount(2n ** 53n)
    expect(f.exact).toBe('9,007,199,254,740,992')
    expect(f.display).toBe('9.0071992e+15')
    expect(f.scientific).toBe(true)
  })

  it('2^64 与 2^128 的科学计数尾数正确', () => {
    expect(formatBigCount(2n ** 64n).display).toBe('1.8446744e+19')
    expect(formatBigCount(2n ** 128n).display).toBe('3.4028236e+38')
    expect(formatBigCount(2n ** 128n).exact).toBe(
      '340,282,366,920,938,463,463,374,607,431,768,211,456',
    )
  })
})

describe('非法输入明确报错', () => {
  it.each([
    ['', /输入为空/],
    ['   ', /输入为空/],
    ['192.168.1.0/24/8', /一个 "?\/"?/],
    ['192.168.1.0/', /前缀长度/],
    ['192.168.1.0/abc', /整数/],
    ['192.168.1.0/-1', /整数/],
    ['192.168.1.0/33', /0~32/],
    ['2001:db8::/129', /0~128/],
    ['192.168.1.256/24', /0~255/],
    ['192.168.1/24', /4 段/],
    ['192.168.1.0.5/24', /4 段/],
    ['01.2.3.4/24', /前导零/],
    ['a.b.c.d/24', /十进制/],
    ['1..2.3/24', /十进制/],
    ['1.2.3.4:80/24', /映射/],
    ['::ffff:1.2.3.4/128', /映射/],
    ['2001:db8:::1/64', /十六进制/],
    ['1:2:3:4:5:6:7:8:9', /8 段/],
    ['2001:db8::8:9:10:11:12:13/64', /8 段|压缩/],
    ['zz::1/64', /十六进制/],
    ['12345::1/64', /十六进制/],
  ])('非法输入 %j 报错明确', (input, pattern) => {
    expect(() => parseCidr(input)).toThrow(pattern)
  })
})
