<script setup lang="ts">
import { computed } from 'vue'

/**
 * 行号输出区:只读文本展示,行号与正文同处一个滚动容器(天然同步,无需 JS)。
 * 空输出显示引导文案 —— 空状态是行动邀请。
 */
const props = withDefaults(
  defineProps<{
    text: string
    emptyHint?: string
  }>(),
  { emptyHint: '等待输入' },
)

const lineNumbers = computed(() => {
  if (props.text === '') return []
  return Array.from({ length: props.text.split('\n').length }, (_, i) => i + 1)
})
</script>

<template>
  <div class="h-full min-h-0 overflow-auto">
    <div v-if="text !== ''" class="flex">
      <div
        aria-hidden="true"
        class="sticky left-0 z-[1] shrink-0 select-none border-r border-base-300 bg-base-200/50 py-2 text-right font-mono text-xs leading-6 text-base-content/35 backdrop-blur-[2px]"
      >
        <div v-for="n in lineNumbers" :key="n" class="w-10 pr-2">{{ n }}</div>
      </div>
      <pre class="min-w-0 flex-1 whitespace-pre-wrap break-all px-3 py-2 font-mono text-sm leading-6">{{ text }}</pre>
    </div>
    <p
      v-else
      class="flex h-full min-h-20 items-center justify-center px-3 text-center font-mono text-xs text-base-content/35"
    >
      {{ emptyHint }}
    </p>
  </div>
</template>
