<script setup lang="ts">
/**
 * 统一错误横幅:消息 + 可选关闭按钮 + 类型变体,基于 DaisyUI alert 体系。
 * 纯展示组件 —— 不持有状态、不自行隐藏;close 只向上抛,
 * 何时移除由父级(错误状态持有方)决定。不做全局单例 store。
 */

type ErrorBannerVariant = 'error' | 'warning' | 'info' | 'success'

withDefaults(
  defineProps<{
    /** 横幅正文(单段文本) */
    message: string
    /** 语义色:默认 error */
    variant?: ErrorBannerVariant
    /** 是否渲染关闭按钮(点击仅 emit close) */
    dismissible?: boolean
  }>(),
  {
    variant: 'error',
    dismissible: false,
  },
)

defineEmits<{ close: [] }>()

/** 各变体的语义图标(线性图标,跟随 currentColor) */
const VARIANT_ICONS: Record<ErrorBannerVariant, string> = {
  error: 'M12 9v4m0 4h.01M10.29 3.86l-8.02 13.9A2 2 0 0 0 3.98 21h16.04a2 2 0 0 0 1.71-3.24L13.71 3.86a2 2 0 0 0-3.42 0z',
  warning: 'M12 9v4m0 4h.01M10.29 3.86l-8.02 13.9A2 2 0 0 0 3.98 21h16.04a2 2 0 0 0 1.71-3.24L13.71 3.86a2 2 0 0 0-3.42 0z',
  info: 'M12 8h.01M11 12h1v4h1M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z',
  success: 'M22 11.08V12a10 10 0 1 1-5.93-9.14m5.93 4.14L12 16l-3-3',
}
</script>

<template>
  <div
    role="alert"
    class="alert alert-soft items-start py-2.5 text-sm"
    :class="`alert-${variant}`"
  >
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="h-4 w-4 shrink-0"
      aria-hidden="true"
    >
      <path :d="VARIANT_ICONS[variant]" />
    </svg>
    <span class="min-w-0 break-words">{{ message }}</span>
    <button
      v-if="dismissible"
      type="button"
      class="btn btn-circle btn-ghost btn-xs"
      aria-label="关闭"
      @click="$emit('close')"
    >
      ✕
    </button>
  </div>
</template>
