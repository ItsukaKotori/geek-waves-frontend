<script setup lang="ts">
import { ref } from 'vue'
import { renderMarkdownPreview } from '../../tools/markdownPreview'
import { useToolState } from '../../composables/useToolState'
import { watchDebounced } from '../../composables/useDebounce'

/**
 * Markdown 预览(FE10 T2 批次一):左输入右预览双栏实时渲染。
 * 渲染管道与站内富文本同源(marked GFM + DOMPurify),零新增依赖。
 */

interface MarkdownState {
  input: string
}

/** 输入经 localStorage 持久化(key 与注册表一致),刷新后恢复 */
const { state } = useToolState<MarkdownState>('markdown', { input: '' })

// 安全口径:v-html 的内容唯一来源是 renderMarkdownPreview(内部必经 DOMPurify sanitize);
// 任何未过该函数的 HTML 一律不得绑定到 v-html。
const html = ref('')

/** 实时式(150ms 防抖):输入停止变化后重渲染 */
function run(): void {
  html.value = renderMarkdownPreview(state.input)
}

const runner = watchDebounced(() => state.input, run)

function renderNow(): void {
  runner.flush()
}
</script>

<template>
  <div class="flex flex-col gap-3" @keydown.ctrl.enter.prevent="renderNow" @keydown.meta.enter.prevent="renderNow">
    <h2 class="text-base font-semibold tracking-tight">Markdown 预览</h2>

    <div class="grid gap-3 md:grid-cols-2">
      <label class="flex flex-col gap-1">
        <span class="text-xs opacity-60">Markdown 源</span>
        <textarea
          v-model="state.input"
          data-testid="md-input"
          rows="16"
          placeholder="支持 GFM:表格、任务列表、删除线等"
          class="textarea textarea-bordered flex-1 font-mono"
        />
      </label>
      <div class="flex flex-col gap-1">
        <span class="text-xs opacity-60">预览(已过 DOMPurify 消毒)</span>
        <!-- v-html 数据源唯一:renderMarkdownPreview(marked 输出必经 DOMPurify 净化) -->
        <div
          data-testid="md-preview"
          class="prose prose-sm max-w-none min-h-40 rounded border border-base-300 bg-base-200/40 p-3"
          v-html="html"
        />
      </div>
    </div>

    <p class="text-xs opacity-50">实时渲染,Ctrl+Enter 立即刷新;脚本与事件属性会被自动剥除</p>
  </div>
</template>
