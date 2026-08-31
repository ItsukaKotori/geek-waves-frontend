<script setup lang="ts">
import { computed, ref } from 'vue'

/**
 * 行号编辑器:textarea + 同步滚动的行号槽。无边框(PaneShell 提供面板框),
 * 等宽 + 24px 行距与行号严格对齐。
 */
const props = withDefaults(
  defineProps<{
    modelValue: string
    placeholder?: string
    ariaLabel?: string
    /** 透传到 textarea 的 data-testid(测试定位用) */
    testid?: string
  }>(),
  { placeholder: '', ariaLabel: undefined, testid: undefined },
)

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const gutterRef = ref<HTMLElement | null>(null)
const textareaRef = ref<HTMLTextAreaElement | null>(null)

/** 行号至少保留 1 行,与空编辑器的光标行对齐 */
const lineNumbers = computed(() => {
  const n = props.modelValue.split('\n').length
  return Array.from({ length: Math.max(1, n) }, (_, i) => i + 1)
})

/** 行号槽随编辑区纵向滚动保持对齐(jsdom 无布局,行为由浏览器保证) */
function syncScroll(): void {
  if (gutterRef.value && textareaRef.value) gutterRef.value.scrollTop = textareaRef.value.scrollTop
}

function onInput(e: Event): void {
  emit('update:modelValue', (e.target as HTMLTextAreaElement).value)
}
</script>

<template>
  <div class="flex h-full min-h-0">
    <div
      ref="gutterRef"
      aria-hidden="true"
      class="w-10 shrink-0 select-none overflow-hidden border-r border-base-300 bg-base-200/50 py-2 text-right font-mono text-xs leading-6 text-base-content/35"
    >
      <div v-for="n in lineNumbers" :key="n" class="pr-2">{{ n }}</div>
    </div>
    <textarea
      ref="textareaRef"
      :value="modelValue"
      :placeholder="placeholder"
      :aria-label="ariaLabel"
      :data-testid="testid"
      spellcheck="false"
      class="h-full min-h-0 flex-1 resize-none bg-transparent px-3 py-2 font-mono text-sm leading-6 text-base-content outline-none placeholder:text-base-content/35"
      @input="onInput"
      @scroll="syncScroll"
    />
  </div>
</template>
