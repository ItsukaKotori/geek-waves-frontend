import type { HttpCommand, HttpResult } from '../types'
import { post } from './http'
import { toNumber } from './normalize'

export async function httpRequest(cmd: HttpCommand): Promise<HttpResult> {
  const raw = await post<HttpResult>('/tools/http-request', cmd)
  return {
    ...raw,
    status: toNumber(raw.status),
    tookMs: toNumber(raw.tookMs),
  }
}
