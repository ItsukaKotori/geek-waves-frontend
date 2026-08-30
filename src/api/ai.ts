/**
 * AI 流式解读接口。后端返回 SSE(每帧 `data: <text>`,结束帧 `data: __DONE__`),
 * 不使用 axios(SSE 携带数据帧无标准 JSON 包裹),直接 fetch + ReadableStream。
 */
export async function analyzeAI(
  id: string | number,
  force: boolean,
  onChunk: (text: string) => void,
): Promise<void> {
  const resp = await fetch(`/api/ai/analyze/${id}?force=${force}`, {
    method: 'POST',
  })
  if (!resp.ok) throw new Error(await messageOf(resp, 'AI 请求失败'))
  if (!resp.body) throw new Error('网络错误:无响应流')

  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let pending = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    pending += decoder.decode(value, { stream: true })
    const frames = pending.split('\n\n')
    pending = frames.pop() ?? ''
    for (const frame of frames) {
      const lines: string[] = []
      for (const line of frame.split('\n')) {
        if (!line.startsWith('data:')) continue
        lines.push(line.slice(5).trim())
      }
      if (!lines.length) continue
      const payload = lines.join('\n')
      if (payload === '__DONE__') return
      onChunk(payload)
    }
  }
}

async function messageOf(resp: Response, fallback: string): Promise<string> {
  try {
    const j = await resp.json()
    if (j && typeof j.message === 'string' && j.message) return j.message
  } catch {
    // 非 JSON 响应,忽略
  }
  return fallback
}
