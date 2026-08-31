/**
 * 加密系列·密码层:AES-GCM/CBC 与 RSA-OAEP/PSS 的 Web Crypto 封装。
 * 全部走中文行内错误;密钥材料统一接受 PEM 或 JWK JSON(经 parseRsaKeyMaterial 自动识别)。
 */
import { parseRsaKeyMaterial, type RsaJwk } from './cryptoKeys'

/** 字节缓冲统一类型(与 cryptoKeys 一致,满足 DOM BufferSource) */
type Bytes = Uint8Array<ArrayBuffer>

export type AesMode = 'GCM' | 'CBC'

export interface AesEncryptResult {
  cipherB64: string
  ivB64: string
}

const subtle = () => globalThis.crypto.subtle

const enc = new TextEncoder()

function stdB64ToBytes(b64: string, what: string): Bytes {
  try {
    const bin = atob(b64.trim())
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  } catch {
    throw new Error(`${what}不是合法的 Base64`)
  }
}

const bytesToStdB64 = (bytes: Bytes): string => btoa(String.fromCharCode(...bytes))

/* ------------------------------ AES ------------------------------ */

async function importAesKey(mode: AesMode, keyB64: string): Promise<CryptoKey> {
  const raw = stdB64ToBytes(keyB64, '密钥')
  if (![16, 24, 32].includes(raw.length)) {
    throw new Error(`密钥长度不符:AES 需要 16/24/32 字节,当前 ${raw.length} 字节`)
  }
  return subtle().importKey('raw', raw, { name: mode === 'GCM' ? 'AES-GCM' : 'AES-CBC' }, false, [
    'encrypt',
    'decrypt',
  ])
}

/** AES 加密:IV 缺省随机生成(GCM 12 字节 / CBC 16 字节),显式传入则确定性可复现 */
export async function aesEncrypt(
  mode: AesMode,
  keyB64: string,
  plainText: string,
  ivB64?: string,
): Promise<AesEncryptResult> {
  const key = await importAesKey(mode, keyB64)
  const iv: Bytes =
    ivB64 !== undefined && ivB64.trim() !== ''
      ? stdB64ToBytes(ivB64, 'IV')
      : globalThis.crypto.getRandomValues(new Uint8Array(mode === 'GCM' ? 12 : 16))
  const algo: AesGcmParams | AesCbcParams =
    mode === 'GCM'
      ? { name: 'AES-GCM', iv }
      : { name: 'AES-CBC', iv }
  const cipher = await subtle().encrypt(algo, key, enc.encode(plainText))
  return { cipherB64: bytesToStdB64(new Uint8Array(cipher)), ivB64: bytesToStdB64(iv) }
}

/** AES 解密:GCM 认证失败/CBC 破损统一给「解密失败」行内提示 */
export async function aesDecrypt(
  mode: AesMode,
  keyB64: string,
  cipherB64: string,
  ivB64: string,
): Promise<string> {
  const key = await importAesKey(mode, keyB64)
  const iv = stdB64ToBytes(ivB64, 'IV')
  const algo: AesGcmParams | AesCbcParams =
    mode === 'GCM' ? { name: 'AES-GCM', iv } : { name: 'AES-CBC', iv }
  try {
    const plain = await subtle().decrypt(algo, key, stdB64ToBytes(cipherB64, '密文'))
    return new TextDecoder('utf-8', { fatal: true }).decode(plain)
  } catch (e) {
    throw new Error(
      (e as Error).name === 'TypeError'
        ? '解密结果不是有效 UTF-8 文本(疑似密钥或密文不符)'
        : '解密失败:密文、IV 或密钥不符',
    )
  }
}

/* ------------------------------ RSA ------------------------------ */

async function importRsaKey(
  material: string,
  kind: 'public' | 'private',
  scheme: 'RSA-OAEP' | 'RSA-PSS',
): Promise<CryptoKey> {
  const parsed = parseRsaKeyMaterial(material)
  if (parsed.kind !== kind) {
    throw new Error(`密钥类型不符:此处需要${kind === 'public' ? '公钥' : '私钥'}`)
  }
  const usage = kind === 'public' ? (scheme === 'RSA-OAEP' ? 'encrypt' : 'verify') : scheme === 'RSA-OAEP' ? 'decrypt' : 'sign'
  // 剥掉可能存在的 key_ops/ext,避免与目标用途冲突后重新注入
  const { key_ops: _ops, ext: _ext, ...jwk } = parsed.jwk as RsaJwk & { key_ops?: string[]; ext?: boolean }
  return subtle().importKey(
    'jwk',
    jwk as unknown as JsonWebKey,
    { name: scheme, hash: 'SHA-256' } as RsaHashedImportParams,
    false,
    [usage] as KeyUsage[],
  )
}

/** RSA-OAEP-SHA256 上限 = 模长字节 - 2×32 - 2;2048 位即 190 字节 */
function oaepMaxBytes(jwk: RsaJwk): number {
  // base64url 无填充:字符数×6/8 向下取整即模长字节(末字符可能带 4bit 零填充)
  const nBytes = Math.floor((jwk.n.length * 6) / 8)
  return nBytes - 64 - 2
}

export async function rsaEncrypt(publicKey: string, text: string): Promise<string> {
  const parsed = parseRsaKeyMaterial(publicKey)
  if (parsed.kind !== 'public') throw new Error('密钥类型不符:此处需要公钥')
  const bytes = enc.encode(text)
  if (bytes.length > oaepMaxBytes(parsed.jwk)) {
    throw new Error(`明文过长:RSA-OAEP-SHA256 单段上限约 ${oaepMaxBytes(parsed.jwk)} 字节,请改用 AES 或压缩`)
  }
  const key = await importRsaKey(publicKey, 'public', 'RSA-OAEP')
  const cipher = await subtle().encrypt({ name: 'RSA-OAEP' }, key, bytes satisfies Bytes)
  return bytesToStdB64(new Uint8Array(cipher))
}

export async function rsaDecrypt(privateKey: string, cipherB64: string): Promise<string> {
  const key = await importRsaKey(privateKey, 'private', 'RSA-OAEP')
  try {
    const plain = await subtle().decrypt({ name: 'RSA-OAEP' }, key, stdB64ToBytes(cipherB64, '密文'))
    return new TextDecoder('utf-8', { fatal: true }).decode(plain)
  } catch (e) {
    if ((e as Error).name === 'TypeError') throw new Error('解密结果不是有效 UTF-8 文本')
    throw new Error('解密失败:密文或私钥不符')
  }
}

export async function rsaSign(privateKey: string, text: string): Promise<string> {
  const key = await importRsaKey(privateKey, 'private', 'RSA-PSS')
  const sig = await subtle().sign({ name: 'RSA-PSS', saltLength: 32 }, key, enc.encode(text))
  return bytesToStdB64(new Uint8Array(sig))
}

/** 验签:任何形态不符(密文/签名非法、密钥不匹配)都返回 false 而非抛错 */
export async function rsaVerify(publicKey: string, text: string, sigB64: string): Promise<boolean> {
  try {
    const key = await importRsaKey(publicKey, 'public', 'RSA-PSS')
    return await subtle().verify(
      { name: 'RSA-PSS', saltLength: 32 },
      key,
      stdB64ToBytes(sigB64, '签名'),
      enc.encode(text),
    )
  } catch {
    return false
  }
}
