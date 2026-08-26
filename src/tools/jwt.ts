import { base64Decode } from './encodeDecode'

export interface ParsedJwt {
  header: any
  payload: any
  exp?: number
  expired: boolean
}

export function parseJwt(token: string): ParsedJwt {
  const parts = token.split('.')
  if (parts.length !== 3) throw new Error(`Invalid JWT: expected 3 parts, got ${parts.length}`)
  const header = JSON.parse(base64Decode(parts[0]))
  const payload = JSON.parse(base64Decode(parts[1]))
  const exp = typeof payload.exp === 'number' ? payload.exp : undefined
  const expired = exp !== undefined && exp * 1000 < Date.now()
  return { header, payload, exp, expired }
}
