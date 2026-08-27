import { describe, expect, it, vi, afterEach } from 'vitest'
import { ref } from 'vue'
import { TOOL_INPUT_DEBOUNCE_MS, useDebounceFn, watchDebounced } from '../useDebounce'

afterEach(() => {
  vi.useRealTimers()
})

describe('useDebounceFn', () => {
  it('默认延迟为 150ms', async () => {
    vi.useFakeTimers()
    const task = vi.fn()
    const runner = useDebounceFn(task)
    runner.schedule()
    expect(task).not.toHaveBeenCalled()
    vi.advanceTimersByTime(TOOL_INPUT_DEBOUNCE_MS - 1)
    expect(task).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(task).toHaveBeenCalledTimes(1)
  })

  it('重复调度只执行最后一次', async () => {
    vi.useFakeTimers()
    const task = vi.fn()
    const runner = useDebounceFn(task, 150)
    runner.schedule()
    runner.schedule()
    runner.schedule()
    await vi.advanceTimersByTimeAsync(150)
    expect(task).toHaveBeenCalledTimes(1)
  })

  it('cancel 取消挂起的执行', async () => {
    vi.useFakeTimers()
    const task = vi.fn()
    const runner = useDebounceFn(task, 150)
    runner.schedule()
    runner.cancel()
    await vi.advanceTimersByTimeAsync(300)
    expect(task).not.toHaveBeenCalled()
  })

  it('flush 立即执行并吞掉挂起调度', async () => {
    vi.useFakeTimers()
    const task = vi.fn()
    const runner = useDebounceFn(task, 150)
    runner.schedule()
    runner.flush()
    await vi.advanceTimersByTimeAsync(300)
    expect(task).toHaveBeenCalledTimes(1)
  })
})

describe('watchDebounced', () => {
  it('源变化后 ≤150ms 内触发且只在末值触发一次', async () => {
    vi.useFakeTimers()
    const source = ref('')
    const task = vi.fn()
    watchDebounced([source], task, 150)
    source.value = 'a'
    source.value = 'b'
    source.value = 'c'
    await vi.advanceTimersByTimeAsync(TOOL_INPUT_DEBOUNCE_MS)
    expect(task).toHaveBeenCalledTimes(1)
  })

  it('immediate:挂载即对初值做一次防抖计算', async () => {
    vi.useFakeTimers()
    const source = ref('hello')
    const task = vi.fn()
    watchDebounced([source], task, 150)
    expect(task).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(TOOL_INPUT_DEBOUNCE_MS)
    expect(task).toHaveBeenCalledTimes(1)
  })

  it('flush 绕过防抖立即执行', async () => {
    vi.useFakeTimers()
    const source = ref('')
    let observed = ''
    const api = watchDebounced([source], () => {
      observed = source.value
    }, 150)
    source.value = 'now'
    api.flush()
    expect(observed).toBe('now')
    await vi.advanceTimersByTimeAsync(TOOL_INPUT_DEBOUNCE_MS)
    // flush 已取消挂起的调度,任务只被手动冲刷这一次
    expect(observed).toBe('now')
  })
})
