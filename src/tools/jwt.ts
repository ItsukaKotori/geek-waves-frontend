/**
 * JWT 解析纯函数层(FE6 扩展):
 * - base64url 容错解码复用 encodeDecode(容忍 -_ 与缺省 padding)
 * - alg 安全分级:none / 非法形态为危险级;注册表外或大小写不符为可疑级
 * - iat/nbf/exp 人性化:绝对 ISO(UTC)+ 中文相对时间双显(复用 timestamp 纯层)
 */
import { base64Decode } from './encodeDecode'
import { formatInstant, formatRelative } from './timestamp'

export interface ParsedJwt {
  header: any
  payload: any
  exp?: number
  expired: boolean
  /** alg 安全分级结果(含原始算法名与说明) */
  assessment: AlgAssessment
  /** 第三段签名为空串(unsigned token 常见形态) */
  signatureEmpty: boolean
}

export function parseJwt(token: string): ParsedJwt {
  const parts = token.split('.')
  if (parts.length !== 3) throw new Error(`Invalid JWT: expected 3 parts, got ${parts.length}`)
  const header = JSON.parse(base64Decode(parts[0]))
  const payload = JSON.parse(base64Decode(parts[1]))
  const exp = toFiniteSeconds(payload?.exp)
  const expired = exp !== undefined && exp * 1000 < Date.now()
  return {
    header,
    payload,
    exp,
    expired,
    assessment: assessAlg(header?.alg),
    signatureEmpty: parts[2] === '',
  }
}

/* -------------------------------------------------------------------------- */
/* alg 安全分级                                                                 */
/* -------------------------------------------------------------------------- */

export type AlgRiskLevel = 'safe' | 'caution' | 'danger'

export interface AlgAssessment {
  /** 原样透出的算法名(header.alg 可能非字符串) */
  alg: string
  level: AlgRiskLevel
  note: string
}

/** RFC 7518 JWA 注册的签名算法(RFC 8037 补充 EdDSA) */
const REGISTERED_JWA = [
  'HS256', 'HS384', 'HS512',
  'RS256', 'RS384', 'RS512',
  'ES256', 'ES384', 'ES512',
  'PS256', 'PS384', 'PS512',
  'EdDSA',
] as const

/** JWA 家族前缀形态(用于识别「像算法但写错」的场景) */
const JWA_SHAPE = /^(HS|RS|ES|PS)\d{3}$|^EdDSA$/i

/**
 * alg 分级:
 * - danger:'none'(大小写不敏感)或缺失/非字符串——无法建立可信验签前提
 * - caution:未在注册表精确命中(大小写笔误如 hs256、未知名称如 FAKE999)
 * - safe:JWA 注册表精确匹配(HS256 起步即本工具认定的最低对称强度)
 */
export function assessAlg(alg: unknown): AlgAssessment {
  const shown = typeof alg === 'string' ? alg : String(alg)
  if (typeof alg !== 'string' || alg === '') {
    const reason = alg === undefined || alg === null ? '缺少 alg' : `非法 alg 类型:${typeof alg}`
    return { alg: shown, level: 'danger', note: `${reason},无法确定签名方式` }
  }
  if (alg.toLowerCase() === 'none') {
    return { alg, level: 'danger', note: 'none 算法不做任何签名校验' }
  }
  if ((REGISTERED_JWA as readonly string[]).includes(alg)) {
    return { alg, level: 'safe', note: 'RFC 7518 已注册签名算法' }
  }
  if (JWA_SHAPE.test(alg)) {
    return { alg, level: 'caution', note: '算法名疑似笔误(JWA 名称区分大小写)' }
  }
  return { alg, level: 'caution', note: '非 JWA 注册表内的未知算法' }
}

/* -------------------------------------------------------------------------- */
/* 时间声明人性化                                                                */
/* -------------------------------------------------------------------------- */

export type TimeClaimName = 'iat' | 'nbf' | 'exp'

export interface HumanTimeClaim {
  claim: TimeClaimName
  /** 归一化后的秒级时间戳(小数向下取整) */
  s: number
  /** 绝对时间:UTC ISO8601(与系统时区无关,断言稳定) */
  iso: string
  /** 相对时间:「X 前 / X 后 / 刚刚」 */
  relative: string
}

/** claim 值宽容解析:有限数值/数值字符串均可,其余一律视为缺失 */
function toFiniteSeconds(raw: unknown): number | undefined {
  let n: number
  if (typeof raw === 'number') n = raw
  else if (typeof raw === 'string' && raw.trim() !== '') n = Number(raw)
  else return undefined
  if (!Number.isFinite(n)) return undefined
  return Math.floor(n)
}

/**
 * 把秒级时间戳声明转成 绝对 ISO + 相对时间 双显。
 * nowMs 注入相对时间基准(测试用);缺省取当前时间。非法值返回 null。
 */
export function humanizeTimeClaim(
  claim: TimeClaimName,
  raw: unknown,
  nowMs?: number,
): HumanTimeClaim | null {
  const s = toFiniteSeconds(raw)
  if (s === undefined) return null
  const ms = s * 1000
  return {
    claim,
    s,
    iso: formatInstant(ms).iso,
    relative: formatRelative(ms, nowMs ?? Date.now()),
  }
}

/** 从 payload 抽取全部可用的时间声明(iat → nbf → exp 固定顺序) */
export function extractTimeClaims(payload: unknown, nowMs?: number): HumanTimeClaim[] {
  const out: HumanTimeClaim[] = []
  if (payload === null || typeof payload !== 'object') return out
  const p = payload as Record<string, unknown>
  for (const name of ['iat', 'nbf', 'exp'] as const) {
    const h = humanizeTimeClaim(name, p[name], nowMs)
    if (h) out.push(h)
  }
  return out
}
