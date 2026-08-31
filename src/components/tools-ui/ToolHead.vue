<script setup lang="ts">
/**
 * 工作台头部:注册表元数据(图标/名称/说明)的唯一渲染出口。
 * 工具组件内部不再各自重复标题 —— 标签单一来源在注册表。
 */
defineProps<{
  title: string
  description: string
  /** 24 viewBox 描边图标的路径 d 数组 */
  icon: string[]
}>()
</script>

<template>
  <div class="flex items-start gap-3 border-b border-base-300 pb-4">
    <span
      class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-base-300 bg-base-200/60 text-primary"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="h-5 w-5"
        aria-hidden="true"
      >
        <path v-for="(d, i) in icon" :key="i" :d="d" />
      </svg>
    </span>
    <div class="min-w-0">
      <h2 class="text-lg font-semibold tracking-tight">{{ title }}</h2>
      <p class="mt-0.5 text-sm leading-snug text-base-content/60">{{ description }}</p>
    </div>
  </div>
</template>
