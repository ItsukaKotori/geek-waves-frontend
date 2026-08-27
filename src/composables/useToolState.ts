import { reactive, watch, type UnwrapNestedRefs } from 'vue'

/**
 * 工具输入状态持久化(按工具 key 写 localStorage),与 ToolsView 的 <KeepAlive> 互补:
 * KeepAlive 保「切换工具」时的组件实例,本模块保「刷新页面」后的状态恢复。
 *
 * 用法(与注册表 key 保持一致便于排查):
 *   const { state } = useToolState<{ mode: Mode; input: string }>('b64', { mode: 'b64', input: '' })
 *
 * 状态结构变更安全:旧快照浅合并到初始值之上,新增字段自动回落默认值。
 */

const STORAGE_PREFIX = 'geekwaves-tools:'

export function toolStateStorageKey(toolKey: string): string {
  return `${STORAGE_PREFIX}${toolKey}`
}

/** 从存储读原始串并解析;非对象/损坏数据一律视为无快照 */
function parseSnapshot<T extends object>(raw: string | null): Partial<T> | undefined {
  if (raw == null) return undefined
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Partial<T>
    }
  } catch {
    /* 脏数据按无快照处理 */
  }
  return undefined
}

/** 读取某工具的持久化状态;任何异常都降级为初始值克隆,持久化失败不应影响工具可用 */
export function loadToolState<T extends object>(
  toolKey: string,
  initial: T,
  backend: Storage = localStorage,
): T {
  try {
    const snapshot = parseSnapshot<T>(backend.getItem(toolStateStorageKey(toolKey)))
    if (snapshot !== undefined) {
      // 浅合并:旧版本缺失字段由 initial 兜底,兼容后续加字段
      return { ...initial, ...snapshot }
    }
    return { ...initial }
  } catch {
    return { ...initial }
  }
}

export function saveToolState<T extends object>(
  toolKey: string,
  state: T,
  backend: Storage = localStorage,
): void {
  try {
    backend.setItem(toolStateStorageKey(toolKey), JSON.stringify(state))
  } catch {
    /* 写入失败(配额满/隐私模式等)静默降级 */
  }
}

export function clearToolState(toolKey: string, backend: Storage = localStorage): void {
  try {
    backend.removeItem(toolStateStorageKey(toolKey))
  } catch {
    /* 移除失败静默降级 */
  }
}

export interface ToolStateApi<T> {
  /** 响应式工具状态,直接 v-model 绑定各输入项 */
  state: UnwrapNestedRefs<T>
  /** 还原为初始值并清除该工具的持久化痕迹 */
  reset(): void
}

export function useToolState<T extends object>(
  toolKey: string,
  initial: T,
  backend: Storage = localStorage,
): ToolStateApi<T> {
  const state = reactive(loadToolState(toolKey, initial, backend)) as UnwrapNestedRefs<T>

  watch(state, (snapshot) => saveToolState(toolKey, { ...snapshot }, backend))

  function reset(): void {
    Object.assign(state, initial)
    clearToolState(toolKey, backend)
  }

  return { state, reset }
}
