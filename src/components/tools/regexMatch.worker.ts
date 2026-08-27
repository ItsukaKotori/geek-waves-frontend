/// <reference lib="webworker" />
import { scanMatches, truncateInput } from '../../tools/regexMatch'

/**
 * 正则匹配 Worker(FE4):同步执行的 RegExp 在此线程运行,
 * 主线程由 regexMatchClient 以 1s 护栏 terminate 防灾难性回溯卡死页面。
 * 协议:{ id, pattern, flags, text } → { id, ok, matches, capped, truncated, originalLength }
 * 或 { id, ok:false, message }(非法正则等)。
 */

interface MatchRequest {
  id: number
  pattern: string
  flags: string
  text: string
}

self.onmessage = (ev: MessageEvent<MatchRequest>): void => {
  const { id, pattern, flags, text } = ev.data
  try {
    const trimmed = truncateInput(text)
    const scanned = scanMatches(pattern, flags, trimmed.text)
    self.postMessage({
      id,
      ok: true,
      matches: scanned.matches,
      capped: scanned.capped,
      truncated: trimmed.truncated,
      originalLength: trimmed.originalLength,
    })
  } catch (err) {
    self.postMessage({
      id,
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    })
  }
}
