<script setup lang="ts">
import { computed, defineAsyncComponent, type Component } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageHeader from '../components/ui/PageHeader.vue'

interface ToolItem {
  key: string
  label: string
  component: Component
}

interface ToolGroup {
  group: string
  items: ToolItem[]
}

const registry: ToolGroup[] = [
  {
    group: '编解码',
    items: [
      {
        key: 'json',
        label: 'JSON 转换',
        component: defineAsyncComponent(() => import('../components/tools/JsonFormatter.vue')),
      },
      {
        key: 'ts',
        label: '时间戳',
        component: defineAsyncComponent(() => import('../components/tools/Timestamp.vue')),
      },
      {
        key: 'b64',
        label: 'Base64/URL',
        component: defineAsyncComponent(() => import('../components/tools/EncoderDecoder.vue')),
      },
    ],
  },
  {
    group: '哈希/ID',
    items: [
      {
        key: 'hash',
        label: '哈希计算',
        component: defineAsyncComponent(() => import('../components/tools/HashUuid.vue')),
      },
      {
        key: 'radix',
        label: '进制转换',
        component: defineAsyncComponent(() => import('../components/tools/Radix.vue')),
      },
    ],
  },
  {
    group: '文本',
    items: [
      {
        key: 'regex',
        label: '正则视觉匹配',
        component: defineAsyncComponent(() => import('../components/tools/RegexMatch.vue')),
      },
      {
        key: 'jwt',
        label: 'JWT 解析',
        component: defineAsyncComponent(() => import('../components/tools/JwtParser.vue')),
      },
    ],
  },
  {
    group: '接口',
    items: [
      {
        key: 'http',
        label: 'HTTP 接口测试',
        component: defineAsyncComponent(() => import('../components/tools/HttpTester.vue')),
      },
    ],
  },
]

const route = useRoute()
const router = useRouter()

const allItems: ToolItem[] = registry.flatMap((g) => g.items)

/** 当前工具以路由 query 为唯一数据源:直达 / 回落 / 点击同步天然一致,无双源漂移 */
const activeItem = computed(() => {
  const requested = route.query.tool
  if (typeof requested === 'string' && allItems.some((i) => i.key === requested)) {
    return allItems.find((i) => i.key === requested)
  }
  return allItems[0]
})

/** replace 语义:切换不堆历史;点击已激活工具时跳过,避免重复导航警告 */
function selectTool(item: ToolItem): void {
  if (item.key === activeItem.value?.key) return
  void router.replace({ query: { ...route.query, tool: item.key } })
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <PageHeader title="工具" description="常用开发者小工具,大部分纯前端本地计算" />

    <div class="flex flex-col gap-6 md:flex-row md:items-start">
      <aside class="w-56 shrink-0">
        <nav class="flex flex-col gap-0.5 border-base-300 pr-4 md:border-r">
          <template v-for="g in registry" :key="g.group">
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
          <!-- KeepAlive 缓存全部 8 个工具的实例:切换不销毁,输入在切走再切回时保留 -->
          <KeepAlive>
            <component :is="activeItem.component" />
          </KeepAlive>
        </div>
      </section>
    </div>
  </div>
</template>
