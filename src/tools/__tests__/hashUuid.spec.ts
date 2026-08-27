import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import {
  formatHex,
  hashChunks,
  hashValue,
  uuid7,
  type HexDisplayOptions,
} from '../hashUuid'

const chunkify = (bytes: Uint8Array, sizes: number[]): Uint8Array[] => {
  const out: Uint8Array[] = []
  let i = 0
  for (const s of sizes) {
    if (i >= bytes.length) break
    out.push(bytes.subarray(i, i + s))
    i += s
  }
  if (i < bytes.length) out.push(bytes.subarray(i))
  return out
}

const nodeHex = (algo: 'md5' | 'sha1' | 'sha256' | 'sha512', data: Buffer) =>
  createHash(algo).update(data).digest('hex')

describe('hashChunks 单趟分块多算法', () => {
  const expectations = (buf: Buffer) => ({
    MD5: nodeHex('md5', buf),
    'SHA-1': nodeHex('sha1', buf),
    'SHA-256': nodeHex('sha256', buf),
    'SHA-512': nodeHex('sha512', buf),
  })

  it('空输入得到标准全零向量', async () => {
    expect(await hashChunks([])).toEqual(expectations(Buffer.alloc(0)))
    expect((await hashChunks([])).MD5).toBe('d41d8cd98f00b204e9800998ecf8427e')
  })

  it('与 node:crypto 各算法结果一致(单块)', async () => {
    const buf = Buffer.from('hello world')
    expect(await hashChunks([new Uint8Array(buf)])).toEqual(expectations(buf))
  })

  it('奇数块边界切分不影响结果(与整块一致)', async () => {
    const buf = Buffer.from('GeekWaves'.repeat(999) + '!tail')
    const whole = await hashChunks([new Uint8Array(buf)])
    const oddChunks = await hashChunks(chunkify(new Uint8Array(buf), [7, 1, 13, 3000, 2]))
    const manyTiny = await hashChunks(chunkify(new Uint8Array(buf), [1]))
    expect(oddChunks).toEqual(whole)
    expect(manyTiny).toEqual(whole)
  })

  it('异步可迭代输入同样支持(file.stream() 形态)', async () => {
    const buf = Buffer.from('abc'.repeat(10000))
    async function* gen(): AsyncGenerator<Uint8Array> {
      for (const c of chunkify(new Uint8Array(buf), [64 * 1024])) yield c
    }
    expect(await hashChunks(gen())).toEqual(await hashChunks([new Uint8Array(buf)]))
  })

  it('重复哈希同一流互不串扰(incremental 状态复用安全)', async () => {
    const buf = Buffer.from('stable input')
    const first = await hashChunks([new Uint8Array(buf)])
    const second = await hashChunks([new Uint8Array(buf)])
    expect(first).toEqual(second)
    expect(Object.keys(first).sort()).toEqual(['MD5', 'SHA-1', 'SHA-256', 'SHA-512'])
  })
})

describe('hashValue 文本路径含 SHA-3', () => {
  it('SHA3-256 空串已知向量', async () => {
    expect(await hashValue('', 'SHA3-256')).toBe(
      'a7ffc6f8bf1ed76651c14756a061d662f580ff4de43b49fa82d80a4b80f8434a',
    )
  })

  it('SHA3 系列:长度、确定性与区分度', async () => {
    const a = await hashValue('hello', 'SHA3-256')
    const b = await hashValue('hello', 'SHA3-512')
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(b).toMatch(/^[0-9a-f]{128}$/)
    expect(a).not.toBe(await hashValue('hello', 'SHA-256'))
    expect(a).toBe(await hashValue('hello', 'SHA3-256'))
  })

  it('原生算法不回归', async () => {
    expect(await hashValue('hello', 'MD5')).toBe('5d41402abc4b2a76b9719d911017c592')
  })
})

describe('uuid7(RFC 9562 时间戳排序版)', () => {
  it('格式符合 v7 位段(version=7 variant=10x)', () => {
    for (let i = 0; i < 20; i++) {
      expect(uuid7()[0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    }
  })

  it('唯一性', () => {
    const all = [...uuid7(50), ...uuid7(50)]
    expect(new Set(all).size).toBe(all.length)
  })

  it('时间前缀可排序:晚生成的字典序更大', () => {
    vi.useFakeTimers()
    const early = uuid7()[0]
    // 推进系统时钟 10ms 后再生成
    vi.setSystemTime(Date.now() + 10)
    const late = uuid7()[0]
    expect(late > (early ?? '')).toBe(true)
    // 高 48 位等于 unix 毫秒
    const hex = late.replace(/-/g, '')
    const ts48 = BigInt(`0x${hex.slice(0, 12)}`)
    expect(Number(ts48)).toBe(Date.now())
    vi.useRealTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('同一毫秒内多次生成也不重复且保持 v7 合法位', () => {
    const same = uuid7(100)
    expect(new Set(same).size).toBe(same.length)
  })
})

describe('formatHex 大小写 / 去横线选项', () => {
  const opts: Array<[string, HexDisplayOptions, string]> = [
    ['ab-cd', {}, 'ab-cd'],
    ['ab-cd', { stripDash: true }, 'abcd'],
    ['abcd', { upper: true }, 'ABCD'],
    ['ab-cd-ef', { stripDash: true, upper: true }, 'ABCDEF'],
    ['AB-cD', { upper: false }, 'AB-cD'],
  ]

  it.each(opts)('%s %j → %s', (input, o, expected) => {
    expect(formatHex(input, o)).toBe(expected)
  })

  it('UUID 横线去除后长度为 32 且大写生效', () => {
    const stripped = formatHex('123e4567-e89b-12d3-a456-426614174000', { stripDash: true })
    expect(stripped).toBe('123e4567e89b12d3a456426614174000')
    expect(formatHex(stripped, { upper: true })).toBe(stripped.toUpperCase())
  })

  it('默认不变换大小写也不去横线', () => {
    expect(formatHex('Aa-Bb')).toBe('Aa-Bb')
  })
})
