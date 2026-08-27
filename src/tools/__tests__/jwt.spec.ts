import { describe, expect, it } from 'vitest'
import { assessAlg, humanizeTimeClaim, parseJwt } from '../jwt'

const NOW_S = 1_700_000_000 // 2023-11-14T22:13:20Z

describe('alg 安全分级', () => {
  it('none 算法为危险级(大小写不敏感)', () => {
    expect(assessAlg('none').level).toBe('danger')
    expect(assessAlg('None').level).toBe('danger')
    expect(assessAlg('NONE').level).toBe('danger')
  })

  it('缺失/非字符串 alg 为危险级', () => {
    expect(assessAlg(undefined).level).toBe('danger')
    expect(assessAlg(null).level).toBe('danger')
    expect(assessAlg(123).level).toBe('danger')
  })

  it('注册表精确匹配为安全级(HS256 起步及所有标准非对称族)', () => {
    for (const alg of ['HS256', 'HS384', 'HS512', 'RS256', 'ES256', 'PS384', 'EdDSA']) {
      expect(assessAlg(alg).level, alg).toBe('safe')
    }
  })

  it('形态像 JWA 但大小写不符(如 hs256)降级为可疑', () => {
    expect(assessAlg('hs256').level).toBe('caution')
    expect(assessAlg('rs512').level).toBe('caution')
  })

  it('未知算法名为可疑级(空串等同缺失归危险级)', () => {
    expect(assessAlg('HS999').level).toBe('caution')
    expect(assessAlg('FAKE').level).toBe('caution')
    expect(assessAlg('').level).toBe('danger')
  })

  it('assessment 携带原始算法名与说明', () => {
    const a = assessAlg('none')
    expect(a.alg).toBe('none')
    expect(a.note.length).toBeGreaterThan(0)
  })
})

describe('时间声明人性化(iat/nbf/exp 相对+绝对双显)', () => {
  it('iat 返回 ISO 绝对时间与中文相对时间', () => {
    const h = humanizeTimeClaim('iat', NOW_S - 3600, NOW_S * 1000)!
    expect(h.claim).toBe('iat')
    expect(h.s).toBe(NOW_S - 3600)
    expect(h.iso).toBe('2023-11-14T21:13:20Z')
    expect(h.relative).toBe('1 小时前')
  })

  it('exp 未来时间为「X 后」', () => {
    const h = humanizeTimeClaim('exp', NOW_S + 60, NOW_S * 1000)!
    expect(h.relative).toBe('1 分钟后')
  })

  it('数值字符串容忍(部分签发方用字符串承载声明)', () => {
    const h = humanizeTimeClaim('nbf', String(NOW_S + 86400), NOW_S * 1000)!
    expect(h.s).toBe(NOW_S + 86400)
    expect(h.iso).toBe('2023-11-15T22:13:20Z')
  })

  it('秒级小数向下取整', () => {
    expect(humanizeTimeClaim('iat', NOW_S - 90.9, NOW_S * 1000)!.relative).toBe('1 分钟前')
  })

  it('非法值返回 null:布尔/对象/空白串/NaN 等', () => {
    expect(humanizeTimeClaim('exp', undefined)).toBeNull()
    expect(humanizeTimeClaim('exp', null)).toBeNull()
    expect(humanizeTimeClaim('exp', true)).toBeNull()
    expect(humanizeTimeClaim('exp', { a: 1 })).toBeNull()
    expect(humanizeTimeClaim('exp', [])).toBeNull()
    expect(humanizeTimeClaim('exp', '')).toBeNull()
    expect(humanizeTimeClaim('exp', 'abc')).toBeNull()
    expect(humanizeTimeClaim('exp', Number.NaN)).toBeNull()
    expect(humanizeTimeClaim('exp', Number.POSITIVE_INFINITY)).toBeNull()
  })
})

describe('parseJwt 扩展(alg 分级 / 空签名检测 / 声明人性化)', () => {
  const b64 = (o: unknown) =>
    Buffer.from(JSON.stringify(o)).toString('base64url')

  it('返回 alg 分级结果与未验签基线信息', () => {
    const p = parseJwt(`${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u' })}.sig`)
    expect(p.assessment.level).toBe('safe')
    expect(p.signatureEmpty).toBe(false)
  })

  it('alg none 或签名为空段 → signatureEmpty/危险分级可见', () => {
    const noneTok = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: 'u' })}.`
    const p = parseJwt(noneTok)
    expect(p.assessment.level).toBe('danger')
    expect(p.signatureEmpty).toBe(true)
  })

  it('字符串型 exp 参与 expired 判定', () => {
    const past = `${b64({ alg: 'HS256' })}.${b64({ exp: '1' })}.sig`
    expect(parseJwt(past).expired).toBe(true)
    const future = `${b64({ alg: 'HS256' })}.${b64({ exp: '4102444800' })}.sig`
    expect(parseJwt(future).expired).toBe(false)
  })
})
