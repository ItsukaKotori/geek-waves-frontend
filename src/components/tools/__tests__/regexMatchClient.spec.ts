import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  REGEX_GUARD_TIMEOUT_MS,
  createRegexClient,
  type RegexRunOutcome,
  type WorkerLike,
} from '../regexMatchClient'

/** 可控假 Worker:记录 postMessage、可手动派发回复 */
class FakeWorker implements WorkerLike {
  static instances: FakeWorker[] = []

  posts: Array<Record<string, unknown>> = []
  terminated = false
  onmessage: ((ev: { data: unknown }) => void) | null = null

  constructor() {
    FakeWorker.instances.push(this)
  }

  postMessage(msg: unknown): void {
    this.posts.push(msg as Record<string, unknown>)
  }

  terminate(): void {
    this.terminated = true
  }

  /** 测试用:以给定 body 回复最近一次请求 */
  reply(body: Record<string, unknown>): void {
    const last = this.posts.at(-1)!
    this.onmessage?.({ data: { id: last.id, ...body } })
  }
}

const factory = (): WorkerLike => new FakeWorker()

function lastRequest(w: FakeWorker): Record<string, unknown> {
  return w.posts.at(-1)!
}

function flushMicrotasks(): Promise<void> {
  return Promise.resolve().then(() => {})
}

describe('regexMatchClient:Worker 编排', () => {
  beforeEach(() => {
    FakeWorker.instances.length = 0
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('发送完整快照(pattern/flags/text)并以 id 关联回复', async () => {
    const client = createRegexClient(factory)
    const p = client.run({ pattern: '\\d+', flags: '', text: 'a1b22' })
    await flushMicrotasks()
    const w = FakeWorker.instances[0]!
    expect(lastRequest(w)).toMatchObject({ pattern: '\\d+', flags: '', text: 'a1b22' })
    expect(typeof lastRequest(w).id).toBe('number')
    w.reply({ ok: true, matches: [], capped: false, truncated: false, originalLength: 5 })
    const out: RegexRunOutcome = await p
    expect(out.kind).toBe('ok')
    client.dispose()
  })

  it('回复到达后清除护栏计时器,超时不再误杀', async () => {
    const client = createRegexClient(factory)
    const p = client.run({ pattern: 'x', flags: '', text: 'x' })
    await flushMicrotasks()
    FakeWorker.instances[0]!.reply({ ok: true, matches: [], capped: false, truncated: false, originalLength: 1 })
    const out = await p
    expect(out.kind).toBe('ok')
    await vi.advanceTimersByTimeAsync(REGEX_GUARD_TIMEOUT_MS + 10)
    expect(FakeWorker.instances[0]!.terminated).toBe(false)
    client.dispose()
  })

  it('1s 超时 terminate 并报灾难性回溯', async () => {
    const client = createRegexClient(factory)
    const p = client.run({ pattern: '(a+)+$', flags: '', text: 'aaaaax' })
    await flushMicrotasks()
    const w = FakeWorker.instances[0]!
    const outcome = vi.advanceTimersByTimeAsync(REGEX_GUARD_TIMEOUT_MS).then(() => p)
    await vi.advanceTimersByTimeAsync(REGEX_GUARD_TIMEOUT_MS)
    const resolved: RegexRunOutcome = await outcome
    expect(resolved.kind).toBe('catastrophic')
    expect(w.terminated).toBe(true)
    client.dispose()
  })

  it('非法正则错误消息原样透传', async () => {
    const client = createRegexClient(factory)
    const p = client.run({ pattern: '[unclosed', flags: '', text: 'x' })
    await flushMicrotasks()
    FakeWorker.instances[0]!.reply({ ok: false, message: 'Invalid regular expression' })
    const out = await p
    expect(out).toEqual({ kind: 'invalid', message: 'Invalid regular expression' })
    client.dispose()
  })

  it('旧请求未完成时新请求进入:旧的标记 superseded 且其 Worker 被终止、换发最新快照', async () => {
    const client = createRegexClient(factory)
    const first = client.run({ pattern: 'A', flags: '', text: 'text-A' })
    await flushMicrotasks()
    const w0 = FakeWorker.instances[0]!
    const second = client.run({ pattern: 'B', flags: '', text: 'text-B' })
    await flushMicrotasks()
    const w1 = FakeWorker.instances[1]!
    expect(w0.terminated).toBe(true)
    // 新实例收到的是最新快照
    expect(lastRequest(w1)).toMatchObject({ pattern: 'B', flags: '', text: 'text-B' })
    // 旧回复晚到也不影响新结果流
    await flushMicrotasks()
    w1.reply({ ok: true, matches: [], capped: false, truncated: false, originalLength: 6 })
    await expect(second).resolves.toMatchObject({ kind: 'ok' })
    const firstOutcome = await first
    expect(firstOutcome.kind).toBe('superseded')
    client.dispose()
  })

  it('灾难性超时后的下一次运行仍可用(自动重建 Worker)', async () => {
    const client = createRegexClient(factory)
    void client.run({ pattern: '(a+)+$', flags: '', text: 'xxx' }).catch(() => {})
    await vi.advanceTimersByTimeAsync(REGEX_GUARD_TIMEOUT_MS)
    expect(FakeWorker.instances[0]!.terminated).toBe(true)

    const retry = client.run({ pattern: 'ok', flags: '', text: 'ok!' })
    await flushMicrotasks()
    const fresh = FakeWorker.instances.at(-1)!
    expect(fresh.terminated).toBe(false)
    fresh.reply({ ok: true, matches: [], capped: false, truncated: false, originalLength: 3 })
    await expect(retry).resolves.toMatchObject({ kind: 'ok' })
    client.dispose()
  })

  it('dispose 后运行被拒绝为 superseded 并终止 Worker', async () => {
    const client = createRegexClient(factory)
    const p = client.run({ pattern: 'x', flags: '', text: 'x' })
    await flushMicrotasks()
    client.dispose()
    const out = await p
    expect(out.kind).toBe('superseded')
    expect(FakeWorker.instances[0]!.terminated).toBe(true)
  })

  /** 真实时钟冒烟:护栏是挂钟 1s 级别,而非仅 fake timer 语义 */
  it('(real timers)挂起请求约 1s 后被 terminate', async () => {
    vi.useRealTimers()
    const client = createRegexClient(factory)
    const startedAt = Date.now()
    const outcomeP = client.run({ pattern: '(a+)+$', flags: '', text: 'xxx' })
    await expect(outcomeP).resolves.toMatchObject({ kind: 'catastrophic' })
    const elapsed = Date.now() - startedAt
    expect(elapsed).toBeGreaterThanOrEqual(950)
    expect(elapsed).toBeLessThan(1500)
    expect(FakeWorker.instances[0]!.terminated).toBe(true)
    client.dispose()
  }, 5000)
})
