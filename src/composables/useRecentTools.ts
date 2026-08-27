import { ref, type Ref } from 'vue'

/**
 * 工具中心「最近使用」记录:存储与响应式列表二合一,与 useToolState 同源纪律:
 * 键空间 geekwaves-tools:*,持久化失败静默降级、脏数据视为无快照。
 *
 * 用法(工具列表侧栏 + 记录方在同一组件内):
 *   const { recentTools, record } = useRecentTools()
 *   record('b64')                       // 直达 URL 与点击切换同源记录
 *   recentTools.value[0]?.key           // 时间倒序(新在前),≤ RECENT_TOOLS_MAX
 */

export const STORAGE_PREFIX_HINT = 'geekwaves-tools:*'

/** 「最近使用」独立于各工具输入态,但沿用同一命名空间;上限 N=5(brief 建议) */
export const RECENT_TOOLS_STORAGE_KEY = 'geekwaves-tools:recent'
export const RECENT_TOOLS_MAX = 5

export interface RecentToolEntry {
  /** 工具注册表 key(ToolsView registry),渲染端负责按需校验有效性 */
  key: string
  usedAt: number
}

function isValidEntry(value: unknown): value is RecentToolEntry {
  if (value === null || typeof value !== 'object') return false
  const candidate = value as Partial<RecentToolEntry>
  return (
    typeof candidate.key === 'string' &&
    candidate.key.length > 0 &&
    typeof candidate.usedAt === 'number' &&
    Number.isFinite(candidate.usedAt)
  )
}

/** 读原始串并解析为合法条目数组;整体/条目级脏数据一律剔除 */
function parseEntries(raw: string | null): RecentToolEntry[] {
  if (raw == null) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isValidEntry)
  } catch {
    /* 脏数据按空列表处理 */
    return []
  }
}

/** 合并一次使用:去重同名 key → 记录置顶 → 按 usedAt 倒序 → 截断上限 */
export function mergeRecent(
  entries: RecentToolEntry[],
  incoming: RecentToolEntry,
  max: number = RECENT_TOOLS_MAX,
): RecentToolEntry[] {
  const deduped = entries.filter((e) => e.key !== incoming.key)
  return [incoming, ...deduped]
    .sort((a, b) => b.usedAt - a.usedAt)
    .slice(0, max)
}

/** 从存储读取持久化条目(已排序);任何异常降级为空列表 */
export function loadRecentTools(backend: Storage = localStorage): RecentToolEntry[] {
  try {
    const ordered = parseEntries(backend.getItem(RECENT_TOOLS_STORAGE_KEY)).sort(
      (a, b) => b.usedAt - a.usedAt,
    )
    return ordered
  } catch {
    return []
  }
}

export interface RecentToolsApi {
  /** 最近使用条目(时间倒序),供侧栏分组渲染;record 后实时刷新 */
  recentTools: Ref<RecentToolEntry[]>
  /**
   * 记录一次工具使用:?tool= 直达与点击切换共用此入口。
   * 持久化失败静默降级,内存态保持可用。at 供测试注入固定时间戳。
   */
  record(toolKey: string, at?: number): void
}

/** 惰性注水的最近使用状态:实例化时读盘,record 即时刷新 */
export function useRecentTools(backend: Storage = localStorage): RecentToolsApi {
  const recentTools: Ref<RecentToolEntry[]> = ref(loadRecentTools(backend))

  function record(toolKey: string, at?: number): void {
    const next = mergeRecent(recentTools.value, {
      key: toolKey,
      usedAt: at ?? Date.now(),
    })
    try {
      backend.setItem(RECENT_TOOLS_STORAGE_KEY, JSON.stringify(next))
    } catch {
      /* 写入失败(配额满/隐私模式等)静默降级,不影响内存态可用 */
    }
    recentTools.value = next
  }

  return { recentTools, record }
}
