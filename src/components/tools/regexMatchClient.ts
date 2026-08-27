import type { RegexMatchRecord } from '../../tools/regexMatch'

/**
 * 正则 Worker 编排(FE4 ReDoS 护栏核心):
 * - 每个请求携带完整快照(pattern/flags/text)一次性发给 Worker(状态原子)
 * - 主线程 1s 护栏:超时 terminate 并回报 catastrophic
 * - 新请求到达即终止在途 Worker 并重建,杜绝旧结果串扰(superseded)
 * - 回复以请求 id 关联,过期回复一律丢弃
 *
 * Worker 经 factory 注入:生产默认走 Vite 的 new URL(import.meta.url) 构造,
 * 测试注入假 Worker 即可在无浏览器环境下验证全部编排行为。
 */

export interface WorkerLike {
  postMessage(msg: unknown): void
  terminate(): void
  onmessage: ((ev: { data: unknown }) => void) | null
  onerror?: ((ev: unknown) => void) | null
}

export type WorkerFactory = () => WorkerLike

export interface RegexRunRequest {
  pattern: string
  flags: string
  text: string
}

export interface RegexOkPayload {
  matches: RegexMatchRecord[]
  capped: boolean
  truncated: boolean
  originalLength: number
}

export type RegexRunOutcome =
  | { kind: 'ok'; payload: RegexOkPayload }
  | { kind: 'invalid'; message: string }
  | { kind: 'catastrophic' }
  | { kind: 'superseded' }

/** 灾难性回溯护栏超时(brief 硬性值 1s) */
export const REGEX_GUARD_TIMEOUT_MS = 1000

export function defaultWorkerFactory(): WorkerLike {
  // DOM 的 MessageEvent 是 { data } 的超集(W3C 结构),此处收敛为客户端协议所需的窄视图
  return new Worker(new URL('./regexMatch.worker.ts', import.meta.url), {
    type: 'module',
  }) as unknown as WorkerLike
}

interface PendingRun {
  id: number
  resolve: (outcome: RegexRunOutcome) => void
}

export interface RegexClient {
  run(req: RegexRunRequest): Promise<RegexRunOutcome>
  dispose(): void
}

export function createRegexClient(factory: WorkerFactory = defaultWorkerFactory): RegexClient {
  let worker: WorkerLike | null = null
  let seq = 0
  let pending: PendingRun | null = null
  let guardTimer: ReturnType<typeof setTimeout> | undefined

  function settle(outcome: RegexRunOutcome): void {
    if (guardTimer !== undefined) {
      clearTimeout(guardTimer)
      guardTimer = undefined
    }
    if (pending) {
      pending.resolve(outcome)
      pending = null
    }
  }

  function clearWorker(): void {
    worker = null
  }

  function spawn(): WorkerLike {
    const w = factory()
    w.onmessage = (ev: { data: unknown }) => {
      const data = ev.data as { id?: unknown } | null
      // 过期/串扰回复丢弃(该 worker 只可能挂着当前 pending 或已被终止)
      if (!data || data.id !== pending?.id) return
      const body = data as Omit<RegexOkPayload & { ok: boolean; message?: string }, never>
      if (body && body.ok === true) {
        settle({
          kind: 'ok',
          payload: {
            matches: body.matches as RegexMatchRecord[],
            capped: body.capped === true,
            truncated: body.truncated === true,
            originalLength: Number(body.originalLength ?? 0),
          },
        })
      } else {
        settle({ kind: 'invalid', message: String((body as { message?: string })?.message ?? '正则表达式非法') })
      }
    }
    w.onerror = () => {
      clearWorker()
      settle({ kind: 'catastrophic' })
    }
    return w
  }

  function killPending(asSuperseded: boolean): void {
    if (worker) {
      worker.terminate()
      clearWorker()
    }
    settle({ kind: asSuperseded ? 'superseded' : 'catastrophic' })
  }

  function run(req: RegexRunRequest): Promise<RegexRunOutcome> {
    seq++
    const id = seq
    if (pending !== null || guardTimer !== undefined) {
      // 在途未完成:旧 Worker 必须终止(同步回溯无法软取消),重建后派发最新快照
      killPending(true)
    }
    worker = spawn()
    const promise = new Promise<RegexRunOutcome>((resolve) => {
      pending = { id, resolve }
    })
    worker.postMessage({ id, ...req })
    guardTimer = setTimeout(() => {
      guardTimer = undefined
      killPending(false)
    }, REGEX_GUARD_TIMEOUT_MS)
    return promise
  }

  function dispose(): void {
    if (pending !== null || guardTimer !== undefined) killPending(true)
    else if (worker) worker.terminate()
    worker = null
  }

  return { run, dispose }
}
