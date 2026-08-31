import { md5 } from 'js-md5'
import { sha1 } from 'js-sha1'
import { sha256 } from 'js-sha256'
import { sha512 } from 'js-sha512'
import { sha3_256, sha3_512 } from 'js-sha3'

export type HashAlgorithm = 'MD5' | 'SHA-1' | 'SHA-256' | 'SHA-512' | 'SHA3-256' | 'SHA3-512'
export type FileHashAlgorithm = 'MD5' | 'SHA-1' | 'SHA-256' | 'SHA-512'

/** 文件单趟多算法并列展示(brief 固定四算法) */
export interface FileHashes {
  MD5: string
  'SHA-1': string
  'SHA-256': string
  'SHA-512': string
}

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

const hexToBytes = (hex: string): Uint8Array => {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

export async function hashValue(text: string, algo: HashAlgorithm): Promise<string> {
  if (algo === 'MD5') return md5(text)
  if (algo === 'SHA3-256') return sha3_256(text)
  if (algo === 'SHA3-512') return sha3_512(text)
  const digest = await globalThis.crypto.subtle.digest(algo, new TextEncoder().encode(text))
  return toHex(new Uint8Array(digest))
}

/* ------------------------------ HMAC(RFC 2104) ------------------------------ */

/** 各算法字节摘要适配:统一为同步纯函数(部分库的 d.ts 未暴露 .array(),走 hex 再转字节) */
const digestBytes: Record<HashAlgorithm, (data: Uint8Array) => Uint8Array> = {
  MD5: (d) => new Uint8Array(md5.array(d)),
  'SHA-1': (d) => hexToBytes(sha1(d)),
  'SHA-256': (d) => new Uint8Array(sha256.array(d)),
  'SHA-512': (d) => hexToBytes(sha512(d)),
  'SHA3-256': (d) => new Uint8Array(sha3_256.array(d)),
  'SHA3-512': (d) => new Uint8Array(sha3_512.array(d)),
}

/**
 * HMAC 块长(字节):MD5/SHA-1/SHA-256 为 64,SHA-512 为 128;
 * SHA3 系列取 Keccak 吸收率(rate):SHA3-256=136、SHA3-512=72。
 */
const HMAC_BLOCK: Record<HashAlgorithm, number> = {
  MD5: 64,
  'SHA-1': 64,
  'SHA-256': 64,
  'SHA-512': 128,
  'SHA3-256': 136,
  'SHA3-512': 72,
}

/**
 * 通用 HMAC 构造(RFC 2104):H(K⊕opad ‖ H(K⊕ipad ‖ m))。
 * 密钥超块长先做 H(K) 收缩;签名与 hashValue 对齐(异步、hex 小写输出)。
 */
export async function hmacValue(
  text: string,
  algo: HashAlgorithm,
  secret: string | Uint8Array,
): Promise<string> {
  const block = HMAC_BLOCK[algo]
  const hash = digestBytes[algo]
  const message = new TextEncoder().encode(text)
  let key = typeof secret === 'string' ? new TextEncoder().encode(secret) : secret
  if (key.length > block) key = hash(key)
  const padded = new Uint8Array(block)
  padded.set(key)

  const inner = new Uint8Array(block + message.length)
  const outer = new Uint8Array(block + hash(new Uint8Array(0)).length)
  for (let i = 0; i < block; i++) {
    inner[i] = padded[i] ^ 0x36
    outer[i] = padded[i] ^ 0x5c
  }
  inner.set(message, block)
  outer.set(hash(inner), block)
  return toHex(hash(outer))
}

interface IncrementalState {
  update(data: Uint8Array): void
  hex(): string
}

function createStates(): Record<FileHashAlgorithm, IncrementalState> {
  return {
    MD5: md5.create(),
    'SHA-1': sha1.create(),
    'SHA-256': sha256.create(),
    'SHA-512': sha512.create(),
  }
}

type ByteStream = Iterable<Uint8Array> | AsyncIterable<Uint8Array>

/**
 * 单趟流式多算法哈希:任意来源(内存块 / file.stream())逐块喂入四个增量状态,
 * 遍历一次即同时产出 MD5 / SHA-1 / SHA-256 / SHA-512。分块边界不影响结果。
 */
export async function hashChunks(chunks: ByteStream): Promise<FileHashes> {
  const states = createStates()
  if (Symbol.asyncIterator in (chunks as object)) {
    for await (const chunk of chunks as AsyncIterable<Uint8Array>) {
      for (const s of Object.values(states)) s.update(chunk)
    }
  } else {
    for (const chunk of chunks as Iterable<Uint8Array>) {
      for (const s of Object.values(states)) s.update(chunk)
    }
  }
  return { MD5: states.MD5.hex(), 'SHA-1': states['SHA-1'].hex(), 'SHA-256': states['SHA-256'].hex(), 'SHA-512': states['SHA-512'].hex() }
}

/** 纯文本便捷入口(测试与组件共用) */
export async function hashBytes(data: Uint8Array): Promise<FileHashes> {
  return hashChunks([data])
}

/** 哈希 / UUID 输出的统一格式化:去横线 + 大小写 */
export interface HexDisplayOptions {
  upper?: boolean
  stripDash?: boolean
}

export function formatHex(hex: string, opts: HexDisplayOptions = {}): string {
  let out = opts.stripDash ? hex.replace(/-/g, '') : hex
  return opts.upper ? out.toUpperCase() : out
}

export function uuid4(n: number): string[] {
  return Array.from({ length: n }, () => globalThis.crypto.randomUUID())
}

/**
 * UUID v7(RFC 9562):48 位 unix 毫秒时间戳前缀(大端)+ version/variant 位段 +
 * 随机余量,同毫秒多次生成亦不重复。
 */
export function uuid7(n: number = 1): string[] {
  const hex = (bytes: Uint8Array) => toHex(bytes)
  const out: string[] = []
  for (let i = 0; i < n; i++) {
    const b = new Uint8Array(16)
    let ts = Math.floor(Date.now())
    // 大端填入 b[5]..b[0](48 位毫秒),纯算术避免位运算符号位问题
    for (let j = 5; j >= 0; j--) {
      b[j] = ts % 256
      ts = Math.floor(ts / 256)
    }
    const rnd = globalThis.crypto.getRandomValues(new Uint8Array(10))
    rnd[0] = (rnd[0] & 0x0f) | 0x70
    rnd[2] = (rnd[2] & 0x3f) | 0x80
    b.set(rnd, 6)
    const h = hex(b)
    out.push(`${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`)
  }
  return out
}
