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

/**
 * 触发后端重新生成 AI 解读(即 refresh-ai = analyze+force)。
 * 后端以 SSE 返回:本函数仅触发并消费完流,等待生成完成即解析结束,
 * 完成后调用方自行 fetchNewsDetail 重新拉取 summary。
 */
export async function refreshAi(id: string | number): Promise<void> {
  const resp = await fetch(`/api/news/${id}/refresh-ai`, { method: 'POST' })
  if (!resp.ok) throw new Error(await messageOf(resp, 'AI 重新生成失败'))
  await drain(resp)
}

async function drain(resp: Response): Promise<void> {
  if (!resp.body) return
  const reader = resp.body.getReader()
  try {
    for (;;) {
      const { done } = await reader.read()
      if (done) break
    }
  } finally {
    reader.releaseLock()
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
