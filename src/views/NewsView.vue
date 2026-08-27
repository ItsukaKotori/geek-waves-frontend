<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { fetchFrameworks, fetchNewsDetail, fetchSources, listNews, type NewsCategory } from '../api/news'
import AiPanel from '../components/news/AiPanel.vue'
import NewsCard from '../components/news/NewsCard.vue'
import RichContent from '../components/RichContent.vue'
import PageHeader from '../components/ui/PageHeader.vue'
import UnderlineTabs from '../components/ui/UnderlineTabs.vue'
import type { FrameworkBrief, NewsItem, NewsSourceBrief } from '../types'
import { CATEGORY_LABEL, fmtTime, sourceOptionsForTab } from '../utils/news'

type Tab = 'ALL' | NewsCategory

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'ALL', label: '全部' },
  { key: 'NEWS', label: CATEGORY_LABEL.NEWS },
  { key: 'REPO', label: CATEGORY_LABEL.REPO },
  { key: 'RELEASE', label: CATEGORY_LABEL.RELEASE },
]

const tab = ref<Tab>('ALL')
const sourceId = ref<string>('')
const sources = ref<NewsSourceBrief[]>([])
const frameworks = ref<FrameworkBrief[]>([])
const records = ref<NewsItem[]>([])
const total = ref(0)
const page = ref(1)
const loading = ref(false)
const err = ref('')
const current = ref<NewsItem | null>(null)
const dialogEl = ref<HTMLDialogElement | null>(null)

let seq = 0

const sourceOptions = computed(() => sourceOptionsForTab(tab.value, sources.value, frameworks.value))

const sourceNames = computed(
  () => new Map(sources.value.map((s) => [String(s.id), s.name])),
)
const frameworkNames = computed(
  () => new Map(frameworks.value.map((f) => [String(f.id), f.name])),
)

/** RELEASE 类资讯的 sourceId 是 framework_watch.id(独立 ID 空间),其余类别查资讯源 */
function sourceNameOf(id: string | number, category?: string): string {
  const name = (category === 'RELEASE' ? frameworkNames : sourceNames).value.get(String(id))
  if (name) return name
  return category === 'RELEASE' ? '框架关注' : `来源 #${id}`
}

async function load(reset: boolean) {
  const token = ++seq
  loading.value = true
  err.value = ''
  try {
    const res = await listNews({
      category: tab.value === 'ALL' ? undefined : tab.value,
      sourceId: sourceId.value || undefined,
      page: page.value,
      size: 20,
    })
    if (token !== seq) return
    records.value = reset ? res.records : [...records.value, ...res.records]
    total.value = Number(res.total)
  } catch (e) {
    if (token !== seq) return
    err.value = (e as Error).message || '资讯加载失败'
    if (reset) {
      records.value = []
      total.value = 0
    }
  } finally {
    if (token === seq) loading.value = false
  }
}

function loadMore() {
  page.value += 1
  void load(false)
}

function retry() {
  page.value = 1
  void load(true)
}

// 切 tab 换选项集时,保留原选择会跨 ID 空间或指向不存在/不相关来源 → 重置
watch(tab, () => {
  if (!sourceOptions.value.some((o) => o.value === sourceId.value)) sourceId.value = ''
})

watch([tab, sourceId], () => {
  page.value = 1
  void load(true)
})

onMounted(async () => {
  try {
    sources.value = await fetchSources()
  } catch {
    sources.value = []
  }
  try {
    frameworks.value = await fetchFrameworks()
  } catch {
    frameworks.value = []
  }
  await load(true)
})

async function open(n: NewsItem) {
  let item = n
  try {
    item = await fetchNewsDetail(n.id)
  } catch {
    // 列表字段兜底
  }
  current.value = item
  if (dialogEl.value && !dialogEl.value.open) dialogEl.value.showModal()
}

function closeModal() {
  dialogEl.value?.close()
}

function onAiDone(text: string) {
  if (current.value) current.value.aiSummary = text
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <PageHeader title="资讯" description="聚合 HN / GitHub / V2EX 等来源的技术热点,点击卡片查看详情与 AI 解读" />

    <div class="flex flex-wrap items-center gap-3">
      <UnderlineTabs v-model="tab" :tabs="TABS" class="min-w-0 flex-1" />
      <select v-model="sourceId" class="select select-sm w-44 border-base-300" aria-label="来源筛选">
        <option value="">全部来源</option>
        <option v-for="o in sourceOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
      </select>
    </div>

    <div v-if="err" class="flex items-center justify-between rounded-box border border-error/30 bg-error/5 px-4 py-3 text-sm text-error">
      <span>{{ err }}</span>
      <button class="btn btn-ghost btn-sm text-error" @click="retry">重试</button>
    </div>

    <div v-if="loading && !records.length" class="flex justify-center py-16">
      <span class="loading loading-spinner loading-lg text-base-content/30"></span>
    </div>

    <div
      v-else-if="!records.length && !err"
      class="rounded-box border border-base-300 bg-base-100 px-6 py-14 text-center text-sm text-base-content/60"
    >
      暂无资讯。请到「设置」页面添加信息源并采集,或等待定时采集完成。
    </div>

    <template v-else>
      <div class="flex flex-col gap-3">
        <NewsCard
          v-for="n in records"
          :key="n.id"
          :news="n"
          :source-name="sourceNameOf(n.sourceId, n.category)"
          @open="open(n)"
        />
      </div>

      <button
        v-if="records.length < total"
        class="btn btn-outline btn-sm self-center border-base-300"
        :disabled="loading"
        @click="loadMore"
      >
        <span v-if="loading" class="loading loading-spinner loading-xs"></span>
        {{ loading ? '加载中…' : '加载更多' }}
      </button>
    </template>

    <dialog ref="dialogEl" class="modal" @close="current = null">
      <div v-if="current" class="modal-box max-w-3xl border border-base-300 bg-base-100">
        <button
          class="btn btn-circle btn-ghost btn-sm absolute right-3 top-3"
          aria-label="关闭"
          @click="closeModal"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" class="h-4 w-4">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>

        <h2 class="pr-8 text-lg font-semibold leading-snug tracking-tight">
          <a :href="current.url" target="_blank" rel="noreferrer" class="link link-primary no-underline hover:underline">
            {{ current.title }}
          </a>
        </h2>

        <div class="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-base-content/60">
          <span class="badge badge-ghost badge-sm font-medium">{{ CATEGORY_LABEL[current.category] }}</span>
          <span>{{ sourceNameOf(current.sourceId, current.category) || `来源 #${current.sourceId}` }}</span>
          <span v-if="current.publishedAt">· {{ fmtTime(current.publishedAt) }}</span>
          <span v-if="current.author">· {{ current.author }}</span>
          <span v-if="Number(current.score) > 0" class="badge badge-secondary badge-sm">{{ current.score }}</span>
        </div>

        <div
          v-if="current.content || current.summary"
          class="mt-4 max-h-[75vh] overflow-y-auto rounded-box border border-base-300 bg-base-200/60 p-4"
        >
          <RichContent :source="current.content || current.summary || ''" mode="auto" />
        </div>

        <!-- 显式 key:详情竞态切换 current 时强制重建面板,避免旧解读串扰新条目 -->
        <AiPanel
          :key="current.id"
          class="mt-4"
          :news-id="current.id"
          :existing="current.aiSummary"
          @done="onAiDone"
        />

        <div class="modal-action">
          <button class="btn btn-sm" @click="closeModal">关闭</button>
        </div>
      </div>

      <form method="dialog" class="modal-backdrop">
        <button>关闭</button>
      </form>
    </dialog>
  </div>
</template>
