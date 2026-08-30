<script setup lang="ts">
import { onMounted, ref } from 'vue'
import {
  createFramework,
  deleteFramework,
  fetchFrameworks,
  refreshFramework,
} from '../../api/settings'
import ConfirmDialog from '../ui/ConfirmDialog.vue'
import { useCrudList } from '../../composables/useCrudList'
import type { FrameworkWatch } from '../../types'
import { normalizeRepo } from '../../utils/framework'

const PAGE_SIZE = 20

const {
  items: records,
  total,
  page,
  loading,
  err,
  load,
  loadMore,
  removeItem,
  toast,
  showToast,
} = useCrudList<FrameworkWatch>({
  fetchPage: (p) => fetchFrameworks(p, PAGE_SIZE),
  mode: 'append',
  fallbackError: '框架关注加载失败',
  reloadAfterRemove: 'reset',
})

const confirmRef = ref<InstanceType<typeof ConfirmDialog> | null>(null)

const name = ref('')
const repo = ref('')
const formErr = ref('')
const saving = ref(false)
const refreshingId = ref<string | number | null>(null)

async function add() {
  formErr.value = ''
  if (!name.value.trim()) {
    formErr.value = '请填写框架名称'
    return
  }
  if (!repo.value.trim()) {
    formErr.value = '请填写 GitHub 仓库(owner/repo)'
    return
  }
  saving.value = true
  try {
    await createFramework({ name: name.value.trim(), githubRepo: normalizeRepo(repo.value) })
    showToast('已添加框架关注')
    name.value = ''
    repo.value = ''
    await load(true)
  } catch (e) {
    formErr.value = (e as Error).message || '添加失败'
  } finally {
    saving.value = false
  }
}

async function refresh(f: FrameworkWatch) {
  refreshingId.value = f.id
  try {
    const updated = await refreshFramework(f.id)
    const i = records.value.findIndex((r) => r.id === f.id)
    if (i >= 0) records.value[i] = { ...records.value[i], ...updated }
    showToast(`已更新: ${updated.latestVersion || '-'}`)
  } catch (e) {
    showToast((e as Error).message || '获取失败', false)
  } finally {
    refreshingId.value = null
  }
}

async function remove(f: FrameworkWatch) {
  if (!(await confirmRef.value?.confirm({ message: `确认删除框架关注「${f.name}」?`, danger: true }))) return
  await removeItem(f, deleteFramework)
}

onMounted(() => void load(true))
</script>

<template>
  <section class="flex flex-col gap-4">
    <h2 class="text-base font-semibold tracking-tight">框架关注</h2>

    <div class="rounded-box border border-base-300 bg-base-100">
      <div class="flex flex-row flex-wrap items-end gap-3 p-5">
        <fieldset class="fieldset w-52">
          <legend class="fieldset-legend">框架名称</legend>
          <input v-model="name" class="input input-sm w-full" placeholder="例:Vue 3" />
        </fieldset>
        <fieldset class="fieldset w-72">
          <legend class="fieldset-legend">GitHub 仓库(owner/repo)</legend>
          <input v-model="repo" class="input input-sm w-full font-mono"
                 placeholder="例:vuejs/core 或 https://github.com/vuejs/core.git" />
        </fieldset>
        <button class="btn btn-sm btn-primary" :disabled="saving" @click="add">
          <span v-if="saving" class="loading loading-spinner loading-xs"></span>
          {{ saving ? '添加中…' : '添加' }}
        </button>
        <p v-if="formErr" class="w-full text-sm text-error">{{ formErr }}</p>
      </div>
    </div>

    <div v-if="err" class="flex items-center justify-between rounded-box border border-error/30 bg-error/5 px-4 py-3 text-sm text-error">
      <span>{{ err }}</span>
      <button class="btn btn-ghost btn-sm text-error" @click="load(true)">重试</button>
    </div>

    <div v-if="loading && !records.length" class="flex justify-center py-10">
      <span class="loading loading-spinner loading-lg text-base-content/30"></span>
    </div>

    <template v-else-if="records.length">
      <div class="overflow-x-auto rounded-box border border-base-300 bg-base-100">
        <table class="table table-sm">
          <thead class="text-xs font-medium uppercase tracking-wider text-base-content/50">
            <tr>
              <th>名称</th>
              <th>GitHub 仓库</th>
              <th>最新版本</th>
              <th class="text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="f in records" :key="f.id">
              <td class="font-medium">{{ f.name }}</td>
              <td class="font-mono text-xs">{{ normalizeRepo(f.githubRepo) }}</td>
              <td>
                <span v-if="f.latestVersion" class="badge badge-success badge-sm">{{ f.latestVersion }}</span>
                <span v-else class="text-base-content/40">—</span>
              </td>
              <td class="text-right whitespace-nowrap">
                <button
                  class="btn btn-xs btn-outline"
                  :disabled="refreshingId === f.id"
                  @click="refresh(f)"
                >
                  <span v-if="refreshingId === f.id" class="loading loading-spinner loading-xs"></span>
                  {{ refreshingId === f.id ? '刷新中' : '刷新' }}
                </button>
                <button class="btn btn-ghost btn-xs text-error" @click="remove(f)">删除</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <button
        v-if="records.length < total"
        class="btn btn-outline btn-sm self-center"
        :disabled="loading"
        @click="loadMore"
      >
        <span v-if="loading" class="loading loading-spinner loading-xs"></span>
        {{ loading ? '加载中…' : '加载更多' }}
      </button>
    </template>

    <div v-else-if="!loading" class="rounded-box border border-base-300 bg-base-100 px-6 py-10 text-center text-sm text-base-content/60">
      暂无框架关注,在上方添加一个 GitHub 仓库开始跟踪版本更新。
    </div>

    <ConfirmDialog ref="confirmRef" />

    <div class="toast toast-end">
      <div v-if="toast" class="alert" :class="toast.ok ? 'alert-success' : 'alert-error'">
        <span>{{ toast.msg }}</span>
      </div>
    </div>
  </section>
</template>
