<script setup lang="ts">
import { ref } from 'vue'
import {
  createProbeTarget,
  deleteProbeTarget,
  fetchProbeTargets,
  probeNow,
  updateProbeTarget,
} from '../../api/monitor'
import { usePolling } from '../../composables/usePolling'
import { useToast } from '../../composables/useToast'
import type { ProbeTarget, ProbeTargetPayload } from '../../types/monitor'
import { fmtTime } from '../../utils/news'

const records = ref<ProbeTarget[]>([])
const loading = ref(false)
const err = ref('')
const probingId = ref<string | number>(0)

const dialogEl = ref<HTMLDialogElement | null>(null)
const saving = ref(false)
const formErr = ref('')
const editingId = ref<string | number>(0)
const form = ref({
  name: '',
  host: '',
  port: 8082,
  timeoutMs: 2000,
  intervalSeconds: 60,
  sortOrder: 0,
})

const { toast, showToast } = useToast()

const STATUS_BADGE: Record<string, string> = {
  UP: 'badge-success',
  DOWN: 'badge-error',
  TIMEOUT: 'badge-warning',
}

async function load() {
  loading.value = true
  err.value = ''
  try {
    records.value = await fetchProbeTargets()
  } catch (e) {
    err.value = (e as Error).message || '探测目标加载失败'
    records.value = []
    throw e
  } finally {
    loading.value = false
  }
}

/** 30s 轮询与后端 probe 周期对齐;连续失败熔断由 err 横幅呈现 */
usePolling(load, {
  intervalMs: 30_000,
  onHalted: () => (err.value = '连续刷新失败,已暂停'),
})

function payloadOf(): ProbeTargetPayload {
  return {
    name: form.value.name.trim(),
    host: form.value.host.trim(),
    port: Number(form.value.port),
    timeoutMs: Number(form.value.timeoutMs) || 2000,
    intervalSeconds: Number(form.value.intervalSeconds) || 60,
    sortOrder: Number(form.value.sortOrder) || 0,
  }
}

async function toggleEnabled(t: ProbeTarget) {
  const next = !t.enabled
  t.enabled = next
  try {
    const saved = await updateProbeTarget(t.id, { ...payloadFromTarget(t), enabled: next })
    Object.assign(t, saved)
    showToast('已更新启用状态')
  } catch (e) {
    t.enabled = !next
    showToast((e as Error).message || '更新失败', false)
  }
}

function payloadFromTarget(t: ProbeTarget): ProbeTargetPayload {
  return {
    name: t.name,
    host: t.host,
    port: t.port,
    enabled: t.enabled,
    timeoutMs: Number(t.timeoutMs) || 2000,
    intervalSeconds: Number(t.intervalSeconds) || 60,
    sortOrder: Number(t.sortOrder) || 0,
  }
}

async function probe(t: ProbeTarget) {
  probingId.value = t.id
  try {
    const saved = await probeNow(t.id)
    Object.assign(t, saved)
    showToast(
      saved.lastStatus === 'UP'
        ? `连通 · ${saved.lastLatencyMs}ms`
        : `状态 ${saved.lastStatus}`,
      saved.lastStatus === 'UP',
    )
  } catch (e) {
    showToast((e as Error).message || '探测失败', false)
  } finally {
    probingId.value = 0
  }
}

async function remove(t: ProbeTarget) {
  if (!window.confirm(`确认删除探测目标「${t.name}」?`)) return
  try {
    await deleteProbeTarget(t.id)
    showToast('已删除')
    void load().catch(() => {})
  } catch (e) {
    showToast((e as Error).message || '删除失败', false)
  }
}

function openAdd() {
  editingId.value = 0
  form.value = { name: '', host: '', port: 8082, timeoutMs: 2000, intervalSeconds: 60, sortOrder: 0 }
  formErr.value = ''
  dialogEl.value?.showModal()
}

function openEdit(t: ProbeTarget) {
  editingId.value = t.id
  form.value = {
    name: t.name,
    host: t.host,
    port: t.port,
    timeoutMs: Number(t.timeoutMs) || 2000,
    intervalSeconds: Number(t.intervalSeconds) || 60,
    sortOrder: Number(t.sortOrder) || 0,
  }
  formErr.value = ''
  dialogEl.value?.showModal()
}

function closeDialog() {
  dialogEl.value?.close()
}

function validate(): string {
  if (!form.value.name.trim()) return '请填写名称'
  if (!form.value.host.trim()) return '请填写主机地址'
  if (!Number.isInteger(Number(form.value.port)) || Number(form.value.port) < 1 || Number(form.value.port) > 65535)
    return '端口必须在 1-65535 之间'
  return ''
}

async function save() {
  const msg = validate()
  if (msg) {
    formErr.value = msg
    return
  }
  formErr.value = ''
  saving.value = true
  try {
    if (editingId.value) await updateProbeTarget(editingId.value, payloadOf())
    else await createProbeTarget(payloadOf())
    showToast(editingId.value ? '已保存修改' : '已新增探测目标')
    closeDialog()
    void load().catch(() => {})
  } catch (e) {
    formErr.value = (e as Error).message || '保存失败'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section class="flex flex-col gap-4">
    <div class="flex items-center justify-between">
      <h3 class="text-base font-semibold tracking-tight">端口服务探测</h3>
      <button class="btn btn-sm btn-primary" @click="openAdd">新增目标</button>
    </div>

    <div v-if="err" class="flex items-center justify-between rounded-box border border-error/30 bg-error/5 px-4 py-3 text-sm text-error">
      <span>{{ err }}</span>
      <button class="btn btn-ghost btn-sm text-error" @click="() => void load().catch(() => {})">重试</button>
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
              <th>目标</th>
              <th>状态</th>
              <th>延迟</th>
              <th>最近探测</th>
              <th>连续失败</th>
              <th class="text-center">启用</th>
              <th class="text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="t in records" :key="t.id">
              <td class="font-medium">{{ t.name }}</td>
              <td class="font-mono text-xs">{{ t.host }}:{{ t.port }}</td>
              <td>
                <span
                  v-if="t.lastStatus"
                  class="badge badge-sm"
                  :class="STATUS_BADGE[t.lastStatus] ?? 'badge-ghost'"
                  >{{ t.lastStatus }}</span
                >
                <span v-else class="text-base-content/40">未探测</span>
              </td>
              <td class="tabular-nums">{{ t.lastLatencyMs != null ? `${Number(t.lastLatencyMs)}ms` : '—' }}</td>
              <td class="whitespace-nowrap">{{ fmtTime(t.lastProbeAt) || '—' }}</td>
              <td class="tabular-nums">{{ t.failCount ?? 0 }}</td>
              <td class="text-center">
                <input
                  type="checkbox"
                  class="toggle toggle-sm"
                  :checked="t.enabled"
                  @change="toggleEnabled(t)"
                />
              </td>
              <td class="whitespace-nowrap text-right">
                <button class="btn btn-ghost btn-xs" :disabled="probingId === t.id" @click="probe(t)">
                  <span v-if="probingId === t.id" class="loading loading-spinner loading-xs"></span>
                  {{ probingId === t.id ? '探测中' : '立即探测' }}
                </button>
                <button class="btn btn-ghost btn-xs" @click="openEdit(t)">编辑</button>
                <button class="btn btn-ghost btn-xs text-error" @click="remove(t)">删除</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p
        v-for="t in records.filter((x) => x.lastError)"
        :key="`e-${t.id}`"
        class="text-xs text-base-content/50"
      >
        {{ t.name }}:{{ t.lastError }}
      </p>
    </template>

    <div v-else-if="!loading" class="rounded-box border border-base-300 bg-base-100 px-6 py-10 text-center text-sm text-base-content/60">
      暂无探测目标,点击右上角「新增目标」添加 host:port,例如本机后端 127.0.0.1:8082。
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
        <h3 class="text-lg font-semibold tracking-tight">{{ editingId ? '编辑探测目标' : '新增探测目标' }}</h3>

        <form class="mt-4 flex flex-col gap-3" @submit.prevent="save">
          <div class="grid grid-cols-2 gap-3">
            <fieldset class="fieldset">
              <legend class="fieldset-legend">名称</legend>
              <input v-model="form.name" class="input input-sm w-full" placeholder="例:本机后端" />
            </fieldset>
            <fieldset class="fieldset">
              <legend class="fieldset-legend">主机地址</legend>
              <input v-model="form.host" class="input input-sm w-full font-mono" placeholder="例:127.0.0.1" />
            </fieldset>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <fieldset class="fieldset">
              <legend class="fieldset-legend">端口</legend>
              <input v-model.number="form.port" type="number" min="1" max="65535" class="input input-sm w-full" />
            </fieldset>
            <fieldset class="fieldset">
              <legend class="fieldset-legend">排序值</legend>
              <input v-model.number="form.sortOrder" type="number" class="input input-sm w-full" />
            </fieldset>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <fieldset class="fieldset">
              <legend class="fieldset-legend">超时(毫秒,200-5000)</legend>
              <input v-model.number="form.timeoutMs" type="number" min="200" max="5000" step="100" class="input input-sm w-full" />
            </fieldset>
            <fieldset class="fieldset">
              <legend class="fieldset-legend">探测间隔(秒,10-86400)</legend>
              <input v-model.number="form.intervalSeconds" type="number" min="10" max="86400" class="input input-sm w-full" />
            </fieldset>
          </div>

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

    <div class="toast toast-end">
      <div v-if="toast" class="alert" :class="toast.ok ? 'alert-success' : 'alert-error'">
        <span>{{ toast.msg }}</span>
      </div>
    </div>
  </section>
</template>
