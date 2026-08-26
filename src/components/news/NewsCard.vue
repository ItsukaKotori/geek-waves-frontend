<script setup lang="ts">
import { computed } from 'vue'
import type { NewsItem } from '../../types'
import { CATEGORY_LABEL, fmtTime, splitTags } from '../../utils/news'

const props = defineProps<{
  news: NewsItem
  sourceName?: string
}>()

defineEmits<{ open: [] }>()

const tags = computed(() => splitTags(props.news.tags))
const scoreNum = computed(() => (props.news.score == null ? 0 : Number(props.news.score)))
</script>

<template>
  <article
    class="rounded-box cursor-pointer border border-base-300 bg-base-100 transition-colors hover:border-primary/40"
    role="button"
    tabindex="0"
    @click="$emit('open')"
    @keydown.enter="$emit('open')"
  >
    <div class="flex flex-col gap-1.5 px-5 py-4">
      <h2 class="text-base font-medium leading-snug">
        <a
          :href="news.url"
          target="_blank"
          rel="noreferrer"
          class="text-base-content no-underline hover:text-primary hover:underline"
          @click.stop
        >{{ news.title }}</a>
      </h2>

      <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-base-content/60">
        <span class="badge badge-ghost badge-sm font-medium">{{ CATEGORY_LABEL[news.category] }}</span>
        <span>{{ sourceName || `来源 #${news.sourceId}` }}</span>
        <span v-if="news.publishedAt">· {{ fmtTime(news.publishedAt) }}</span>
        <span v-if="news.author">· {{ news.author }}</span>
        <span v-if="scoreNum > 0" class="badge badge-secondary badge-sm ml-auto font-mono">{{ scoreNum }}</span>
      </div>

      <p v-if="news.summary" class="line-clamp-2 text-sm leading-relaxed text-base-content/70">{{ news.summary }}</p>

      <div v-if="tags.length" class="flex flex-wrap gap-1 pt-0.5">
        <span v-for="t in tags" :key="t" class="badge badge-ghost badge-sm text-base-content/60">#{{ t }}</span>
      </div>
    </div>
  </article>
</template>
