<script setup lang="ts">
/**
 * 工作台面板框架:标签头(label + 徽标 + 动作槽)/ 主体槽 / mono 状态条槽。
 * 面板语言的所有者 —— 工具页一切内容都装进这个框,保证 16 个工具的观感一致。
 * 高度由调用方通过 class 透传(如 h-72),缺省随内容自适应。
 */
defineProps<{
  label: string
  /** 标签旁的等宽小徽标(格式名、计数等) */
  badge?: string
}>()
</script>

<template>
  <section class="flex min-h-0 flex-col overflow-hidden rounded-box border border-base-300 bg-base-100">
    <header class="flex items-center gap-2 border-b border-base-300 px-3 py-2">
      <span class="text-xs font-medium tracking-wider text-base-content/50">{{ label }}</span>
      <span v-if="badge" class="badge badge-ghost badge-sm font-mono">{{ badge }}</span>
      <div class="ml-auto flex items-center gap-1.5">
        <slot name="actions" />
      </div>
    </header>
    <div class="min-h-0 flex-1">
      <slot />
    </div>
    <footer
      v-if="$slots.footer"
      class="flex flex-wrap items-center gap-x-3 gap-y-0.5 border-t border-base-300 px-3 py-1.5 font-mono text-xs tabular-nums text-base-content/55"
    >
      <slot name="footer" />
    </footer>
  </section>
</template>
