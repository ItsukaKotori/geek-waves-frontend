<script setup lang="ts">
import { computed, defineAsyncComponent, ref, type Component } from 'vue'
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

const activeKey = ref('json')

const activeItem = computed(() => {
  for (const g of registry) {
    const found = g.items.find((i) => i.key === activeKey.value)
    if (found) return found
  }
  return undefined
})
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
                activeKey === item.key
                  ? 'bg-base-200 text-primary'
                  : 'text-base-content/70 hover:bg-base-200/60 hover:text-base-content'
              "
              @click="activeKey = item.key"
            >
              {{ item.label }}
            </button>
          </template>
        </nav>
      </aside>
      <section class="min-w-0 flex-1">
        <div v-if="activeItem" class="rounded-box border border-base-300 bg-base-100 p-5 md:p-6">
          <component :is="activeItem.component" :key="activeItem.key" />
        </div>
      </section>
    </div>
  </div>
</template>
