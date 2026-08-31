<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import ToolHead from '../components/tools-ui/ToolHead.vue'
import { allToolItems, resolveToolKey } from '../tools/registry'

/**
 * 工具工作台:工具选择已聚合到主侧栏(MainLayout → ToolRail),
 * 本视图只负责渲染当前工具的头部与面板。激活工具以路由 query 为唯一数据源
 * (解析语义与 ToolRail/命令面板共用 resolveToolKey):直达 / 回流 / 点击天然一致。
 */
const route = useRoute()

const activeItem = computed(() => {
  const key = resolveToolKey(route.query.tool)
  return allToolItems.find((i) => i.key === key)
})
</script>

<template>
  <section class="min-w-0">
    <div v-if="activeItem" class="flex flex-col gap-4">
      <ToolHead :title="activeItem.label" :description="activeItem.description" :icon="activeItem.icon" />
      <!-- data-testid 是测试「异步 chunk 已渲染」的等待锚点:面板内容挂载前此容器为空 -->
      <div data-testid="tool-panel">
        <!-- KeepAlive 缓存注册表内全部工具的实例:切换不销毁,输入在切走再切回时保留 -->
        <KeepAlive>
          <component :is="activeItem.component" />
        </KeepAlive>
      </div>
    </div>
  </section>
</template>
