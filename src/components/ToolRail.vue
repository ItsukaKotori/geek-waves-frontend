<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useToolNavigation } from '../tools/toolNavigation'
import { toolRegistry, resolveToolKey, type ToolItem } from '../tools/registry'

/**
 * 主侧栏工具列表(MainLayout 仅在 /tools 路由下展开):
 * 筛选 + 分组导航。激活态以 ?tool= 为唯一数据源,与 ToolsView 面板天然同步;
 * 离开 /tools 由 MainLayout 卸载本组件。
 */
const route = useRoute()
const { navigateToTool } = useToolNavigation()

const activeKey = computed(() => resolveToolKey(route.query.tool))

/** 点击切换:已激活跳过(replace 防抖);移动端抽屉随选收起,直接回看工作台 */
function selectTool(item: ToolItem): void {
  if (item.key !== activeKey.value) navigateToTool(item.key)
  const drawerToggle = document.getElementById('gws-nav') as HTMLInputElement | null
  if (drawerToggle !== null) drawerToggle.checked = false
}

/* ------------------------------ rail 工具筛选 ------------------------------ */

const filterText = ref('')
const filterLower = computed(() => filterText.value.trim().toLowerCase())

/** 命中口径:条目 label/key 或其所属分组名 */
function itemMatches(item: ToolItem, group: string): boolean {
  const q = filterLower.value
  if (!q) return true
  return (
    item.label.toLowerCase().includes(q) ||
    item.key.toLowerCase().includes(q) ||
    group.toLowerCase().includes(q)
  )
}

/** 筛选后的分组(空分组隐藏);计数徽标显示筛选后的可见数量 */
const visibleGroups = computed(() =>
  toolRegistry
    .map((g) => ({ group: g.group, items: g.items.filter((i) => itemMatches(i, g.group)) }))
    .filter((g) => g.items.length > 0),
)

/** 侧栏条目:左侧 2px 指示条编码激活态,主色 text + 1/10 底色 */
const RAIL_ITEM_CLASS = 'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors'

function railItemClass(active: boolean): string {
  return active
    ? 'bg-primary/10 font-medium text-primary'
    : 'font-normal text-base-content/70 hover:bg-base-200 hover:text-base-content'
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <div class="px-0.5 pt-1">
      <input
        v-model="filterText"
        type="search"
        placeholder="筛选工具…"
        aria-label="筛选工具"
        class="input input-sm w-full"
      />
      <p class="mt-1.5 px-1 text-[11px] leading-snug text-base-content/40">
        常用开发者小工具,大部分纯前端本地计算
      </p>
    </div>

    <nav class="mt-2 min-h-0 flex-1 overflow-y-auto pr-1.5" aria-label="工具列表">
      <div class="flex flex-col gap-0.5">
        <template v-for="g in visibleGroups" :key="g.group">
          <p class="flex items-baseline justify-between px-2.5 pb-1 pt-4 text-xs font-medium tracking-wider text-base-content/45">
            {{ g.group }}
            <span class="font-mono tabular-nums text-base-content/35">{{ g.items.length }}</span>
          </p>
          <button
            v-for="item in g.items"
            :key="item.key"
            type="button"
            :class="[RAIL_ITEM_CLASS, railItemClass(activeKey === item.key)]"
            @click="selectTool(item)"
          >
            <span
              class="h-4 w-0.5 shrink-0 rounded-full"
              :class="activeKey === item.key ? 'bg-primary' : 'bg-transparent'"
            />
            {{ item.label }}
          </button>
        </template>
        <p v-if="visibleGroups.length === 0" class="px-2.5 pt-4 text-xs text-base-content/45">
          没有匹配「{{ filterText }}」的工具
        </p>
      </div>
    </nav>
  </div>
</template>
