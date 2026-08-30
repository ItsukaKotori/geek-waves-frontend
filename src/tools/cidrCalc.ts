/**
 * CIDR/IP 子网计算纯函数层。
 *
 * 数值纪律:IPv4/IPv6 地址一律以 BigInt 承载位运算(128 位内不丢精度),
 * 展示层再做格式化。口径声明:
 * - IPv4 可用主机:一般 = 总数 - 2(网络/广播保留);/31 = 2(RFC 3021 点对点);
 *   /32 = 1(单机路由)。可用范围随之取「两端皆可用」或「掐头去尾」。
 * - IPv6 无网络/广播保留地址概念,可用主机 = 总数(无 /127 /128 特判需求,
 *   二者天然分别为 2 与 1);范围 = 子网首地址 ~ 末地址;不输出广播/反掩码。
 * - 主机数显示:≥ 2^53(JS Number 安全整数上界)启用科学计数(8 位有效数字),
 *   同时始终提供千位分段的完整精确值(exact)。
 * - 掩码显示:IPv4 点分十进制 + 反掩码;IPv6 为冒号十六进制「展开形式」
 *   (压缩形式无掩码惯例)。
 */

export interface CidrInfo {
  version: 4 | 6
  /** 归一化输入(IP 压缩形式 + 前缀) */
  cidr: string
  /** 输入 IP(压缩形式,未做掩码归位) */
  ip: string
  /** 掩码位(前缀长度) */
  prefix: number
  /** 主机位长度 */
  hostBits: number
  /** 网络地址(压缩形式) */
  network: string
  /** 广播地址(仅 IPv4;IPv6 返回 '') */
  broadcast: string
  /** 可用起始地址(IPv4 /31 /32 为网络地址本身;IPv6 为网络地址) */
  rangeStart: string
  /** 可用结束地址(IPv4 一般为广播 -1;IPv6 为子网末地址) */
  rangeEnd: string
  /** 总地址数 */
  totalAddresses: bigint
  /** 可用主机数 */
  usableHosts: bigint
  /** 掩码(IPv4 点分十进制;IPv6 冒号十六进制展开形式) */
  netmask: string
  /** 反掩码(仅 IPv4;IPv6 返回 '') */
  wildcardMask: string
}

/** 巨大数值双轨显示:exact 千位分段完整值;display 超过 2^53 时科学计数(8 位有效数字) */
export interface BigCountFormat {
  exact: string
  display: string
  scientific: boolean
}

/** JS Number 安全整数上界:超过则分段长串可读性差且 Number 化丢精度,启用科学计数 */
const SCIENTIFIC_THRESHOLD = 2n ** 53n

export function formatBigCount(n: bigint): BigCountFormat {
  if (n < 0n) throw new Error('主机数不应为负')
  const digits = n.toString()
  const exact = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  if (n < SCIENTIFIC_THRESHOLD) {
    return { exact, display: exact, scientific: false }
  }
  // 取 8 位有效数字的十进制定点尾数(不经过 Number,避免任何精度漂移)
  const mantissa = `${digits[0]}.${digits.slice(1, 8)}`
  const exponent = digits.length - 1
  return { exact, display: `${mantissa}e+${exponent}`, scientific: true }
}

/* ------------------------------ IPv4 解析 --------------------------------- */

function parseIPv4(s: string): bigint {
  const parts = s.split('.')
  if (parts.length !== 4) throw new Error('IPv4 须为 4 段点分十进制(a.b.c.d)')
  let v = 0n
  for (const part of parts) {
    if (!/^\d+$/.test(part)) throw new Error('IPv4 每段须为十进制数字')
    if (part.length > 1 && part.startsWith('0')) {
      throw new Error('IPv4 段不允许前导零(如 01),避免八进制歧义')
    }
    const octet = Number(part)
    if (octet > 255) throw new Error('IPv4 每段须为 0~255')
    v = (v << 8n) | BigInt(octet)
  }
  return v
}

function formatIPv4(v: bigint): string {
  return [(v >> 24n) & 0xffn, (v >> 16n) & 0xffn, (v >> 8n) & 0xffn, v & 0xffn].join('.')
}

/* ------------------------------ IPv6 解析 --------------------------------- */

function parseIPv6(s: string): bigint {
  if (s.includes('.')) {
    throw new Error('暂不支持 IPv4 映射/内嵌形式(如 ::ffff:1.2.3.4)')
  }
  const halves = s.split('::')
  if (halves.length > 2) throw new Error('IPv6 压缩符 :: 至多出现一次')
  const head = halves[0] === '' ? [] : halves[0]!.split(':')
  const tail = halves.length === 2 && halves[1] !== '' ? halves[1]!.split(':') : []
  if (halves.length === 1 && head.length !== 8) {
    throw new Error('IPv6 须为 8 段冒号十六进制,或用 :: 压缩零段')
  }
  if (halves.length === 2 && head.length + tail.length > 7) {
    throw new Error('IPv6 :: 压缩后段数超出(压缩须至少省略 1 段)')
  }
  const zeros = 8 - head.length - tail.length
  const groups = [...head, ...Array<string>(zeros).fill('0'), ...tail]
  let v = 0n
  for (const g of groups) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(g)) {
      throw new Error('IPv6 段须为 1~4 位十六进制数字(0-9a-f)')
    }
    v = (v << 16n) | BigInt(parseInt(g, 16))
  }
  return v
}

/** 压缩形式(RFC 5952:小写、去段内前导零、压缩最长(并列取最左)的 ≥2 零段) */
function formatIPv6(v: bigint): string {
  const groups = ipv6Groups(v)
  let bestStart = -1
  let bestLen = 0
  let curStart = -1
  let curLen = 0
  for (let i = 0; i < 8; i++) {
    if (groups[i] === 0) {
      if (curStart < 0) curStart = i
      curLen++
      if (curLen > bestLen) {
        bestLen = curLen
        bestStart = curStart
      }
    } else {
      curStart = -1
      curLen = 0
    }
  }
  if (bestLen < 2) return groups.map((g) => g.toString(16)).join(':')
  const head = groups.slice(0, bestStart).map((g) => g.toString(16)).join(':')
  const tail = groups.slice(bestStart + bestLen).map((g) => g.toString(16)).join(':')
  return `${head}::${tail}`
}

/** 展开形式:8 组 4 位小写十六进制 */
function formatIPv6Expanded(v: bigint): string {
  return ipv6Groups(v).map((g) => g.toString(16).padStart(4, '0')).join(':')
}

function ipv6Groups(v: bigint): number[] {
  const groups: number[] = []
  for (let shift = 112n; shift >= 0n; shift -= 16n) {
    groups.push(Number((v >> shift) & 0xffffn))
  }
  return groups
}

/* ------------------------------ 主解析入口 -------------------------------- */

function splitCidr(input: string): { ipPart: string; prefixPart: string | null } {
  const trimmed = input.trim()
  if (!trimmed) {
    throw new Error('输入为空,请输入 CIDR(如 192.168.1.0/24 或 2001:db8::/32)')
  }
  const firstSlash = trimmed.indexOf('/')
  if (firstSlash >= 0 && trimmed.indexOf('/', firstSlash + 1) >= 0) {
    throw new Error('CIDR 至多包含一个 "/"(如 192.168.1.0/24)')
  }
  if (firstSlash < 0) return { ipPart: trimmed, prefixPart: null }
  const prefixPart = trimmed.slice(firstSlash + 1)
  if (prefixPart === '') throw new Error('前缀长度缺失(如 192.168.1.0/24)')
  return { ipPart: trimmed.slice(0, firstSlash), prefixPart }
}

function parsePrefix(prefixPart: string, max: number, version: 4 | 6): number {
  if (!/^\d+$/.test(prefixPart)) {
    throw new Error(`IPv${version} 前缀长度须为 0~${max} 的非负整数,得到「${prefixPart}」`)
  }
  const prefix = Number(prefixPart)
  if (prefix > max) {
    throw new Error(`IPv${version} 前缀长度须为 0~${max},得到 ${prefix}`)
  }
  return prefix
}

/** 解析 CIDR(或裸 IP,按全长前缀处理)并计算子网各要素 */
export function parseCidr(input: string): CidrInfo {
  const { ipPart, prefixPart } = splitCidr(input)
  const isV6 = ipPart.includes(':')

  if (!isV6) {
    const ip = parseIPv4(ipPart)
    const prefix = parsePrefix(prefixPart ?? '32', 32, 4)
    const hostBits = 32 - prefix
    // 前缀掩码:高 prefix 位为 1;hostMask 为低 hostBits 位为 1
    const prefixMask = prefix === 0 ? 0n : ((1n << BigInt(prefix)) - 1n) << BigInt(hostBits)
    const hostMask = (1n << BigInt(hostBits)) - 1n
    const network = ip & prefixMask
    const broadcast = network | hostMask
    // 可用口径:/31 两端皆可用(RFC 3021)、/32 单机;其余掐头去尾
    const singleOrP2P = prefix === 31 || prefix === 32
    const rangeStart = formatIPv4(singleOrP2P ? network : network + 1n)
    const rangeEnd = formatIPv4(singleOrP2P ? broadcast : broadcast - 1n)
    const total = hostMask + 1n
    const usable = singleOrP2P ? total : total - 2n
    return {
      version: 4,
      cidr: `${formatIPv4(network)}/${prefix}`,
      ip: formatIPv4(ip),
      prefix,
      hostBits,
      network: formatIPv4(network),
      broadcast: formatIPv4(broadcast),
      rangeStart,
      rangeEnd,
      totalAddresses: total,
      usableHosts: usable,
      netmask: formatIPv4(prefixMask),
      wildcardMask: formatIPv4(hostMask),
    }
  }

  const ip = parseIPv6(ipPart)
  const prefix = parsePrefix(prefixPart ?? '128', 128, 6)
  const hostBits = 128 - prefix
  const prefixMask = prefix === 0 ? 0n : ((1n << BigInt(prefix)) - 1n) << BigInt(hostBits)
  const hostMask = (1n << BigInt(hostBits)) - 1n
  const network = ip & prefixMask
  const last = network | hostMask
  // IPv6 无保留地址概念:可用 = 总数(口径见模块注释)
  const total = hostMask + 1n
  return {
    version: 6,
    cidr: `${formatIPv6(network)}/${prefix}`,
    ip: formatIPv6(ip),
    prefix,
    hostBits,
    network: formatIPv6(network),
    broadcast: '',
    rangeStart: formatIPv6(network),
    rangeEnd: formatIPv6(last),
    totalAddresses: total,
    usableHosts: total,
    netmask: formatIPv6Expanded(prefixMask),
    wildcardMask: '',
  }
}
