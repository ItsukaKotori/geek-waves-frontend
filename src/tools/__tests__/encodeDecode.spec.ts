// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  base64Decode,
  decodeUtf8Strict,
  hexEncode,
  hexDecode,
} from '../encodeDecode'
import { parseDataUrl, sniffImageSize } from '../imageInfo'

describe('hexEncode / hexDecode', () => {
  it('已知向量:UTF-8 字节序小写输出', () => {
    expect(hexEncode('hello')).toBe('68656c6c6f')
    expect(hexEncode('你好')).toBe('e4bda0e5a5bd')
    expect(hexEncode('')).toBe('')
  })

  it('往返一致(含 emoji 代理对)', () => {
    const s = 'GeekWaves 🚀 中文'
    expect(hexDecode(hexEncode(s))).toBe(s)
  })

  it('解码容忍空格 / 冒号 / 换行分隔与大小写混排', () => {
    expect(hexDecode('68 65 6C 6C 6F')).toBe('hello')
    expect(hexDecode('e4:bd:a0:e5:a5:bd')).toBe('你好')
    expect(hexDecode('E4\nBD\nA0')).toBe('你')
    expect(hexDecode('')).toBe('')
  })

  it('非法字符与奇数长度抛错', () => {
    expect(() => hexDecode('zz')).toThrow(/非法的十六进制输入/)
    expect(() => hexDecode('abc')).toThrow(/非法的十六进制输入/)
    expect(() => hexDecode('6')).toThrow(/非法的十六进制输入/)
  })
})

describe('decodeUtf8Strict fatal 诊断', () => {
  it('合法 UTF-8 原样返回', () => {
    expect(decodeUtf8Strict(new TextEncoder().encode('你好 🚀'))).toBe('你好 🚀')
  })

  it('被截断的多字节序列抛「疑似编码不符」而非输出乱码', () => {
    // '好' = e5 a5 bd;截断到两字节即成为非法序列
    const bytes = new TextEncoder().encode('你好').slice(0, 4)
    expect(() => decodeUtf8Strict(bytes)).toThrow(/疑似编码不符/)
  })

  it('孤立续字节抛「疑似编码不符」', () => {
    expect(() => decodeUtf8Strict(new Uint8Array([0x80]))).toThrow(/疑似编码不符/)
  })

  it('base64 解码路径接入同一诊断', () => {
    // btoa(Uint8Array [0xe4,0xbd]) 语义值:e4bd → '5Ls='
    expect(() => base64Decode('5Ls=')).toThrow(/疑似编码不符/)
  })
})

describe('parseDataUrl', () => {
  it('解析 mime 与字节负载', () => {
    const png1x1 =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    const parsed = parseDataUrl(png1x1)
    expect(parsed).not.toBeNull()
    expect(parsed!.mime).toBe('image/png')
    expect(parsed!.bytes.length).toBeGreaterThan(20)
  })

  it('非 dataURL 返回 null', () => {
    expect(parseDataUrl('hello world')).toBeNull()
    expect(parseDataUrl('data:text/plain;charset=utf-8,' + btoa('hi'))).not.toBeNull()
    // 负载全部为非法 base64 字符时判为损坏
    expect(parseDataUrl('data:image/jpeg;base64,/%$&')).toBeNull()
  })

  it('纯文本 dataURL 的负载按原文取字节', () => {
    const parsed = parseDataUrl('data:image/svg+xml,%3Csvg/%3E')
    expect(parsed?.mime).toBe('image/svg+xml')
  })
})

describe('sniffImageSize 二进制嗅探尺寸', () => {
  const be32 = (n: number) =>
    new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255])

  it('PNG:IHDR 宽高(big-endian)', () => {
    const buf = new Uint8Array([
      ...[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
      0, 0, 0, 13,
      ...new TextEncoder().encode('IHDR'),
      ...be32(1920),
      ...be32(1080),
      8, 6, 0, 0, 0,
    ])
    expect(sniffImageSize(buf)).toEqual({ width: 1920, height: 1080 })
  })

  it('GIF( little-endian @6/@8 )', () => {
    const head = new TextEncoder().encode('GIF89a')
    const buf = new Uint8Array([...head, 0x20, 0x00, 0xe0, 0x01, 0, 0])
    expect(sniffImageSize(buf)).toEqual({ width: 32, height: 480 })
  })

  it('BMP(le32 @18/@22,高度可负)', () => {
    const le32 = (n: number) =>
      new Uint8Array([n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255])
    const full = new Uint8Array(26)
    full.set(Buffer.from('BM'), 0)
    // 高度写为负值(top-down 位图),嗅探应取绝对值
    full.set(le32(-50), 22)
    full.set(le32(100), 18)
    expect(sniffImageSize(full)).toEqual({ width: 100, height: 50 })
  })

  it('JPEG:SOF 段前有 EXIF 等杂段也能定位宽高', () => {
    const mkSeg = (marker: number, payload: Uint8Array): Uint8Array => {
      const seg = new Uint8Array(payload.length + 4)
      seg[0] = 0xff
      seg[1] = marker
      seg[2] = ((payload.length + 2) >> 8) & 0xff
      seg[3] = (payload.length + 2) & 0xff
      seg.set(payload, 4)
      return seg
    }
    const app1 = mkSeg(0xe1, new Uint8Array([...new TextEncoder().encode('Exif\0\0'), 1, 2, 3]))
    // SOF0:precision=1, height=720(0x02d0), width=1280(0x0500)
    const sof0 = mkSeg(0xc0, new Uint8Array([1, 0x02, 0xd0, 0x05, 0x00]))
    const j = new Uint8Array([0xff, 0xd8, ...app1, ...sof0])
    expect(sniffImageSize(j)).toEqual({ width: 1280, height: 720 })
  })

  it('未知格式返回 null', () => {
    expect(sniffImageSize(new Uint8Array([1, 2, 3, 4, 5, 6]))).toBeNull()
    expect(sniffImageSize(new Uint8Array())).toBeNull()
  })

  it('端到端:dataURL → 嗅探出 PNG 尺寸', () => {
    const raw = new Uint8Array([
      ...[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
      0, 0, 0, 13,
      ...new TextEncoder().encode('IHDR'),
      ...be32(7),
      ...be32(9),
      8, 6, 0, 0, 0,
    ])
    const url = `data:image/png;base64,${Buffer.from(raw).toString('base64')}`
    const parsed = parseDataUrl(url)
    expect(sniffImageSize(parsed!.bytes)).toEqual({ width: 7, height: 9 })
  })
})

describe('错误文案中文化(行内错误统一口径)', () => {
  it('非法 Base64 字符给中文提示', () => {
    expect(() => base64Decode('!!!')).toThrow(/非法的 Base64 输入/)
    expect(() => base64Decode('GeekWaves 工具中心')).toThrow(/非法的 Base64 输入/)
  })

  it('奇数长度 / 非法字符的 hex 给全中文提示', () => {
    expect(() => hexDecode('abc')).toThrow(/非法的十六进制输入:需要成对的十六进制字符/)
    expect(() => hexDecode('zz')).toThrow(/非法的十六进制输入:需要成对的十六进制字符/)
  })
})
