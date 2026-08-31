import { useRouter } from 'vue-router'
import { resolveToolKey } from './registry'

/**
 * 工具直达导航 —— T1c 语义唯一实现(MainLayout 命令面板与 ToolRail 共用):
 * /tools 页内 replace ?tool=(已激活跳过,防堆历史);跨页 push 直达并保留返回路径。
 * 激活判定与 ?tool= 解析共用 resolveToolKey,保证「选中已激活工具 = 无操作」口径一致。
 */
export function useToolNavigation() {
  const router = useRouter()

  function navigateToTool(key: string): void {
    const current = router.currentRoute.value
    if (current.path === '/tools') {
      if (resolveToolKey(current.query.tool) === key) return
      void router.replace({ query: { ...current.query, tool: key } })
      return
    }
    void router.push({ path: '/tools', query: { tool: key } })
  }

  return { navigateToTool }
}
