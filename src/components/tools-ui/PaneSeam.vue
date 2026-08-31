<script setup lang="ts">
/**
 * 双栏中缝(工作台签名元素):输入/输出面板之间的窄缝,
 * 承载真实信息 —— 转换方向指示(→/←)与「结果作为输入」互换按钮。
 * 桌面为窄竖列,移动端双栏纵排时退化为居中横条。
 */
withDefaults(
  defineProps<{
    /** 转换方向指示:'lr' → / 'rl' ←;缺省不显示 */
    direction?: 'lr' | 'rl'
    swap?: boolean
    swapTitle?: string
  }>(),
  { direction: undefined, swap: false, swapTitle: '结果作为输入' },
)

const emit = defineEmits<{ swap: [] }>()
</script>

<template>
  <div class="flex items-center justify-center gap-2 lg:w-9 lg:flex-col">
    <span
      v-if="direction"
      aria-hidden="true"
      class="select-none font-mono text-sm leading-none text-base-content/35"
      >{{ direction === 'rl' ? '←' : '→' }}</span
    >
    <button
      v-if="swap"
      type="button"
      class="btn btn-circle btn-xs border border-base-300 bg-base-100 text-base-content/60 hover:border-primary hover:text-primary"
      :title="swapTitle"
      :aria-label="swapTitle"
      @click="emit('swap')"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="h-3.5 w-3.5"
        aria-hidden="true"
      >
        <path d="m5 12 7-7 7 7M12 19V5" />
      </svg>
    </button>
  </div>
</template>
