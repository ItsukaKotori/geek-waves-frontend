import type { FileHashes } from '../../tools/hashUuid'
import type { WorkerFactory, WorkerLike } from './regexMatchClient'

/**
 * 文件哈希 Worker 编排(FE5,复用 RegexMatch 的 client 缝模式):
 * - 请求携带完整快照(file)一次性发给 Worker
 * - 新请求到达即终止在途 Worker 并重建(大文件流无法软取消),旧结果以 id 校验丢弃
 * - 无超时护栏:哈希耗时与文件体积线性相关属正常现象
 *
 * Worker 经 factory 注入:生产默认走 Vite 的 new URL(import.meta.url) 构造,
 * 测试注入假 Worker 即可在无浏览器环境下验证全部编排行为。
 */

export function defaultHashFileWorkerFactory(): WorkerLike {
  return new Worker(new URL('./hashFile.worker.ts', import.meta.url), {
    type: 'module',
  }) as unknown as WorkerLike
}

export type FileHashOutcome =
  | { kind: 'ok'; digests: FileHashes }
  | { kind: 'error'; message: string }
  | { kind: 'superseded' }

export interface HashFileClient {
  run(file: File): Promise<FileHashOutcome>
  dispose(): void
}

export function createHashFileClient(
  factory: WorkerFactory = defaultHashFileWorkerFactory,
): HashFileClient {
  let worker: WorkerLike | null = null
  let seq = 0
  let pending: { id: number; resolve: (outcome: FileHashOutcome) => void } | null = null

  function settle(outcome: FileHashOutcome): void {
    if (pending) {
      pending.resolve(outcome)
      pending = null
    }
  }

  function spawn(): WorkerLike {
    const w = factory()
    w.onmessage = (ev: { data: unknown }) => {
      const data = ev.data as { id?: unknown; ok?: unknown; digests?: unknown; message?: unknown } | null
      if (!data || data.id !== pending?.id) return
      if (data.ok === true && data.digests) {
        settle({ kind: 'ok', digests: data.digests as FileHashes })
      } else {
        settle({ kind: 'error', message: String(data.message ?? '文件哈希失败') })
      }
    }
    w.onerror = () => {
      worker?.terminate()
      worker = null
      settle({ kind: 'error', message: '文件读取失败,请重试' })
    }
    return w
  }

  function run(file: File): Promise<FileHashOutcome> {
    seq++
    const id = seq
    if (pending !== null) {
      worker?.terminate()
      worker = null
      pending.resolve({ kind: 'superseded' })
      pending = null
    }
    if (worker === null) worker = spawn()
    const promise = new Promise<FileHashOutcome>((resolve) => {
      pending = { id, resolve }
    })
    worker.postMessage({ id, file })
    return promise
  }

  function dispose(): void {
    if (pending !== null) {
      worker?.terminate()
      worker = null
      pending.resolve({ kind: 'superseded' })
      pending = null
    } else if (worker) {
      worker.terminate()
      worker = null
    }
  }

  return { run, dispose }
}
