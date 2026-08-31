// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import {
  aesDecrypt,
  aesEncrypt,
  rsaDecrypt,
  rsaEncrypt,
  rsaSign,
  rsaVerify,
} from '../cryptoCipher'
import { PRIV_JWK, PRIV_PEM, PUB_JWK, PUB_PEM } from './cryptoFixtures'

/** 32 字节固定 AES 密钥(标准 base64) */
const KEY_256 = Buffer.from(randomBytes(32)).toString('base64')

describe('aesEncrypt/aesDecrypt', () => {
  it('GCM 往返:密文含认证标签,IV 随机生成', async () => {
    const { cipherB64, ivB64 } = await aesEncrypt('GCM', KEY_256, 'GeekWaves 私有部署')
    expect(Buffer.from(ivB64, 'base64').length).toBe(12)
    expect(await aesDecrypt('GCM', KEY_256, cipherB64, ivB64)).toBe('GeekWaves 私有部署')
  })

  it('GCM 翻转密文 1 字节 → 解密报认证错误', async () => {
    const { cipherB64, ivB64 } = await aesEncrypt('GCM', KEY_256, 'auth test')
    const flipped = Buffer.from(cipherB64, 'base64')
    flipped[0]! ^= 0xff
    await expect(
      aesDecrypt('GCM', KEY_256, flipped.toString('base64'), ivB64),
    ).rejects.toThrow(/解密失败/)
  })

  it('GCM 与 node:crypto 互通(显式 IV 确定性)', async () => {
    const iv = Buffer.from('0123456789ab')
    const { cipherB64 } = await aesEncrypt('GCM', KEY_256, 'interop', iv.toString('base64'))
    // 相同输入重跑结果一致(确定性由显式 IV 保证)
    const again = await aesEncrypt('GCM', KEY_256, 'interop', iv.toString('base64'))
    expect(again.cipherB64).toBe(cipherB64)
    // node 侧独立解密:Web Crypto 的 GCM 输出为 密文‖标签(末 16 字节)
    const body = Buffer.from(cipherB64, 'base64')
    const nodeOut = createDecipheriv('aes-256-gcm', Buffer.from(KEY_256, 'base64'), iv)
    nodeOut.setAuthTag(body.subarray(-16))
    const plain = Buffer.concat([nodeOut.update(body.subarray(0, -16)), nodeOut.final()])
    expect(plain.toString()).toBe('interop')
  })

  it('CBC 往返与 IV 长度', async () => {
    const { cipherB64, ivB64 } = await aesEncrypt('CBC', KEY_256, 'legacy mode')
    expect(Buffer.from(ivB64, 'base64').length).toBe(16)
    expect(await aesDecrypt('CBC', KEY_256, cipherB64, ivB64)).toBe('legacy mode')
  })

  it('CBC 与 node:crypto 互通', async () => {
    const iv = randomBytes(16)
    const { cipherB64 } = await aesEncrypt('CBC', KEY_256, 'cbc interop', iv.toString('base64'))
    const d = createDecipheriv('aes-256-cbc', Buffer.from(KEY_256, 'base64'), iv)
    expect(Buffer.concat([d.update(Buffer.from(cipherB64, 'base64')), d.final()]).toString()).toBe('cbc interop')
    // 反向:node 加密 → 本实现解密
    const c = createCipheriv('aes-256-cbc', Buffer.from(KEY_256, 'base64'), iv)
    const nodeCipher = Buffer.concat([c.update('reverse', 'utf8'), c.final()]).toString('base64')
    expect(await aesDecrypt('CBC', KEY_256, nodeCipher, iv.toString('base64'))).toBe('reverse')
  })

  it('密钥 base64 非法或长度不符给友好错误', async () => {
    await expect(aesEncrypt('GCM', '!!!not-base64!!!', 'x')).rejects.toThrow(/密钥/)
    await expect(aesEncrypt('GCM', Buffer.from('short').toString('base64'), 'x')).rejects.toThrow(/密钥/)
  })

  it('密文/IV base64 非法给友好错误', async () => {
    await expect(aesDecrypt('GCM', KEY_256, '%%%', Buffer.from('x').toString('base64'))).rejects.toThrow()
  })
})

describe('rsaEncrypt/rsaDecrypt(OAEP-SHA256)', () => {
  it('公钥加密 → 私钥解密往返(PEM 形态)', async () => {
    const cipher = await rsaEncrypt(PUB_PEM, 'top secret 中文')
    expect(await rsaDecrypt(PRIV_PEM, cipher)).toBe('top secret 中文')
  })

  it('JWK 形态同样可用', async () => {
    const cipher = await rsaEncrypt(JSON.stringify(PUB_JWK), 'jwk form')
    expect(await rsaDecrypt(JSON.stringify(PRIV_JWK), cipher)).toBe('jwk form')
  })

  it('与 node:crypto 互通(node 解我们加密的)', async () => {
    const cipher = await rsaEncrypt(PUB_PEM, 'node interop')
    const { privateDecrypt, constants } = await import('node:crypto')
    const out = privateDecrypt(
      { key: PRIV_PEM, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
      Buffer.from(cipher, 'base64'),
    )
    expect(out.toString()).toBe('node interop')
  })

  it('2048 位明文超过 190 字节给上限提示', async () => {
    await expect(rsaEncrypt(PUB_PEM, 'a'.repeat(191))).rejects.toThrow(/过长/)
  })

  it('密文篡改 → 解密失败提示', async () => {
    const cipher = await rsaEncrypt(PUB_PEM, 'will break')
    const buf = Buffer.from(cipher, 'base64')
    buf[3]! ^= 0x01
    await expect(rsaDecrypt(PRIV_PEM, buf.toString('base64'))).rejects.toThrow(/解密失败/)
  })

  it('给私钥去加密给公钥去解密 → 明确报错', async () => {
    await expect(rsaEncrypt(PRIV_PEM, 'x')).rejects.toThrow(/公钥/)
    await expect(rsaDecrypt(PUB_PEM, Buffer.from('x').toString('base64'))).rejects.toThrow(/私钥/)
  })
})

describe('rsaSign/rsaVerify(PSS-SHA256)', () => {
  it('私钥签名 → 公钥验签通过,长文本亦可', async () => {
    const text = '发布说明:GeekWaves 批次 2 落地。'.repeat(20)
    const sig = await rsaSign(PRIV_PEM, text)
    expect(await rsaVerify(PUB_PEM, text, sig)).toBe(true)
  })

  it('文本被篡改 → 验签 false', async () => {
    const sig = await rsaSign(PRIV_PEM, 'original')
    expect(await rsaVerify(PUB_PEM, 'Original', sig)).toBe(false)
  })

  it('签名被篡改 → 验签 false(而非抛错)', async () => {
    const sig = await rsaSign(PRIV_PEM, 'original')
    const buf = Buffer.from(sig, 'base64')
    buf[10]! ^= 0xff
    expect(await rsaVerify(PUB_PEM, 'original', buf.toString('base64'))).toBe(false)
  })

  it('JWK 形态与 PEM 形态签名互通', async () => {
    const sig = await rsaSign(JSON.stringify(PRIV_JWK), 'cross form')
    expect(await rsaVerify(PUB_PEM, 'cross form', sig)).toBe(true)
  })

  it('给公钥去签名 → 明确报错', async () => {
    await expect(rsaSign(PUB_PEM, 'x')).rejects.toThrow(/私钥/)
  })
})
