<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { fetchProxy, updateProxy } from '../../api/settings'
import { useToast } from '../../composables/useToast'
import type { ProxyConfig, ProxyPayload } from '../../types'

const PASSWORD_MASK = '********'

const config = ref<ProxyConfig | null>(null)
const loading = ref(false)
const saving = ref(false)
const err = ref('')

const form = ref({
  enabled: true,
  host: '127.0.0.1',
  port: 7890,
  username: '',
  password: '',
  hasPassword: false,
})

const { toast, showToast } = useToast()

async function load() {
  loading.value = true
  err.value = ''
  try {
    const cfg = await fetchProxy()
    config.value = cfg
    form.value = {
      enabled: cfg.enabled,
      host: cfg.host,
      port: cfg.port,
      username: cfg.username ?? '',
      password: '',
      hasPassword: !!cfg.password,
    }
  } catch (e) {
    err.value = (e as Error).message || '代理配置加载失败'
  } finally {
    loading.value = false
  }
}

async function save() {
  if (!form.value.host.trim()) {
    err.value = '请填写代理主机地址'
    return
  }
  if (!Number.isInteger(form.value.port) || form.value.port < 1 || form.value.port > 65535) {
    err.value = '代理端口需为 1-65535 的整数'
    return
  }
  err.value = ''
  saving.value = true
  const payload: ProxyPayload = {
    enabled: form.value.enabled,
    host: form.value.host.trim(),
    port: form.value.port,
  }
  if (form.value.username.trim()) payload.username = form.value.username.trim()
  // 未修改密码则传掩码,后端识别为"不修改";清空则传空串
  payload.password = form.value.password ? form.value.password : PASSWORD_MASK
  try {
    await updateProxy(payload)
    showToast('代理设置已保存')
    void load()
  } catch (e) {
    err.value = (e as Error).message || '保存失败'
  } finally {
    saving.value = false
  }
}

onMounted(() => void load())
</script>

<template>
  <section class="flex flex-col gap-4">
    <div class="flex items-center justify-between">
      <h2 class="text-base font-semibold tracking-tight">代理配置</h2>
    </div>

    <div v-if="err" class="flex items-center justify-between rounded-box border border-error/30 bg-error/5 px-4 py-3 text-sm text-error">
      <span>{{ err }}</span>
      <button class="btn btn-ghost btn-sm" @click="load">重试</button>
    </div>

    <div v-if="loading" class="flex justify-center py-10">
      <span class="loading loading-spinner loading-lg text-base-content/30"></span>
    </div>

    <form v-else-if="config" class="flex flex-col gap-4" @submit.prevent="save">
      <div class="rounded-box border border-base-300 bg-base-100 p-5">
        <label class="flex cursor-pointer items-center gap-3 pb-4">
          <input v-model="form.enabled" type="checkbox" class="toggle toggle-primary" />
          <span class="text-sm">
            启用代理
            <span class="block text-xs text-base-content/50">所有出站 HTTP(来源抓取 / AI / 框架 / 工具)将经由该代理访问</span>
          </span>
        </label>

        <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <fieldset class="fieldset">
            <legend class="fieldset-legend">代理地址</legend>
            <input v-model="form.host" class="input input-sm w-full font-mono" placeholder="例:127.0.0.1" />
          </fieldset>
          <fieldset class="fieldset">
            <legend class="fieldset-legend">端口</legend>
            <input v-model.number="form.port" type="number" class="input input-sm w-full font-mono" placeholder="例:7890" />
          </fieldset>
          <div class="hidden sm:block"></div>
        </div>

        <div class="grid grid-cols-1 gap-3 pt-3 sm:grid-cols-2">
          <fieldset class="fieldset">
            <legend class="fieldset-legend">用户名(可选)</legend>
            <input v-model="form.username" class="input input-sm w-full font-mono" placeholder="代理认证用户名,无则留空" />
          </fieldset>
          <fieldset class="fieldset">
            <legend class="fieldset-legend">密码(可选)</legend>
            <input
              v-model="form.password"
              type="password"
              class="input input-sm w-full font-mono"
              :placeholder="form.hasPassword ? '已设置,如需修改请重新输入' : '代理认证密码,无则留空'"
            />
          </fieldset>
        </div>

        <p class="pt-3 text-xs text-base-content/50">
          未启用时后端直连;仅有用户名/密码的代理才需要填写认证。修改后即刻生效,无需重启。
        </p>
      </div>

      <div class="flex justify-end">
        <button type="submit" class="btn btn-sm btn-primary" :disabled="saving">
          <span v-if="saving" class="loading loading-spinner loading-xs"></span>
          {{ saving ? '保存中…' : '保存' }}
        </button>
      </div>
    </form>

    <div class="toast toast-end">
      <div v-if="toast" class="alert" :class="toast.ok ? 'alert-success' : 'alert-error'">
        <span>{{ toast.msg }}</span>
      </div>
    </div>
  </section>
</template>
