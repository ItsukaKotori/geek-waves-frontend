import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPoller } from '../usePolling'

/**
 * createPoller 是 usePolling 的可测核心:立即执行 + 间隔轮询 + 失败熔断 + 防重叠。
 * usePolling 组合式仅包一层生命周期绑定(onMounted/visibilitychange),不做逻辑。
 */

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('createPoller', () => {
  it('runs immediately on start and on each interval tick', async () => {
    const fn = vi.fn().mockResolvedValue(undefined)
    const p = createPoller(fn, { intervalMs: 5000 })

    p.start()
    expect(fn).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(5000)
    expect(fn).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(10_000)
    expect(fn).toHaveBeenCalledTimes(4)

    p.stop()
  })

  it('stops scheduling after stop()', async () => {
    const fn = vi.fn().mockResolvedValue(undefined)
    const p = createPoller(fn, { intervalMs: 5000 })
    p.start()
    await vi.advanceTimersByTimeAsync(5000)
    p.stop()

    await vi.advanceTimersByTimeAsync(20_000)
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('halts and reports the error after 3 consecutive failures', async () => {
    const onHalted = vi.fn()
    const fn = vi.fn().mockRejectedValue(new Error('boom'))
    const p = createPoller(fn, { intervalMs: 5000, onHalted })

    p.start()
    await vi.advanceTimersByTimeAsync(5000)
    await vi.advanceTimersByTimeAsync(5000)

    expect(fn).toHaveBeenCalledTimes(3)
    expect(p.halted).toBe(true)
    expect(onHalted).toHaveBeenCalledTimes(1)
    expect(onHalted.mock.calls[0][0].message).toBe('boom')

    // 熔断后不再调度
    await vi.advanceTimersByTimeAsync(20_000)
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('a success resets the failure counter', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('a'))
      .mockRejectedValueOnce(new Error('b'))
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('c'))
      .mockRejectedValueOnce(new Error('d'))
    const p = createPoller(fn, { intervalMs: 5000 })

    p.start()
    await vi.advanceTimersByTimeAsync(5000) // fail a
    await vi.advanceTimersByTimeAsync(5000) // fail b
    await vi.advanceTimersByTimeAsync(5000) // success → 清零
    expect(p.halted).toBe(false)

    await vi.advanceTimersByTimeAsync(5000) // fail c
    await vi.advanceTimersByTimeAsync(5000) // fail d:连续只有 2 次
    await vi.advanceTimersByTimeAsync(5000) // 默认实现(成功),仍不应熔断
    expect(p.halted).toBe(false)
    expect(fn).toHaveBeenCalledTimes(7) // start 1 次 + 6 个窗口各 1 次
    p.stop()
  })

  it('skips a tick while the previous run is still in flight (no overlap)', async () => {
    let release: (() => void) | undefined
    const fn = vi.fn().mockImplementation(
      () => new Promise<void>((r) => (release = r)),
    )
    const p = createPoller(fn, { intervalMs: 5000 })

    p.start() // 第 1 次,挂起
    await vi.advanceTimersByTimeAsync(5000) // tick 到来但上次未结束 → 跳过
    expect(fn).toHaveBeenCalledTimes(1)

    release!()
    await vi.advanceTimersByTimeAsync(5000)
    expect(fn).toHaveBeenCalledTimes(2)
    p.stop()
  })

  it('refresh() runs immediately, resumes scheduling and clears halted', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('a'))
      .mockRejectedValueOnce(new Error('b'))
      .mockRejectedValueOnce(new Error('c'))
      .mockResolvedValue(undefined)
    const p = createPoller(fn, { intervalMs: 5000 })

    p.start()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(p.halted).toBe(true)
    expect(fn).toHaveBeenCalledTimes(3)

    await p.refresh() // 立即执行第 4 次(成功)
    expect(fn).toHaveBeenCalledTimes(4)
    expect(p.halted).toBe(false)

    await vi.advanceTimersByTimeAsync(5000) // 恢复调度
    expect(fn).toHaveBeenCalledTimes(5)
    p.stop()
  })
})
