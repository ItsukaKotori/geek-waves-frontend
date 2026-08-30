<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  buildPool,
  generatePasswords,
  passwordEntropyBits,
  strengthOf,
  type PasswordCharsetKey,
  type StrengthTone,
} from '../../tools/passwordGen'
import { useCopy } from '../../composables/useCopy'
import { useToolState } from '../../composables/useToolState'
import ErrorBanner from '../ui/ErrorBanner.vue'

/**
 * 密码/Token 生成器(FE10 T2 批次一):Web Crypto 拒绝采样,禁 Math.random。
 * 语义选择(与 brief 的两个允许项对照):参数变化自动重生成(生成成本低,
 * 便于边调边看),「生成」按钮保留为显式动作 = 「再生成一批」。
 * 敏感纪律:生成结果不写 localStorage(useToolState 仅持久化生成参数)。
 */

interface PwdState {
  lower: boolean
  upper: boolean
  digits: boolean
  symbols: boolean
  excludeAmbiguous: boolean
  length: number
  batch: number
}

/** 生成参数持久化(key 与注册表一致);results 有意不在持久化结构中 */
const { state, reset } = useToolState<PwdState>('pwd', {
  lower: true,
  upper: true,
  digits: true,
  symbols: true,
  excludeAmbiguous: true,
  length: 16,
  batch: 1,
})

const results = ref<string[]>([])
const errorMessage = ref('')
const { copied, copy } = useCopy()
const copiedIndex = ref(-1)

const charsetOptions: Array<{ key: PasswordCharsetKey; label: string }> = [
  { key: 'lower', label: '小写 a-z' },
  { key: 'upper', label: '大写 A-Z' },
  { key: 'digits', label: '数字 0-9' },
  { key: 'symbols', label: '符号 !@#' },
]

/** 字符池由当前参数派生(空池时报错信息,池本身不暴露给模板) */
const pool = computed<string | null>(() => {
  try {
    return buildPool({ ...state })
  } catch (e) {
    return null
  }
})

const poolError = computed(() => {
  try {
    buildPool({ ...state })
    return ''
  } catch (e) {
    return (e as Error).message || '字符池构建失败'
  }
})

/** 熵估算与强度(池合法时才有值) */
const strength = computed(() => {
  if (pool.value === null) return null
  const bits = passwordEntropyBits(pool.value.length, state.length)
  return { bits, ...strengthOf(bits) }
})

const STRENGTH_BADGE: Record<StrengthTone, string> = {
  weak: 'badge-error badge-soft',
  fair: 'badge-warning badge-soft',
  strong: 'badge-success badge-soft',
  excellent: 'badge-success',
}

/** 生成(显式动作;参数 watch 亦调用,失败路径收口为 errorMessage) */
function generate(): void {
  copiedIndex.value = -1
  try {
    results.value = generatePasswords(buildPool({ ...state }), state.length, state.batch)
    errorMessage.value = ''
  } catch (e) {
    results.value = []
    errorMessage.value = (e as Error).message || '生成失败'
  }
}

/** 参数变化自动重生成(生成器例外语义:实时调参 + 显式再生成并存) */
watch(
  () => ({ ...state }),
  () => {
    if (poolError.value !== '') {
      results.value = []
      errorMessage.value = poolError.value
      return
    }
    generate()
  },
  { immediate: true },
)

function copyAt(index: number): void {
  const pwd = results.value[index]
  if (pwd === undefined) return
  void copy(pwd)
  copiedIndex.value = index
}

function copyAll(): void {
  void copy(results.value.join('\n'))
  copiedIndex.value = -2
}

function onReset(): void {
  reset()
  generate()
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <h2 class="text-base font-semibold tracking-tight">密码 / Token 生成器</h2>

    <div class="grid gap-3 md:grid-cols-2">
      <div class="flex flex-col gap-2">
        <div class="flex flex-wrap gap-1" role="group" aria-label="字符集选择">
          <label
            v-for="opt in charsetOptions"
            :key="opt.key"
            class="label cursor-pointer gap-1.5 rounded border border-base-300 px-2 py-1 text-sm"
          >
            <input
              v-model="state[opt.key]"
              type="checkbox"
              :data-testid="`pwd-charset-${opt.key}`"
              class="checkbox checkbox-xs"
            />
            <span class="font-mono">{{ opt.label }}</span>
          </label>
        </div>

        <label class="label cursor-pointer justify-start gap-2 text-sm">
          <input
            v-model="state.excludeAmbiguous"
            type="checkbox"
            data-testid="pwd-exclude"
            class="checkbox checkbox-xs"
          />
          <span>排除易混淆字符(0O1lI)</span>
        </label>

        <label class="flex items-center gap-2 text-sm">
          <span class="shrink-0 opacity-70">长度 {{ state.length }}</span>
          <input
            v-model.number="state.length"
            type="range"
            data-testid="pwd-length"
            :min="PASSWORD_MIN_LENGTH"
            :max="PASSWORD_MAX_LENGTH"
            class="range range-primary range-xs flex-1"
          />
        </label>

        <label class="flex items-center gap-2 text-sm">
          <span class="shrink-0 opacity-70">批量</span>
          <input
            v-model.number="state.batch"
            type="number"
            data-testid="pwd-batch"
            min="1"
            max="50"
            class="input input-sm w-20"
          />
          <button type="button" data-testid="pwd-generate" class="btn btn-primary btn-sm" @click="generate">
            生成
          </button>
          <button type="button" class="btn btn-ghost btn-sm" @click="onReset">还原默认</button>
        </label>

        <p v-if="strength" data-testid="pwd-strength" class="flex items-center gap-2 text-sm">
          <span>熵估算 ≈ {{ strength.bits.toFixed(1) }} bit</span>
          <span class="badge badge-sm" :class="STRENGTH_BADGE[strength.tone]">{{ strength.label }}</span>
          <span class="opacity-50">(池 {{ pool?.length }} 字符 × {{ state.length }} 位)</span>
        </p>
      </div>

      <div class="flex flex-col gap-2">
        <ErrorBanner :message="errorMessage" />
        <template v-if="results.length > 0">
          <div class="flex items-center justify-between">
            <span class="text-sm opacity-60">共 {{ results.length }} 条(参数变化自动重生成)</span>
            <button type="button" data-testid="pwd-copy-all" class="btn btn-ghost btn-xs" @click="copyAll">
              {{ copied && copiedIndex === -2 ? '已复制' : '全部复制' }}
            </button>
          </div>
          <ul data-testid="pwd-results" class="flex flex-col gap-1">
            <li
              v-for="(pwd, i) in results"
              :key="`${i}-${pwd}`"
              class="flex items-center gap-2 rounded border border-base-300 bg-base-200/40 px-2 py-1"
            >
              <code class="min-w-0 flex-1 break-all font-mono text-sm">{{ pwd }}</code>
              <button
                type="button"
                class="btn btn-ghost btn-xs"
                :data-testid="`pwd-copy-${i}`"
                @click="copyAt(i)"
              >
                {{ copied && copiedIndex === i ? '已复制' : '复制' }}
              </button>
            </li>
          </ul>
        </template>
      </div>
    </div>

    <p class="text-xs opacity-50">
      随机源为 Web Crypto(crypto.getRandomValues)拒绝采样,无取模偏差;熵为均匀抽样估算
      (length × log2 池大小),未做字典/模式检测;结果仅存在内存,刷新即失效,请生成后立即妥善保存
    </p>
  </div>
</template>
