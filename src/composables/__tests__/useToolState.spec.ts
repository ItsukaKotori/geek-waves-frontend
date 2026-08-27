// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import {
  clearToolState,
  loadToolState,
  saveToolState,
  toolStateStorageKey,
  useToolState,
} from '../useToolState'

/**
 * useToolState:按工具 key 写 localStorage 的输入状态快照层。
 * 覆盖:持久化 / 读取 / key 隔离 / 脏数据兜底 / 失败降级。
 */

interface DemoState {
  text: string
  count: number
}

const demoKey = 'demo'
const demoInitial: DemoState = { text: '', count: 0 }

const memoryBackend = (): Storage => ({
  length: 0,
  clear: () => undefined,
  key: () => null,
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
})

/** watcher 为 pre-flush,两个 tick 确保异步持久化落地 */
async function settle(): Promise<void> {
  await nextTick()
  await nextTick()
}

beforeEach(() => {
  localStorage.clear()
})

describe('toolStateStorageKey', () => {
  it('派生 geekwaves-tools 命名空间下按工具隔离的存储键', () => {
    expect(toolStateStorageKey('b64')).toBe('geekwaves-tools:b64')
  })
})

describe('loadToolState / saveToolState(纯函数)', () => {
  it('save 后可按同名 key 读回相同值', () => {
    saveToolState(demoKey, { text: 'hello', count: 2 })
    expect(loadToolState(demoKey, demoInitial)).toEqual({ text: 'hello', count: 2 })
    expect(JSON.parse(localStorage.getItem(toolStateStorageKey(demoKey)) ?? '')).toEqual({
      text: 'hello',
      count: 2,
    })
  })

  it('无存储时返回初始值的克隆(不回写、不共享引用)', () => {
    const loaded = loadToolState(demoKey, demoInitial)
    expect(loaded).toEqual(demoInitial)
    expect(loaded).not.toBe(demoInitial)
    expect(localStorage.getItem(toolStateStorageKey(demoKey))).toBeNull()
  })

  it('不同 toolKey 的存储互不可见(key 隔离)', () => {
    saveToolState('a', { text: 'from-a', count: 1 })
    saveToolState('b', { text: 'from-b', count: 9 })
    expect(loadToolState('a', demoInitial)).toEqual({ text: 'from-a', count: 1 })
    expect(loadToolState('b', demoInitial)).toEqual({ text: 'from-b', count: 9 })
  })

  it('读取端可注入自定义 Storage 后端', () => {
    const backed = memoryBackend()
    expect(loadToolState('anykey', demoInitial, backed)).toEqual(demoInitial)
  })

  it('clearToolState 移除对应条目而不影响其他 key', () => {
    saveToolState('a', { text: 'x', count: 1 })
    saveToolState('b', { text: 'y', count: 2 })
    clearToolState('a')
    expect(localStorage.getItem(toolStateStorageKey('a'))).toBeNull()
    expect(localStorage.getItem(toolStateStorageKey('b'))).not.toBeNull()
  })
})

describe('useToolState(组合式)', () => {
  it('首次使用返回初始值', () => {
    const { state } = useToolState<DemoState>(demoKey, demoInitial)
    expect(state.text).toBe('')
    expect(state.count).toBe(0)
  })

  it('变更后自动持久化,新实例读到上次状态(刷新恢复)', async () => {
    const first = useToolState<DemoState>(demoKey, demoInitial)
    first.state.text = 'carried over'
    first.state.count = 7
    await settle()

    expect(localStorage.getItem(toolStateStorageKey(demoKey))).not.toBeNull()

    const second = useToolState<DemoState>(demoKey, demoInitial)
    expect(second.state.text).toBe('carried over')
    expect(second.state.count).toBe(7)
  })

  it('不同工具 key 的实例互相隔离', async () => {
    const a = useToolState<DemoState>('a', demoInitial)
    const b = useToolState<DemoState>('b', demoInitial)
    a.state.text = 'only-a'
    await settle()

    expect(b.state.text).toBe('')
    expect(loadToolState('b', demoInitial)).toEqual(demoInitial)
  })

  it('部分快照与初始值合并:缺失字段回落默认(支持后续加字段)', () => {
    localStorage.setItem(
      toolStateStorageKey(demoKey),
      JSON.stringify({ text: 'kept' }),
    )
    const { state } = useToolState<DemoState>(demoKey, demoInitial)
    expect(state.text).toBe('kept')
    expect(state.count).toBe(0)
  })

  it('脏数据(JSON 坏串/非对象)不抛错且回落初始值', () => {
    localStorage.setItem(toolStateStorageKey(demoKey), '{broken json!')
    let broken = useToolState<DemoState>(demoKey, demoInitial)
    expect(broken.state).toEqual(demoInitial)

    localStorage.setItem(toolStateStorageKey(demoKey), '[1,2]')
    broken = useToolState<DemoState>(demoKey, demoInitial)
    expect(broken.state).toEqual(demoInitial)

    localStorage.setItem(toolStateStorageKey(demoKey), '"str"')
    broken = useToolState<DemoState>(demoKey, demoInitial)
    expect(broken.state).toEqual(demoInitial)
  })

  it('Storage 写入失败时静默降级,不影响响应式状态可用', async () => {
    const quotaFull: Storage = memoryBackend()
    quotaFull.setItem = () => {
      throw new DOMException('quota exceeded', 'QuotaExceededError')
    }

    const { state } = useToolState<DemoState>(demoKey, demoInitial, quotaFull)
    state.text = 'still usable'
    await settle()
    expect(state.text).toBe('still usable')
  })

  it('Storage 读取失败时静默回落初始值', () => {
    const unreadable: Storage = memoryBackend()
    unreadable.getItem = () => {
      throw new Error('storage blocked')
    }
    const { state } = useToolState<DemoState>(demoKey, demoInitial, unreadable)
    expect(state).toEqual(demoInitial)
  })

  it('reset 将响应式状态还原为初始值,重新加载(read-back)亦为初始值', async () => {
    const api = useToolState<DemoState>(demoKey, demoInitial)
    api.state.text = 'dirty'
    api.state.count = 42
    await settle()

    api.reset()
    expect(api.state.text).toBe('')
    expect(api.state.count).toBe(0)

    await settle()
    const reloaded = useToolState<DemoState>(demoKey, demoInitial)
    expect(reloaded.state).toEqual(demoInitial)
  })
})
