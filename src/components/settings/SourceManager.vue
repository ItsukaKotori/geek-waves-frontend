<script setup lang="ts">
import { onMounted, ref, useTemplateRef } from 'vue'
import {
  createSource,
  deleteSource,
  fetchSources,
  triggerFetch,
  updateSource,
} from '../../api/settings'
import ConfirmDialog from '../ui/ConfirmDialog.vue'
import { useCrudList } from '../../composables/useCrudList'
import type { InfoSource, SourcePayload } from '../../types'
import { fmtTime } from '../../utils/news'

const PAGE_SIZE = 20

const TYPE_LABEL: Record<string, string> = {
  HN_API: 'HN API',
  GITHUB_API: 'GitHub API',
  RSS: 'RSS',
  JSON_API: 'JSON API',
  HTML: 'HTML',
}

const STATUS_BADGE: Record<string, string> = {
  SUCCESS: 'badge-success',
  FAILED: 'badge-error',
  SKIPPED: 'badge-warning',
}

interface TypePreset {
  configJson: string
  refreshMinutes?: number
}

const PRESETS: Record<string, TypePreset> = {
  RSS: { configJson: '{"url":""}', refreshMinutes: 60 },
  JSON_API: {
    configJson: '{"itemsPath":"$[*]","titlePath":"$.title","urlPath":"$.url"}',
    refreshMinutes: 30,
  },
  HTML: {
    configJson: '{"listSelector":"li","titleSelector":">a"}',
    refreshMinutes: 30,
  },
  GITHUB_API: { configJson: '{"minStars":100,"tag":""}' },
  HN_API: { configJson: '{}' },
}

interface SourceForm {
  name: string
  code: string
  type: string
  baseUrl: string
  refreshMinutes: number
  sortOrder: number
  configJson: string
}

const dialogEl = useTemplateRef<HTMLDialogElement>('dialogEl')

const {
  items: records,
  loading,
  err,
  page,
  total,
  pages,
  load,
  go,
  removeItem,
  toggleEnabled: toggleRow,
  toast,
  showToast,
  editingId,
  form,
  saving,
  formErr,
  openAdd,
  openEdit,
  closeDialog,
  save,
} = useCrudList<InfoSource, SourceForm>({
  fetchPage: (p) => fetchSources(p, PAGE_SIZE),
  fallbackError: '信息源加载失败',
  dialog: {
    dialogEl,
    blank: () => ({
      name: '',
      code: '',
      type: 'RSS',
      baseUrl: '',
      refreshMinutes: 60,
      sortOrder: 0,
      configJson: PRESETS.RSS.configJson,
    }),
    fromItem: (s) => ({
      name: s.name,
      code: s.code,
      type: s.type,
      baseUrl: s.baseUrl ?? '',
      refreshMinutes: s.refreshMinutes == null ? 60 : Number(s.refreshMinutes),
      sortOrder: s.sortOrder == null ? 0 : Number(s.sortOrder),
      configJson: s.configJson ?? '',
    }),
    submit: async (id, f) => {
      const payload: SourcePayload = {
        name: f.name.trim(),
        code: f.code.trim(),
        type: f.type,
        baseUrl: f.baseUrl.trim() || undefined,
        configJson: f.configJson.trim() || undefined,
        sortOrder: Number(f.sortOrder) || 0,
        refreshMinutes: Number(f.refreshMinutes) || 0,
      }
      if (id) await updateSource(id, payload)
      else await createSource(payload)
    },
    validate: (f) => {
      if (!f.name.trim()) return '请填写名称'
      if (!f.code.trim()) return '请填写编码'
      const cfg = f.configJson.trim()
      if (cfg) {
        try {
          JSON.parse(cfg)
        } catch {
          return 'configJson 不是合法的 JSON'
        }
      }
      return ''
    },
    savedToast: { add: '已新增信息源', edit: '已保存修改' },
  },
})

const fetchingId = ref<number | string>(0)

const confirmRef = ref<InstanceType<typeof ConfirmDialog> | null>(null)

function sourcePayloadOf(s: InfoSource): SourcePayload {
  const p: SourcePayload = { name: s.name, code: s.code, type: s.type, enabled: s.enabled }
  if (s.baseUrl != null) p.baseUrl = s.baseUrl
  if (s.configJson != null) p.configJson = s.configJson
  const sort = Number(s.sortOrder)
  if (s.sortOrder != null && Number.isFinite(sort)) p.sortOrder = sort
  const rfm = Number(s.refreshMinutes)
  if (s.refreshMinutes != null && Number.isFinite(rfm)) p.refreshMinutes = rfm
  return p
}

function toggleEnabled(s: InfoSource) {
  void toggleRow(s, (it, next) => updateSource(it.id, { ...sourcePayloadOf(it), enabled: next }))
}

async function runFetch(s: InfoSource) {
  fetchingId.value = s.id
  try {
    const ok = await triggerFetch(s.id)
    showToast(ok ? '已触发采集,2 秒后刷新状态' : '采集触发失败', ok)
  } catch (e) {
    showToast((e as Error).message || '采集触发失败', false)
  } finally {
    fetchingId.value = 0
  }
  setTimeout(() => void load(), 2000)
}

async function remove(s: InfoSource) {
  if (!(await confirmRef.value?.confirm({ message: `确认删除信息源「${s.name}」?`, danger: true }))) return
  await removeItem(s, deleteSource)
}

function onTypeChange() {
  const preset = PRESETS[form.value.type]
  if (!preset) return
  const cur = form.value.configJson.trim()
  const untouched = !cur || Object.values(PRESETS).some((p) => p.configJson === cur)
  if (untouched) form.value.configJson = preset.configJson
  if (preset.refreshMinutes != null) form.value.refreshMinutes = preset.refreshMinutes
}

onMounted(() => void load())
</script>

<template>
  <section class="flex flex-col gap-4">
    <div class="flex items-center justify-between">
      <h2 class="text-base font-semibold tracking-tight">信息源管理</h2>
      <button class="btn btn-sm btn-primary" @click="openAdd">新增信息源</button>
    </div>

    <div v-if="err" class="flex items-center justify-between rounded-box border border-error/30 bg-error/5 px-4 py-3 text-sm text-error">
      <span>{{ err }}</span>
      <button class="btn btn-ghost btn-sm text-error" @click="load()">重试</button>
    </div>

    <div v-if="loading && !records.length" class="flex justify-center py-10">
      <span class="loading loading-spinner loading-lg text-base-content/30"></span>
    </div>

    <template v-else-if="records.length">
      <div class="overflow-x-auto rounded-box border border-base-300 bg-base-100">
        <table class="table table-sm">
          <thead class="text-xs font-medium uppercase tracking-wider text-base-content/50">
            <tr>
              <th>名称 / 编码</th>
              <th>类型</th>
              <th>状态</th>
              <th>刷新(分钟)</th>
              <th>最近采集</th>
              <th>错误</th>
              <th class="text-center">启用</th>
              <th class="text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in records" :key="s.id">
              <td>
                <div class="font-medium">{{ s.name }}</div>
                <div class="font-mono text-xs opacity-60">{{ s.code }}</div>
              </td>
              <td>
                <span class="badge badge-ghost badge-sm">{{ TYPE_LABEL[s.type] ?? s.type }}</span>
              </td>
              <td>
                <span
                  v-if="s.lastFetchStatus"
                  class="badge badge-sm"
                  :class="STATUS_BADGE[s.lastFetchStatus] ?? 'badge-ghost'"
                >
                  {{ s.lastFetchStatus }}
                </span>
                <span v-else class="text-base-content/40">—</span>
              </td>
              <td>{{ s.refreshMinutes != null ? Number(s.refreshMinutes) : '—' }}</td>
              <td class="whitespace-nowrap">{{ fmtTime(s.lastFetchAt) || '—' }}</td>
              <td>
                <p
                  v-if="s.lastError"
                  class="max-w-[14rem] truncate text-error"
                  :title="s.lastError"
                >
                  {{ s.lastError }}
                </p>
                <span v-else class="text-base-content/40">—</span>
              </td>
              <td class="text-center">
                <input
                  type="checkbox"
                  class="toggle toggle-sm"
                  :checked="s.enabled"
                  @change="toggleEnabled(s)"
                />
              </td>
              <td class="whitespace-nowrap text-right">
                <button
                  class="btn btn-ghost btn-xs"
                  :disabled="fetchingId === s.id"
                  @click="runFetch(s)"
                >
                  <span v-if="fetchingId === s.id" class="loading loading-spinner loading-xs"></span>
                  {{ fetchingId === s.id ? '采集中' : '手动刷新' }}
                </button>
                <button class="btn btn-ghost btn-xs" @click="openEdit(s)">编辑</button>
                <button class="btn btn-ghost btn-xs text-error" @click="remove(s)">删除</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="flex items-center justify-between text-sm">
        <span class="text-base-content/60">共 {{ total }} 条 · 第 {{ page }} / {{ Math.max(pages, 1) }} 页</span>
        <div class="join">
          <button class="btn btn-sm join-item" :disabled="page <= 1 || loading" @click="go(page - 1)">
            上一页
          </button>
          <button
            class="btn btn-sm join-item"
            :disabled="page >= Math.max(pages, 1) || loading"
            @click="go(page + 1)"
          >
            下一页
          </button>
        </div>
      </div>
    </template>

    <div v-else-if="!loading" class="rounded-box border border-base-300 bg-base-100 px-6 py-10 text-center text-sm text-base-content/60">
      暂无信息源,点击右上角「新增信息源」添加。
    </div>

    <dialog ref="dialogEl" class="modal" @close="formErr = ''">
      <div class="modal-box border border-base-300 bg-base-100">
        <button
          class="btn btn-circle btn-ghost btn-sm absolute right-3 top-3"
          aria-label="关闭"
          @click="closeDialog"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" class="h-4 w-4">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <h3 class="text-lg font-semibold tracking-tight">{{ editingId ? '编辑信息源' : '新增信息源' }}</h3>

        <form class="mt-4 flex flex-col gap-3" @submit.prevent="save">
          <div class="grid grid-cols-2 gap-3">
            <fieldset class="fieldset">
              <legend class="fieldset-legend">名称</legend>
              <input v-model="form.name" class="input input-sm w-full" placeholder="例:V2EX 热帖" />
            </fieldset>
            <fieldset class="fieldset">
              <legend class="fieldset-legend">编码</legend>
              <input v-model="form.code" class="input input-sm w-full font-mono" placeholder="例:v2ex" />
            </fieldset>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <fieldset class="fieldset">
              <legend class="fieldset-legend">类型</legend>
              <select v-model="form.type" class="select select-sm w-full" @change="onTypeChange">
                <option v-for="t in ['HN_API', 'GITHUB_API', 'RSS', 'JSON_API', 'HTML']" :key="t" :value="t">
                  {{ TYPE_LABEL[t] }}
                </option>
              </select>
            </fieldset>
            <fieldset class="fieldset">
              <legend class="fieldset-legend">Base URL(可选)</legend>
              <input v-model="form.baseUrl" class="input input-sm w-full font-mono" placeholder="例:https://api.example.com" />
            </fieldset>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <fieldset class="fieldset">
              <legend class="fieldset-legend">刷新间隔(分钟)</legend>
              <input v-model.number="form.refreshMinutes" type="number" min="1" class="input input-sm w-full" />
            </fieldset>
            <fieldset class="fieldset">
              <legend class="fieldset-legend">排序值</legend>
              <input v-model.number="form.sortOrder" type="number" class="input input-sm w-full" />
            </fieldset>
          </div>
          <fieldset class="fieldset">
            <legend class="fieldset-legend">configJson</legend>
            <textarea
              v-model="form.configJson"
              rows="5"
              class="textarea textarea-sm w-full font-mono"
              placeholder='{"url":""}'
            ></textarea>
          </fieldset>

          <p v-if="formErr" class="text-sm text-error">{{ formErr }}</p>

          <div class="modal-action">
            <button type="button" class="btn btn-sm" @click="closeDialog">取消</button>
            <button type="submit" class="btn btn-sm btn-primary" :disabled="saving">
              <span v-if="saving" class="loading loading-spinner loading-xs"></span>
              {{ saving ? '保存中…' : '保存' }}
            </button>
          </div>
        </form>
      </div>
      <form method="dialog" class="modal-backdrop">
        <button>关闭</button>
      </form>
    </dialog>

    <ConfirmDialog ref="confirmRef" />

    <div class="toast toast-end">
      <div v-if="toast" class="alert" :class="toast.ok ? 'alert-success' : 'alert-error'">
        <span>{{ toast.msg }}</span>
      </div>
    </div>
  </section>
</template>
