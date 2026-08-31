/**
 * 加密系列·密钥层:AES 随机密钥 / RSA 密钥对生成(Web Crypto),
 * 以及 RSA 密钥 JWK ↔ PEM(SPKI 公钥 / PKCS#8 私钥)互转 —— 内含手写最小 ASN.1 DER
 * 编解码(仅 SEQUENCE/INTEGER/NULL/OID/BIT STRING/OCTET STRING 六种结构),
 * 与 openssl 输出逐字节兼容,正确性由固定 openssl fixture 向量测试锚定。
 */

export type RsaKeyKind = 'public' | 'private'

/** 字节缓冲统一类型:DOM BufferSource 要求底层为 ArrayBuffer(TS 5.7 泛型化后不再接受 ArrayBufferLike) */
type Bytes = Uint8Array<ArrayBuffer>

export interface RsaJwk {
  kty: 'RSA'
  n: string
  e: string
  d?: string
  p?: string
  q?: string
  dp?: string
  dq?: string
  qi?: string
}

/* ------------------------------ base64 / base64url ------------------------------ */

const bytesToStdB64 = (bytes: Bytes): string => btoa(String.fromCharCode(...bytes))

const stdB64ToBytes = (b64: string): Bytes => {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

const bytesToB64Url = (bytes: Bytes): string =>
  bytesToStdB64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

const b64UrlToBytes = (s: string): Bytes => {
  let b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  while (b64.length % 4 !== 0) b64 += '='
  return stdB64ToBytes(b64)
}

/* ------------------------------ DER 编码(写入) ------------------------------ */

const concat = (parts: Bytes[]): Bytes => {
  const total = parts.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(total)
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

/** DER 长度字段:短形式 <128,长形式 0x80|字节数 + 大端长度 */
function derLength(n: number): Bytes {
  if (n < 0x80) return new Uint8Array([n])
  const be: number[] = []
  let v = n
  while (v > 0) {
    be.unshift(v % 256)
    v = Math.floor(v / 256)
  }
  return new Uint8Array([0x80 | be.length, ...be])
}

const derTlv = (tag: number, content: Bytes): Bytes =>
  concat([new Uint8Array([tag]), derLength(content.length), content])

/** DER INTEGER:去掉符号填充的先导零,最高位为 1 时补 0x00 保正号 */
function derInteger(bytes: Bytes): Bytes {
  let start = 0
  while (start < bytes.length - 1 && bytes[start] === 0) start++
  let body = bytes.slice(start)
  if (body.length === 1 && body[0] === 0) body = new Uint8Array([0])
  if (body[0]! >= 0x80) body = concat([new Uint8Array([0]), body])
  return derTlv(0x02, body)
}

const derSequence = (parts: Bytes[]): Bytes => derTlv(0x30, concat(parts))
const derNull = (): Bytes => new Uint8Array([0x05, 0x00])
const derBitString = (b: Bytes): Bytes => derTlv(0x03, concat([new Uint8Array([0]), b]))
const derOctetString = (b: Bytes): Bytes => derTlv(0x04, b)

/** rsaEncryption(1.2.840.113549.1.1.1) 的完整 DER TLV */
const RSA_ENCRYPTION_OID: Bytes = new Uint8Array([0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01])

const rsaAlgIdentifier = (): Bytes => derSequence([RSA_ENCRYPTION_OID, derNull()])

/* ------------------------------ DER 解码(读取) ------------------------------ */

interface DerTlv {
  tag: number
  content: Bytes
}

/** 光标式读取器:越界/截断/不支持的长形式一律抛错 */
class DerReader {
  private pos = 0
  constructor(private readonly bytes: Bytes) {}

  readTlv(): DerTlv {
    if (this.pos + 2 > this.bytes.length) throw new Error('DER 结构截断')
    const tag = this.bytes[this.pos]!
    let len = this.bytes[this.pos + 1]!
    let headerLen = 2
    if (len & 0x80) {
      const n = len & 0x7f
      if (n === 0 || n > 4 || this.pos + 2 + n > this.bytes.length) throw new Error('DER 长度字段非法')
      len = 0
      for (let i = 0; i < n; i++) len = len * 256 + this.bytes[this.pos + 2 + i]!
      headerLen = 2 + n
    }
    const start = this.pos + headerLen
    if (start + len > this.bytes.length) throw new Error('DER 内容越界')
    this.pos = start + len
    return { tag, content: this.bytes.slice(start, start + len) }
  }

  expectTag(tag: number, what: string): Bytes {
    const tlv = this.readTlv()
    if (tlv.tag !== tag) throw new Error(`DER 结构不符:期望 ${what}`)
    return tlv.content
  }
}

/** INTEGER 内容 → 无符号大端字节(剥符号填充;规范零值 0x00 保留为单字节) */
const integerBytes = (content: Bytes): Bytes => {
  if (content.length === 1 && content[0] === 0) return content
  let start = 0
  while (start < content.length - 1 && content[start] === 0) start++
  return content.slice(start)
}

/** INTEGER 是否为规范的零值版本号(空内容或单字节 0x00) */
const isZeroInteger = (content: Bytes): boolean =>
  content.length === 0 || (content.length === 1 && content[0] === 0)

/* ------------------------------ PEM 编解码 ------------------------------ */

function pemBody(pem: string, kind: RsaKeyKind): Bytes {
  const label = kind === 'public' ? 'PUBLIC KEY' : 'PRIVATE KEY'
  const m = pem.trim().match(new RegExp(`^-----BEGIN ${label}-----([A-Za-z0-9+/=\\s]+?)-----END ${label}-----$`))
  if (!m) throw new Error('无法识别的 PEM(需 SPKI 公钥或 PKCS#8 私钥)')
  const bytes = stdB64ToBytes(m[1]!.replace(/\s+/g, ''))
  if (bytes.length === 0) throw new Error('PEM 内容为空')
  return bytes
}

function pemWrap(label: string, der: Bytes): string {
  const b64 = bytesToStdB64(der)
  const lines = b64.match(/.{1,64}/g) ?? []
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----`
}

/* ------------------------------ JWK → PEM ------------------------------ */

export function rsaJwkToPem(jwk: RsaJwk, kind: RsaKeyKind): string {
  if (!jwk.n || !jwk.e) throw new Error('JWK 缺少 n/e 字段')
  const n = derInteger(b64UrlToBytes(jwk.n))
  const e = derInteger(b64UrlToBytes(jwk.e))
  if (kind === 'public') {
    // SPKI: SEQUENCE { AlgorithmIdentifier, BIT STRING { RSAPublicKey } }
    const publicKey = derSequence([n, e])
    return pemWrap('PUBLIC KEY', derSequence([rsaAlgIdentifier(), derBitString(publicKey)]))
  }
  // PKCS#8 PrivateKeyInfo: SEQUENCE { version 0, AlgorithmIdentifier, OCTET STRING { RSAPrivateKey } }
  const { d, p, q, dp, dq, qi } = jwk
  if (!d || !p || !q || !dp || !dq || !qi) throw new Error('JWK 缺少私钥字段(d/p/q/dp/dq/qi)')
  const version = derTlv(0x02, new Uint8Array([0]))
  const privateKey = derSequence([
    version,
    n,
    e,
    derInteger(b64UrlToBytes(d)),
    derInteger(b64UrlToBytes(p)),
    derInteger(b64UrlToBytes(q)),
    derInteger(b64UrlToBytes(dp)),
    derInteger(b64UrlToBytes(dq)),
    derInteger(b64UrlToBytes(qi)),
  ])
  return pemWrap('PRIVATE KEY', derSequence([version, rsaAlgIdentifier(), derOctetString(privateKey)]))
}

/* ------------------------------ PEM → JWK ------------------------------ */

function readRsaPrivateKey(reader: DerReader): RsaJwk {
  // RSAPrivateKey ::= SEQUENCE { version, n, e, d, p, q, dp, dq, qi }
  const seq = new DerReader(reader.expectTag(0x30, 'SEQUENCE(RSAPrivateKey)'))
  if (!isZeroInteger(seq.expectTag(0x02, 'INTEGER(version)'))) throw new Error('RSAPrivateKey 版本号非 0')
  const fields = ['n', 'e', 'd', 'p', 'q', 'dp', 'dq', 'qi'] as const
  const jwk: RsaJwk = { kty: 'RSA', n: '', e: '' }
  for (const f of fields) {
    jwk[f] = bytesToB64Url(integerBytes(seq.expectTag(0x02, `INTEGER(${f})`)))
  }
  return jwk
}

export function rsaPemToJwk(pem: string): RsaJwk {
  const kind: RsaKeyKind = /BEGIN PUBLIC KEY/.test(pem) ? 'public' : 'private'
  const outer = new DerReader(pemBody(pem, kind))
  const seq = outer.expectTag(0x30, 'SEQUENCE(顶层)')
  const reader = new DerReader(seq)

  if (kind === 'public') {
    // SPKI: AlgorithmIdentifier + BIT STRING{ SEQUENCE{ n, e } }
    const alg = new DerReader(reader.expectTag(0x30, 'SEQUENCE(算法标识)'))
    if (!algEqualsRsa(alg.expectTag(0x06, 'OID'))) throw new Error('非 RSA 公钥')
    alg.expectTag(0x05, 'NULL')
    const bitString = reader.expectTag(0x03, 'BIT STRING')
    if (bitString[0] !== 0) throw new Error('BIT STRING 含未用位')
    const pubSeq = new DerReader(new DerReader(bitString.slice(1)).expectTag(0x30, 'SEQUENCE(RSAPublicKey)'))
    const n = bytesToB64Url(integerBytes(pubSeq.expectTag(0x02, 'INTEGER(n)')))
    const e = bytesToB64Url(integerBytes(pubSeq.expectTag(0x02, 'INTEGER(e)')))
    return { kty: 'RSA', n, e }
  }

  // PKCS#8: version 0 + AlgorithmIdentifier + OCTET STRING{ RSAPrivateKey }
  if (!isZeroInteger(reader.expectTag(0x02, 'INTEGER(version)'))) throw new Error('PKCS#8 版本号非 0')
  const alg = new DerReader(reader.expectTag(0x30, 'SEQUENCE(算法标识)'))
  if (!algEqualsRsa(alg.expectTag(0x06, 'OID'))) throw new Error('非 RSA 私钥')
  alg.expectTag(0x05, 'NULL')
  const inner = new DerReader(reader.expectTag(0x04, 'OCTET STRING'))
  return readRsaPrivateKey(inner)
}

function algEqualsRsa(oid: Bytes): boolean {
  return oid.length === RSA_ENCRYPTION_OID.length - 2 && oid.every((b, i) => b === RSA_ENCRYPTION_OID[i + 2])
}

/* ------------------------------ 格式自动识别 ------------------------------ */

export function parseRsaKeyMaterial(text: string): { kind: RsaKeyKind; jwk: RsaJwk } {
  const raw = text.trim()
  if (raw.startsWith('-----BEGIN')) {
    const kind: RsaKeyKind = /BEGIN PUBLIC KEY/.test(raw) ? 'public' : 'private'
    return { kind, jwk: rsaPemToJwk(raw) }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('既不是 PEM 也不是合法 JSON')
  }
  const jwk = parsed as Partial<RsaJwk>
  if (jwk.kty !== 'RSA' || !jwk.n || !jwk.e) throw new Error('JWK 缺少 kty/n/e 字段')
  return { kind: jwk.d ? 'private' : 'public', jwk: jwk as RsaJwk }
}

/* ------------------------------ 密钥生成 ------------------------------ */

const AES_BITS = new Set([128, 192, 256])

/** 生成随机对称密钥(标准 base64 输出) */
export async function generateAesKey(bits: 128 | 192 | 256): Promise<string> {
  if (!AES_BITS.has(bits)) throw new Error('AES 密钥位数仅支持 128/192/256')
  return bytesToStdB64(globalThis.crypto.getRandomValues(new Uint8Array(bits / 8)) satisfies Bytes)
}

/** 生成 RSA 密钥对(OAEP-SHA256 用途,可经 JWK 重导入用于 PSS) */
export async function generateRsaKeyPair(bits: 2048 | 3072 | 4096): Promise<{ publicJwk: RsaJwk; privateJwk: RsaJwk }> {
  if (bits < 2048) throw new Error('RSA 位数过低,仅支持 2048/3072/4096')
  const pair = await globalThis.crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: bits,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['encrypt', 'decrypt'],
  )
  const publicJwk = (await globalThis.crypto.subtle.exportKey('jwk', pair.publicKey)) as unknown as RsaJwk
  const privateJwk = (await globalThis.crypto.subtle.exportKey('jwk', pair.privateKey)) as unknown as RsaJwk
  return { publicJwk, privateJwk }
}
