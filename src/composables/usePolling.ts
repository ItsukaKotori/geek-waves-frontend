import { onBeforeUnmount, onMounted } from 'vue'

/**
 * 轮询核心(纯逻辑,可测):立即执行 + 间隔调度 + 连续失败熔断 + 防重叠。
 * 防重叠 = 上一次请求未结束时跳过本拍 → 旧响应永远不可能覆盖新数据,
 * 比「响应序号守卫」更简单且更强。
 */

export interface Poller {
  start(): void
  stop(): void
  /** 立即执行一次;若已熔断则同时恢复调度 */
  refresh(): Promise<void>
  readonly halted: boolean
}

export interface PollerOptions {
  intervalMs: number
  /** 连续失败多少次后熔断暂停,默认 3 */
  maxFailures?: number
  /** 熔断时回调(携带最后一次错误),组件用它置错误态 */
  onHalted?: (error: Error) => void
}

export function createPoller(
  fn: () => Promise<unknown>,
  opts: PollerOptions,
): Poller {
  const maxFailures = opts.maxFailures ?? 3
  let timer: ReturnType<typeof setInterval> | undefined
  let failures = 0
  let halted = false
  let inFlight = false

  async function run(): Promise<void> {
    if (inFlight) return
    inFlight = true
    try {
      await fn()
      failures = 0
    } catch (e) {
      failures++
      if (failures >= maxFailures) {
        halted = true
        clearInterval(timer)
        timer = undefined
        opts.onHalted?.(e instanceof Error ? e : new Error(String(e)))
      }
    } finally {
      inFlight = false
    }
  }

  function tick() {
    if (inFlight) return
    void run()
  }

  return {
    start() {
      if (timer != null || halted) return
      timer = setInterval(tick, opts.intervalMs)
      void run()
    },
    stop() {
      clearInterval(timer)
      timer = undefined
    },
    get halted() {
      return halted
    },
    async refresh() {
      failures = 0
      halted = false
      if (timer == null) timer = setInterval(tick, opts.intervalMs)
      await run()
    },
  }
}

/**
 * 组合式封装:挂载即轮询,卸载即停止;页面隐藏暂停、可见立即刷新。
 * 仅生命周期绑定,无业务逻辑(逻辑全在 createPoller,由其测试覆盖)。
 */
export function usePolling(fn: () => Promise<unknown>, opts: PollerOptions): Poller {
  const poller = createPoller(fn, opts)

  function onVisibility() {
    if (document.hidden) poller.stop()
    else void poller.refresh()
  }

  onMounted(() => {
    poller.start()
    document.addEventListener('visibilitychange', onVisibility)
  })
  onBeforeUnmount(() => {
    poller.stop()
    document.removeEventListener('visibilitychange', onVisibility)
  })

  return poller
}
