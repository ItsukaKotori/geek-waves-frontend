// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createPrivateKey, createPublicKey } from 'node:crypto'
import {
  generateAesKey,
  generateRsaKeyPair,
  parseRsaKeyMaterial,
  rsaJwkToPem,
  rsaPemToJwk,
} from '../cryptoKeys'
import { PRIV_PEM, PRIV_JWK, PUB_PEM, PUB_JWK } from './cryptoFixtures'

/** node:crypto 导出的该密钥 JWK 全字段(不动向量) */
describe('rsaPemToJwk(手写 ASN.1 解码)', () => {
  it('openssl PKCS#8 私钥 PEM → JWK 全字段一致', () => {
    expect(rsaPemToJwk(PRIV_PEM)).toEqual(PRIV_JWK)
  })

  it('openssl SPKI 公钥 PEM → JWK 一致', () => {
    expect(rsaPemToJwk(PUB_PEM)).toEqual(PUB_JWK)
  })

  it('容忍首尾空白与多余换行', () => {
    expect(rsaPemToJwk('\n' + PUB_PEM + '\n')).toEqual(PUB_JWK)
  })

  it.each([
    ['空串', ''],
    ['非 PEM 乱码', 'hello world'],
    ['证书头(不支持)', PUB_PEM.replace('PUBLIC KEY', 'CERTIFICATE')],
    ['base64 体损坏', PUB_PEM.slice(0, -20)],
  ])('%s 抛错', (_name, raw) => {
    expect(() => rsaPemToJwk(raw)).toThrow()
  })
})

describe('rsaJwkToPem(手写 ASN.1 编码)', () => {
  it('私钥 JWK → PKCS#8 PEM 与 openssl 输出逐字节一致', () => {
    expect(rsaJwkToPem(PRIV_JWK, 'private')).toBe(PRIV_PEM)
  })

  it('公钥 JWK → SPKI PEM 与 openssl 输出逐字节一致', () => {
    expect(rsaJwkToPem(PUB_JWK, 'public')).toBe(PUB_PEM)
  })
})

describe('parseRsaKeyMaterial(格式自动识别)', () => {
  it('PEM 私钥 → { kind: private, jwk }', () => {
    expect(parseRsaKeyMaterial(PRIV_PEM)).toEqual({ kind: 'private', jwk: PRIV_JWK })
  })

  it('PEM 公钥 → { kind: public, jwk }', () => {
    expect(parseRsaKeyMaterial(PUB_PEM)).toEqual({ kind: 'public', jwk: PUB_JWK })
  })

  it('JWK JSON 字符串按是否含 d 判断公私', () => {
    expect(parseRsaKeyMaterial(JSON.stringify(PRIV_JWK))).toEqual({ kind: 'private', jwk: PRIV_JWK })
    expect(parseRsaKeyMaterial(JSON.stringify(PUB_JWK))).toEqual({ kind: 'public', jwk: PUB_JWK })
  })

  it('非 RSA JWK / 缺字段 JSON 抛错', () => {
    expect(() => parseRsaKeyMaterial(JSON.stringify({ kty: 'EC', crv: 'P-256' }))).toThrow()
    expect(() => parseRsaKeyMaterial(JSON.stringify({ kty: 'RSA', n: 'AQAB' }))).toThrow()
    expect(() => parseRsaKeyMaterial('{bad json')).toThrow()
  })
})

describe('generateRsaKeyPair(Web Crypto 生成)', () => {
  it('产出的私钥 PEM 可被 node:crypto 接受且 JWK 等价', async () => {
    const { publicJwk, privateJwk } = await generateRsaKeyPair(2048)
    const privPem = rsaJwkToPem(privateJwk, 'private')
    const pubPem = rsaJwkToPem(publicJwk, 'public')
    // 独立实现交叉验证:node 能解析我们手写的 DER
    const pick = (j: object) =>
      Object.fromEntries(['kty', 'n', 'e', 'd', 'p', 'q', 'dp', 'dq', 'qi'].filter((k) => k in j).map((k) => [k, (j as Record<string, unknown>)[k]]))
    expect(pick(createPrivateKey({ key: privPem, format: 'pem' }).export({ format: 'jwk' }))).toEqual(pick(privateJwk))
    expect(pick(createPublicKey({ key: pubPem, format: 'pem' }).export({ format: 'jwk' }))).toEqual(pick(publicJwk))
    expect(privateJwk.n).toBe(publicJwk.n)
    expect(privateJwk.e).toBe('AQAB')
  })

  it('非法位数抛错', async () => {
    await expect(generateRsaKeyPair(1024 as 2048)).rejects.toThrow()
  })
})

describe('generateAesKey(随机对称密钥)', () => {
  it('128/192/256 位对应 16/24/32 字节 base64', async () => {
    for (const [bits, bytes] of [[128, 16], [192, 24], [256, 32]] as const) {
      const key = await generateAesKey(bits)
      expect(Buffer.from(key, 'base64').length).toBe(bytes)
    }
  })

  it('两次生成不同', async () => {
    expect(await generateAesKey(256)).not.toBe(await generateAesKey(256))
  })

  it('非法位数抛错', async () => {
    await expect(generateAesKey(100 as 128)).rejects.toThrow()
  })
})
