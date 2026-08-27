/// <reference lib="webworker" />
import { hashChunks } from '../../tools/hashUuid'

/**
 * 文件哈希 Worker(FE5):file.stream() 在此线程单趟流式读取,
 * 主线程零卡顿;增量状态由 hashChunks 统一维护,
 * 一次遍历同时产出 MD5 / SHA-1 / SHA-256 / SHA-512。
 * 协议:{ id, file } → { id, ok:true, digests } 或 { id, ok:false, message }
 */

interface HashFileRequest {
  id: number
  file: File
}

async function* streamChunks(file: File): AsyncGenerator<Uint8Array> {
  const reader = file.stream().getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) return
    yield value
  }
}

self.onmessage = (ev: MessageEvent<HashFileRequest>): void => {
  const { id, file } = ev.data
  void (async () => {
    try {
      const digests = await hashChunks(streamChunks(file))
      self.postMessage({ id, ok: true, digests })
    } catch (err) {
      self.postMessage({
        id,
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      })
    }
  })()
}
