<script setup lang="ts">
import { computed } from 'vue'
import { looksLikeHtml, renderMarkdown, sanitizeHtml } from '../utils/richContent'

const props = defineProps<{
  source: string
  mode?: 'auto' | 'html' | 'markdown'
}>()

const html = computed(() => {
  const src = props.source ?? ''
  if (!src.trim()) return ''
  const mode = props.mode ?? 'auto'
  const asHtml = mode === 'html' || (mode === 'auto' && looksLikeHtml(src))
  // 无论走哪条路径,v-html 前必须过 sanitizeHtml
  return sanitizeHtml(asHtml ? src : renderMarkdown(src))
})
</script>

<template>
  <div class="rich-content prose prose-sm max-w-none" v-html="html"></div>
</template>
