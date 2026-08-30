<script setup lang="ts">
import { ref } from 'vue'

/**
 * ConfirmDialog:DaisyUI 原生 <dialog> 确认框,替代同步阻塞的 window.confirm。
 * 用法:挂载后经模板引用调用 confirm(options),await 返回 Promise<boolean>
 * (确认=true;取消、ESC、遮罩关闭=false)。挂起期间重复调用直接视为取消,
 * 不叠加弹窗;确认/取消都会先结算再关闭,原生 close 不重复结算。
 */

export interface ConfirmOptions {
  /** 正文消息 */
  message: string
  /** 可选标题 */
  title?: string
  /** 确认按钮文案(默认「确认」) */
  confirmText?: string
  /** 取消按钮文案(默认「取消」) */
  cancelText?: string
  /** 危险操作:确认按钮使用 btn-error */
  danger?: boolean
}

const dialogEl = ref<HTMLDialogElement | null>(null)
const current = ref<ConfirmOptions | null>(null)
let settle: ((ok: boolean) => void) | null = null

function confirm(options: ConfirmOptions): Promise<boolean> {
  if (settle) return Promise.resolve(false)
  current.value = options
  dialogEl.value?.showModal()
  return new Promise((resolve) => {
    settle = resolve
  })
}

function answer(ok: boolean) {
  const done = settle
  settle = null
  dialogEl.value?.close()
  done?.(ok)
}

/** ESC / 遮罩等原生关闭一律视为取消;answer 已结算时为幂等空操作 */
function onNativeClose() {
  const done = settle
  settle = null
  done?.(false)
}

defineExpose({ confirm })
</script>

<template>
  <dialog ref="dialogEl" class="modal" @close="onNativeClose">
    <div class="modal-box border border-base-300 bg-base-100">
      <h3 v-if="current?.title" class="text-lg font-semibold tracking-tight">
        {{ current.title }}
      </h3>
      <p class="mt-1 text-sm leading-relaxed text-base-content/80">{{ current?.message }}</p>
      <div class="modal-action">
        <button type="button" class="btn btn-sm" @click="answer(false)">
          {{ current?.cancelText ?? '取消' }}
        </button>
        <button
          type="button"
          class="btn btn-sm"
          :class="current?.danger ? 'btn-error' : 'btn-primary'"
          @click="answer(true)"
        >
          {{ current?.confirmText ?? '确认' }}
        </button>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop">
      <button>关闭</button>
    </form>
  </dialog>
</template>
