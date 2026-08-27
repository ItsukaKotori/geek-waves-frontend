import { describe, expect, it } from 'vitest'
import { formatJson } from '../jsonUtils'
import { tsToDate, dateToTs } from '../timestamp'
import { base64Encode, base64Decode } from '../encodeDecode'
import { hashValue, uuid4 } from '../hashUuid'
import { radixConvert } from '../radix'
import { parseJwt } from '../jwt'

const pad = (n: number) => String(n).padStart(2, '0')

const localStr = (ts: number) => {
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

describe('tools', () => {
  it('formatJson:格式化并保留换行缩进', () => {
    expect(formatJson('{"a":1,"b":[1,2]}')).toContain('\n')
    expect(JSON.parse(formatJson('{"a":1}'))).toEqual({ a: 1 })
  })

  it('formatJson:非法 JSON 抛异常', () => {
    expect(() => formatJson('{')).toThrow()
    expect(() => formatJson('not json')).toThrow()
  })

  it('tsToDate:本地时区 YYYY-MM-DD HH:mm:ss', () => {
    expect(tsToDate(0)).toBe(localStr(0))
    expect(tsToDate(0)).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  })

  it('tsToDate:10 位秒与 13 位毫秒自适应', () => {
    const testTs = 1700000000
    expect(tsToDate(testTs)).toBe(localStr(testTs * 1000))
    expect(tsToDate(testTs * 1000)).toBe(localStr(testTs * 1000))
  })

  it('dateToTs:返回秒与毫秒', () => {
    expect(dateToTs(new Date(0))).toEqual({ s: 0, ms: 0 })
    expect(dateToTs(new Date(1234567890))).toEqual({ s: 1234567, ms: 1234567890 })
  })

  it('base64:UTF-8 往返(含 emoji)', () => {
    const s = '你好 GeekWaves 🚀'
    expect(base64Decode(base64Encode(s))).toBe(s)
  })

  it('base64:已知向量', () => {
    expect(base64Encode('hello')).toBe('aGVsbG8=')
    expect(base64Decode('aGVsbG8=')).toBe('hello')
    expect(base64Decode('5L2g5aW9')).toBe('你好')
  })

  it('base64:非法输入抛异常', () => {
    expect(() => base64Decode('%^$&')).toThrow()
  })

  it('hash:各算法长度正确', async () => {
    expect(await hashValue('hello', 'MD5')).toHaveLength(32)
    expect(await hashValue('hello', 'SHA-1')).toHaveLength(40)
    expect(await hashValue('hello', 'SHA-256')).toHaveLength(64)
    expect(await hashValue('hello', 'SHA-512')).toHaveLength(128)
  })

  it('hash:hex 小写且 MD5 结果正确', async () => {
    expect(await hashValue('hello', 'MD5')).toBe('5d41402abc4b2a76b9719d911017c592')
  })

  it('hash:相同输入相同输出', async () => {
    expect(await hashValue('abc', 'SHA-256')).toBe(await hashValue('abc', 'SHA-256'))
  })

  it('uuid4:数量/唯一/格式(标准带横线)', () => {
    const u = uuid4(5)
    expect(u).toHaveLength(5)
    expect(new Set(u).size).toBe(5)
    for (const id of u) {
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      )
    }
  })

  it('radix:16↔2 往返', () => {
    expect(radixConvert('ff', 16, 2)).toBe('11111111')
    expect(radixConvert('11111111', 2, 16)).toBe('ff')
  })

  it('radix:大小写/前导符/其他进制', () => {
    expect(radixConvert('FF', 16, 10)).toBe('255')
    expect(radixConvert('-ff', 16, 2)).toBe('-11111111')
    expect(radixConvert('z', 36, 10)).toBe('35')
  })

  it('radix:非法进制与非法数字抛异常', () => {
    expect(() => radixConvert('1', 1, 10)).toThrow()
    expect(() => radixConvert('1', 37, 10)).toThrow()
    expect(() => radixConvert('2', 2, 10)).toThrow()
    expect(() => radixConvert('', 10, 2)).toThrow()
  })

  it('parseJwt:header/payload/exp 解析', () => {
    const token = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMiLCJleHAiOjQxMDAwMDAwMDB9.sig'
    const parsed = parseJwt(token)
    expect(parsed.header.alg).toBe('HS256')
    expect(parsed.payload.sub).toBe('123')
    expect(parsed.exp).toBe(4100000000)
    expect(parsed.expired).toBe(false)
  })

  it('parseJwt:exp 为过去时间时 expired=true', () => {
    const past = 'eyJhbGciOiJIUzI1NiJ9.eyJleHAiOjF9.sig'
    expect(parseJwt(past).expired).toBe(true)
  })

  it('parseJwt:无 exp 字段时 expired=false', () => {
    const noExp = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.sig'
    const parsed = parseJwt(noExp)
    expect(parsed.payload.sub).toBe('123')
    expect(parsed.expired).toBe(false)
    expect(parsed.exp).toBeUndefined()
  })
})
