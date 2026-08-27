import { getCurrentScope, onScopeDispose, watch, type WatchSource } from 'vue'

/**
 * 工具输入实时预览的统一防抖(150ms 硬性值,见任务 FE3):
 * 输入停止变化 150ms 后才执行转换计算,输入期间连续击键只保留最后一次。
 */

export const TOOL_INPUT_DEBOUNCE_MS = 150

export interface DebouncedRunner {
  /** 调度一次防抖执行(替换此前的挂起调度) */
  schedule(): void
  /** 仅取消挂起的调度,不执行 */
  cancel(): void
  /** 取消挂起的调度并立即同步执行一次(供 Ctrl+Enter 兜底冲刷) */
  flush(): void
}

/**
 * 把一个无参任务包成防抖任务。挂起定时器在当前作用域销毁时自动清理
 * (KeepAlive 缓存的实例不销毁作用域,但源不变则不会重新调度,无空转成本)。
 */
export function useDebounceFn(task: () => void, delayMs: number = TOOL_INPUT_DEBOUNCE_MS): DebouncedRunner {
  let timer: ReturnType<typeof setTimeout> | undefined

  function cancel(): void {
    if (timer !== undefined) {
      clearTimeout(timer)
      timer = undefined
    }
  }

  function flush(): void {
    cancel()
    task()
  }

  function schedule(): void {
    cancel()
    timer = setTimeout(() => {
      timer = undefined
      task()
    }, delayMs)
  }

  if (getCurrentScope()) onScopeDispose(cancel)

  return { schedule, cancel, flush }
}

/**
 * 监听一个或多个响应式源,变化后防抖触发 task;默认 immediate,
 * 挂载即对初值(含 localStorage 恢复的持久化输入)做一次防抖计算。
 * 返回句柄供「Ctrl+Enter 立即重算」兜底。
 */
export function watchDebounced(
  sources: WatchSource<unknown> | WatchSource<unknown>[],
  task: () => void,
  delayMs: number = TOOL_INPUT_DEBOUNCE_MS,
): DebouncedRunner {
  const runner = useDebounceFn(task, delayMs)
  watch(sources, () => runner.schedule(), { immediate: true })
  return runner
}
