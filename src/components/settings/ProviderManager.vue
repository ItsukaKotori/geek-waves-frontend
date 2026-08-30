<script setup lang="ts">
import { onMounted, ref, useTemplateRef } from 'vue'
import {
  createProvider,
  deleteProvider,
  fetchProviders,
  setDefaultProvider,
  updateProvider,
} from '../../api/settings'
import ConfirmDialog from '../ui/ConfirmDialog.vue'
import { useCrudList } from '../../composables/useCrudList'
import type { AiProvider, ProviderPayload } from '../../types'

const VENDOR_LABEL: Record<string, string> = {
  OPENAI_COMPAT: 'OpenAI 兼容',
  ANTHROPIC: 'Anthropic',
}

const VENDOR_HINTS = [
  { vendor: 'DeepSeek', url: 'https://api.deepseek.com' },
  { vendor: 'OpenAI', url: 'https://api.openai.com' },
  { vendor: 'Ollama', url: 'http://localhost:11434/v1' },
  { vendor: 'Anthropic', url: 'https://api.anthropic.com' },
]

interface ProviderForm {
  name: string
  vendor: string
  baseUrl: string
  model: string
  apiKey: string
  enabled: boolean
  isDefault: boolean
}

const dialogEl = useTemplateRef<HTMLDialogElement>('dialogEl')

const {
  items: providers,
  loading,
  err,
  load,
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
} = useCrudList<AiProvider, ProviderForm>({
  fetchPage: () => fetchProviders(),
  fallbackError: 'AI 配置加载失败',
  dialog: {
    dialogEl,
    blank: () => ({
      name: '',
      vendor: 'OPENAI_COMPAT',
      baseUrl: '',
      model: '',
      apiKey: '',
      enabled: true,
      isDefault: false,
    }),
    fromItem: (p) => ({
      name: p.name,
      vendor: p.vendor,
      baseUrl: p.baseUrl ?? '',
      model: p.model ?? '',
      apiKey: '',
      enabled: p.enabled,
      isDefault: p.isDefault,
    }),
    submit: async (id, f) => {
      const payload: ProviderPayload = {
        name: f.name.trim(),
        vendor: f.vendor,
        enabled: f.enabled,
        isDefault: f.isDefault,
      }
      if (f.baseUrl.trim()) payload.baseUrl = f.baseUrl.trim()
      if (f.model.trim()) payload.model = f.model.trim()
      const key = f.apiKey.trim()
      if (key) payload.apiKey = key
      if (id) await updateProvider(id, payload)
      else await createProvider(payload)
    },
    validate: (f) => (f.name.trim() ? '' : '请填写名称'),
    savedToast: { add: 'AI 配置已新增', edit: '已保存修改' },
  },
})

const confirmRef = ref<InstanceType<typeof ConfirmDialog> | null>(null)

function providerPayloadOf(p: AiProvider): ProviderPayload {
  const base: ProviderPayload = {
    name: p.name,
    vendor: p.vendor,
    enabled: p.enabled,
    isDefault: p.isDefault,
  }
  if (p.baseUrl != null) base.baseUrl = p.baseUrl
  if (p.model != null) base.model = p.model
  return base
}

function toggleEnabled(p: AiProvider) {
  void toggleRow(p, (it, next) => updateProvider(it.id, { ...providerPayloadOf(it), enabled: next }))
}

async function setDefault(p: AiProvider) {
  try {
    await setDefaultProvider(p.id)
    showToast(`已将「${p.name}」设为默认`)
    void load()
  } catch (e) {
    showToast((e as Error).message || '设置失败', false)
  }
}

async function remove(p: AiProvider) {
  if (!(await confirmRef.value?.confirm({ message: `确认删除 AI 配置「${p.name}」?`, danger: true }))) return
  await removeItem(p, deleteProvider)
}

onMounted(() => void load())
</script>

<template>
  <section class="flex flex-col gap-4">
    <div class="flex items-center justify-between">
      <h2 class="text-base font-semibold tracking-tight">AI 配置</h2>
      <button class="btn btn-sm btn-primary" @click="openAdd">新增 AI 配置</button>
    </div>

    <div v-if="err" class="flex items-center justify-between rounded-box border border-error/30 bg-error/5 px-4 py-3 text-sm text-error">
      <span>{{ err }}</span>
      <button class="btn btn-ghost btn-sm text-error" @click="load()">重试</button>
    </div>

    <div v-if="loading && !providers.length" class="flex justify-center py-10">
      <span class="loading loading-spinner loading-lg text-base-content/30"></span>
    </div>

    <div v-else-if="!providers.length && !err" class="rounded-box border border-base-300 bg-base-100 px-6 py-10 text-center text-sm text-base-content/60">
      暂无 AI 配置,点击右上角「新增 AI 配置」添加(如 DeepSeek / OpenAI / Ollama / Anthropic)。
    </div>

    <div v-else class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <article v-for="p in providers" :key="p.id" class="rounded-box border border-base-300 bg-base-100 transition-colors hover:border-primary/40">
        <div class="flex flex-col gap-2.5 p-5">
          <div class="flex items-start justify-between gap-2">
            <h3 class="flex items-center gap-2 text-base font-semibold tracking-tight">
              {{ p.name }}
              <span v-if="p.isDefault" class="badge badge-primary badge-sm">默认</span>
            </h3>
            <input
              type="checkbox"
              class="toggle toggle-sm"
              :checked="p.enabled"
              @change="toggleEnabled(p)"
            />
          </div>

          <div class="flex flex-wrap items-center gap-2 text-sm">
            <span class="badge badge-ghost badge-sm">{{ VENDOR_LABEL[p.vendor] ?? p.vendor }}</span>
            <span class="badge badge-outline badge-sm font-mono">{{ p.model || '未设置模型' }}</span>
          </div>

          <p class="truncate font-mono text-xs text-base-content/60" :title="p.baseUrl">{{ p.baseUrl || '—' }}</p>

          <p class="text-xs text-base-content/50">
            密钥:
            <span v-if="p.apiKeyEnc" class="font-mono">••••••</span>
            <span v-else>未设置</span>
          </p>

          <div class="flex justify-end gap-1 border-t border-base-300 pt-2.5">
            <button class="btn btn-ghost btn-xs" :disabled="p.isDefault" @click="setDefault(p)">
              设为默认
            </button>
            <button class="btn btn-ghost btn-xs" @click="openEdit(p)">编辑</button>
            <button class="btn btn-ghost btn-xs text-error" @click="remove(p)">删除</button>
          </div>
        </div>
      </article>
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
        <h3 class="text-lg font-semibold tracking-tight">{{ editingId ? '编辑 AI 配置' : '新增 AI 配置' }}</h3>

        <form class="mt-4 flex flex-col gap-3" @submit.prevent="save">
          <div class="grid grid-cols-2 gap-3">
            <fieldset class="fieldset">
              <legend class="fieldset-legend">名称</legend>
              <input v-model="form.name" class="input input-sm w-full" placeholder="例:DeepSeek" />
            </fieldset>
            <fieldset class="fieldset">
              <legend class="fieldset-legend">Vendor</legend>
              <select v-model="form.vendor" class="select select-sm w-full">
                <option v-for="(label, v) in VENDOR_LABEL" :key="v" :value="v">{{ label }}</option>
              </select>
            </fieldset>
          </div>
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Base URL</legend>
            <input v-model="form.baseUrl" class="input input-sm w-full font-mono" placeholder="https://api.deepseek.com" />
          </fieldset>
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Model</legend>
            <input v-model="form.model" class="input input-sm w-full font-mono" placeholder="deepseek-chat" />
          </fieldset>
          <fieldset class="fieldset">
            <legend class="fieldset-legend">API Key</legend>
            <input
              v-model="form.apiKey"
              type="password"
              class="input input-sm w-full font-mono"
              :placeholder="editingId ? '已设置,如需修改请重新输入' : '请输入 API Key'"
            />
          </fieldset>

          <ul class="text-xs opacity-60">
            <li v-for="h in VENDOR_HINTS" :key="h.vendor">
              {{ h.vendor }}:<span class="font-mono ms-1">{{ h.url }}</span>
            </li>
          </ul>

          <div class="flex items-center gap-6">
            <label class="flex cursor-pointer items-center gap-2 text-sm">
              <input v-model="form.enabled" type="checkbox" class="toggle toggle-sm" />
              启用
            </label>
            <label class="flex cursor-pointer items-center gap-2 text-sm">
              <input v-model="form.isDefault" type="checkbox" class="checkbox checkbox-sm" />
              设为默认
            </label>
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

    <ConfirmDialog ref="confirmRef" />

    <div class="toast toast-end">
      <div v-if="toast" class="alert" :class="toast.ok ? 'alert-success' : 'alert-error'">
        <span>{{ toast.msg }}</span>
      </div>
    </div>
  </section>
</template>
