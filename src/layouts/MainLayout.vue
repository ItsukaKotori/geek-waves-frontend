<script setup lang="ts">
import { RouterLink, RouterView, useRouter } from 'vue-router'
import type { RouteLocationNormalizedLoaded } from 'vue-router'
import ThemeToggleButton from '../components/ThemeToggleButton.vue'
import CommandPalette from '../components/ui/CommandPalette.vue'
import { toolRegistry, allToolItems } from '../tools/registry'
import type { CommandItem } from '../types/command'

interface NavItem {
  to: string
  label: string
  icon: string
}

const PRIMARY_NAV: NavItem[] = [
  { to: '/', label: '资讯', icon: 'M4 5h16v14H4zM8 5v14M16 5v14M4 9h4M4 15h4M16 9h4M16 15h4' },
  {
    to: '/monitor',
    label: '监控',
    icon: 'M12 14l4-4M3.34 19a10 10 0 1 1 17.32 0z',
  },
]

const SYSTEM_NAV: NavItem[] = [
  { to: '/tools', label: '工具', icon: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z' },
  { to: '/settings', label: '设置', icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.09a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.09a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z' },
]

const NAV_CLASS =
  'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ' +
  'text-base-content/70 hover:bg-base-200 hover:text-base-content ' +
  '[&.router-link-exact-active]:bg-base-200 [&.router-link-exact-active]:text-primary'

/**
 * 命令面板「工具直达」数据源(T1c):与侧栏同一注册表派生,选中语义一致 ——
 * 工具页内 replace ?tool=(已激活跳过,防堆历史);跨页调起 push 保留返回路径。
 * 最近使用无需单独记录:?tool= 变化由 ToolsView 的 query watch 同源计入。
 */
const router = useRouter()

/**
 * 侧栏的「实际激活工具」语义(与 ToolsView.activeItem 对齐):
 * ?tool= 缺失或非法时回落到注册表首项,保证「选中已激活工具 = 无操作」判断一致。
 */
function resolvedToolKey(route: RouteLocationNormalizedLoaded): string {
  const requested = route.query.tool
  const valid =
    typeof requested === 'string' ? allToolItems.find((i) => i.key === requested) : undefined
  return valid?.key ?? allToolItems[0]?.key ?? ''
}

function navigateToTool(key: string): void {
  const current = router.currentRoute.value
  if (current.path === '/tools') {
    if (resolvedToolKey(current) === key) return
    void router.replace({ query: { ...current.query, tool: key } })
    return
  }
  void router.push({ path: '/tools', query: { tool: key } })
}

const toolCommands: CommandItem[] = toolRegistry.flatMap((g) =>
  g.items.map((t) => ({
    id: `tool:${t.key}`,
    label: t.label,
    hint: g.group,
    keywords: `${g.group} ${t.key}`,
    run: () => navigateToTool(t.key),
  })),
)
</script>

<template>
  <div class="drawer md:drawer-open">
    <input id="gws-nav" type="checkbox" class="drawer-toggle" />

    <div class="drawer-content flex h-screen flex-col">
      <div class="navbar border-b border-base-300 bg-base-100 md:hidden">
        <div class="navbar-start">
          <label for="gws-nav" class="btn btn-ghost btn-circle drawer-button" aria-label="打开导航">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              class="h-5 w-5"
            >
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </label>
          <span class="ml-1 font-semibold tracking-tight">GeekWaves</span>
        </div>
        <div class="navbar-end">
          <ThemeToggleButton />
        </div>
      </div>

      <main class="flex-1 overflow-y-auto">
        <div class="mx-auto max-w-6xl p-6 md:p-8 lg:p-10">
          <RouterView />
        </div>
      </main>
    </div>

    <div class="drawer-side z-50">
      <label for="gws-nav" aria-label="关闭导航" class="drawer-overlay"></label>
      <aside class="flex min-h-full w-60 flex-col border-r border-base-300 bg-base-100">
        <div class="flex items-center gap-2.5 px-5 pb-6 pt-7">
          <svg viewBox="0 0 24 24" fill="none" class="h-6 w-6 shrink-0" aria-hidden="true">
            <path
              d="M2 12h2.5l2-7 3 14 3-10 2.5 5 2-2H22"
              stroke="currentColor"
              class="text-primary"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          <span class="text-lg font-semibold tracking-tight">GeekWaves</span>
        </div>

        <nav class="flex flex-1 flex-col gap-1 px-3">
          <p class="px-3 pb-1 pt-3 text-xs font-medium uppercase tracking-wider text-base-content/50">主要</p>
          <RouterLink v-for="item in PRIMARY_NAV" :key="item.to" :to="item.to" :class="NAV_CLASS">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="h-4 w-4 shrink-0"
            >
              <path :d="item.icon" />
            </svg>
            {{ item.label }}
          </RouterLink>

          <p class="px-3 pb-1 pt-5 text-xs font-medium uppercase tracking-wider text-base-content/50">系统</p>
          <RouterLink v-for="item in SYSTEM_NAV" :key="item.to" :to="item.to" :class="NAV_CLASS">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="h-4 w-4 shrink-0"
            >
              <path :d="item.icon" />
            </svg>
            {{ item.label }}
          </RouterLink>
        </nav>

        <div class="flex items-center justify-between border-t border-base-300 px-5 py-4">
          <span class="text-xs text-base-content/50">本机自托管</span>
          <ThemeToggleButton />
        </div>
      </aside>
    </div>

    <CommandPalette :items="toolCommands" />
  </div>
</template>
