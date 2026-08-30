<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageHeader from '../components/ui/PageHeader.vue'
import { useRecentTools } from '../composables/useRecentTools'
import { toolRegistry, allToolItems, resolveToolKey, type ToolItem } from '../tools/registry'

const route = useRoute()
const router = useRouter()

const allItems: ToolItem[] = allToolItems

/** 当前工具以路由 query 为唯一数据源(解析语义与 MainLayout 共用 resolveToolKey):
 *  直达 / 回落 / 点击同步天然一致,无双源漂移 */
const activeItem = computed(() => {
  const key = resolveToolKey(route.query.tool)
  return allItems.find((i) => i.key === key)
})

/** replace 语义:切换不堆历史;点击已激活工具时跳过,避免重复导航警告 */
function selectTool(item: ToolItem): void {
  if (item.key === activeItem.value?.key) return
  void router.replace({ query: { ...route.query, tool: item.key } })
}

/** 最近使用:?tool= 直达与点击切换同源计入(query 是唯一数据源,监听即可全覆盖) */
const { recentTools, record } = useRecentTools()
watch(
  () => activeItem.value?.key,
  (toolKey) => {
    if (toolKey) record(toolKey)
  },
  { immediate: true },
)

/** 仅渲染注册表仍存在的条目(注册表演化后旧脏 key 自动隐藏),保持时间倒序 */
const TOOL_ITEM_BY_KEY = new Map(allItems.map((item) => [item.key, item]))
const recentItems = computed(() =>
  recentTools.value
    .map((e) => TOOL_ITEM_BY_KEY.get(e.key))
    .filter((item): item is ToolItem => item !== undefined),
)
</script>

<template>
  <div class="flex flex-col gap-6">
    <PageHeader title="工具" description="常用开发者小工具,大部分纯前端本地计算" />

    <div class="flex flex-col gap-6 md:flex-row md:items-start">
      <aside class="w-56 shrink-0">
        <nav class="flex flex-col gap-0.5 border-base-300 pr-4 md:border-r">
          <template v-if="recentItems.length > 0">
            <p class="px-3 pb-1 pt-4 text-xs font-medium uppercase tracking-wider text-base-content/50">
              最近使用
            </p>
            <button
              v-for="item in recentItems"
              :key="`recent-${item.key}`"
              type="button"
              class="rounded-lg px-3 py-1.5 text-left text-sm font-medium transition-colors"
              :class="
                activeItem?.key === item.key
                  ? 'bg-base-200 text-primary'
                  : 'text-base-content/70 hover:bg-base-200/60 hover:text-base-content'
              "
              @click="selectTool(item)"
            >
              {{ item.label }}
            </button>
          </template>
          <template v-for="g in toolRegistry" :key="g.group">
            <p class="px-3 pb-1 pt-4 text-xs font-medium uppercase tracking-wider text-base-content/50">
              {{ g.group }}
            </p>
            <button
              v-for="item in g.items"
              :key="item.key"
              type="button"
              class="rounded-lg px-3 py-1.5 text-left text-sm font-medium transition-colors"
              :class="
                activeItem?.key === item.key
                  ? 'bg-base-200 text-primary'
                  : 'text-base-content/70 hover:bg-base-200/60 hover:text-base-content'
              "
              @click="selectTool(item)"
            >
              {{ item.label }}
            </button>
          </template>
        </nav>
      </aside>
      <section class="min-w-0 flex-1">
        <div v-if="activeItem" class="rounded-box border border-base-300 bg-base-100 p-5 md:p-6">
          <!-- KeepAlive 缓存注册表内全部工具的实例:切换不销毁,输入在切走再切回时保留 -->
          <KeepAlive>
            <component :is="activeItem.component" />
          </KeepAlive>
        </div>
      </section>
    </div>
  </div>
</template>
