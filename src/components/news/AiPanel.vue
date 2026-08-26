<script setup lang="ts">
import { ref } from 'vue'
import { analyzeAI } from '../../api/ai'
import RichContent from '../RichContent.vue'

const props = defineProps<{
  newsId: string | number
  existing?: string | null
}>()

const emit = defineEmits<{ done: [text: string] }>()

const text = ref(props.existing ?? '')
const running = ref(false)
const err = ref('')

async function run(force: boolean) {
  if (running.value) return
  running.value = true
  err.value = ''
  if (force) text.value = ''
  try {
    await analyzeAI(props.newsId, force, (chunk) => {
      text.value += chunk
    })
    emit('done', text.value)
  } catch (e) {
    err.value = (e as Error).message || 'AI 解读失败'
  } finally {
    running.value = false
  }
}
</script>

<template>
  <div class="rounded-box border border-base-300 bg-base-200/50">
    <div class="flex flex-col gap-2.5 p-5">
      <h3 class="text-sm font-semibold tracking-tight text-base-content/80">AI 技术解读</h3>

      <div
        v-if="text"
        class="min-h-28 rounded-box border border-base-300 bg-base-100 p-4 text-sm"
      >
        <RichContent :source="text" mode="markdown" />
      </div>

      <pre
        v-else
        class="min-h-28 whitespace-pre-wrap rounded-box border border-base-300 bg-base-100 p-4 font-sans text-sm leading-relaxed text-base-content/80"
      >点击「解读」,AI 将流式生成技术解读(支持 Markdown 排版)。</pre>

      <div v-if="err" class="rounded-box border border-error/30 bg-error/5 px-4 py-2 text-sm text-error">{{ err }}</div>

      <div class="flex gap-2">
        <button class="btn btn-primary btn-sm" :disabled="running" @click="run(false)">
          <span v-if="running" class="loading loading-spinner loading-xs"></span>
          {{ running ? '解读中…' : '解读' }}
        </button>
        <button v-if="text" class="btn btn-ghost btn-sm" :disabled="running" @click="run(true)">
          重新生成
        </button>
      </div>
    </div>
  </div>
</template>
