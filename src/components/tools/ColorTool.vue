<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  formatHsl,
  formatRgb,
  hslToRgb,
  parseHex,
  parseHsl,
  parseRgb,
  rgbToHsl,
  rgbToHex,
  wcagGrades,
  wcagRatio,
  type Rgb,
} from '../../tools/colorCalc'
import { useToolState } from '../../composables/useToolState'
import { watchDebounced } from '../../composables/useDebounce'
import ErrorBanner from '../ui/ErrorBanner.vue'

/**
 * 颜色工具(FE11 T2 批次二):HEX/RGB/HSL 三格式互转任一输入全联动 +
 * WCAG 对比度(前景/背景)与 AA/AAA 判级(正常/大文本)。
 * 口径:当前颜色以 RGB 整数为单一事实源,文本框是其格式化视图;
 * 解析失败明确报错并保留上次合法值(不静默清空);对比度 2 位小数半入,
 * 判级阈值 AA≥4.5/AAA≥7(正常)、AA≥3/AAA≥4.5(大文本),与纯函数层一致。
 */

interface ColorState {
  /** 当前颜色(HEX 形态) */
  current: string
  /** 前景色(HEX 形态,type=color 原生控件约束为 #rrggbb) */
  fg: string
  /** 背景色(HEX 形态) */
  bg: string
}

/** 颜色经 localStorage 持久化(key 与注册表一致),刷新后恢复 */
const { state } = useToolState<ColorState>('color', {
  current: '#336699',
  fg: '#336699',
  bg: '#ffffff',
})

/** 三个文本框是当前颜色的格式化视图;lastEdited 记录最近编辑源,防抖后联动刷新 */
const hexInput = ref(state.current)
const rgbInput = ref('')
const hslInput = ref('')
const lastEdited = ref<'hex' | 'rgb' | 'hsl'>('hex')
const errorMessage = ref('')

function run(): void {
  try {
    let rgb: Rgb
    if (lastEdited.value === 'hex') {
      rgb = parseHex(hexInput.value)
    } else if (lastEdited.value === 'rgb') {
      rgb = parseRgb(rgbInput.value)
    } else {
      rgb = hslToRgb(parseHsl(hslInput.value))
    }
    errorMessage.value = ''
    state.current = rgbToHex(rgb)
    // 三视图全量刷新(编辑源归一化,其余联动)
    hexInput.value = state.current
    rgbInput.value = formatRgb(rgb)
    hslInput.value = formatHsl(rgbToHsl(rgb))
  } catch (e) {
    errorMessage.value = (e as Error).message || '颜色解析失败'
  }
}

const runner = watchDebounced([hexInput, rgbInput, hslInput], run)

function recomputeNow(): void {
  runner.flush()
}

/** 前景/背景对比度(拾色器恒输出合法 #rrggbb;异常时面板隐藏) */
const contrast = computed<number | null>(() => {
  try {
    return wcagRatio(parseHex(state.fg), parseHex(state.bg))
  } catch {
    return null
  }
})

const grades = computed(() => (contrast.value === null ? null : wcagGrades(contrast.value)))

const ratioText = computed(() => (contrast.value === null ? '' : contrast.value.toFixed(2)))

const fgColor = computed({
  get: () => state.fg,
  set: (v: string) => (state.fg = v),
})
const bgColor = computed({
  get: () => state.bg,
  set: (v: string) => (state.bg = v),
})

function setForeground(): void {
  state.fg = state.current
}

function setBackground(): void {
  state.bg = state.current
}

/** 手动编辑时同步记录编辑源(输入事件先于防抖触发,顺序可靠) */
function markEdited(which: 'hex' | 'rgb' | 'hsl'): void {
  lastEdited.value = which
}
</script>

<template>
  <div class="flex flex-col gap-3" @keydown.ctrl.enter.prevent="recomputeNow" @keydown.meta.enter.prevent="recomputeNow">
    <h2 class="text-base font-semibold tracking-tight">颜色工具</h2>

    <div class="grid gap-3 md:grid-cols-2">
      <div class="flex flex-col gap-2">
        <label class="flex items-center gap-2 text-sm">
          <span class="w-10 shrink-0 text-xs opacity-60">HEX</span>
          <input
            v-model="hexInput"
            data-testid="color-hex"
            class="input input-sm font-mono"
            placeholder="#336699"
            spellcheck="false"
            @input="markEdited('hex')"
          />
        </label>
        <label class="flex items-center gap-2 text-sm">
          <span class="w-10 shrink-0 text-xs opacity-60">RGB</span>
          <input
            v-model="rgbInput"
            data-testid="color-rgb"
            class="input input-sm font-mono"
            placeholder="rgb(51, 102, 153)"
            spellcheck="false"
            @input="markEdited('rgb')"
          />
        </label>
        <label class="flex items-center gap-2 text-sm">
          <span class="w-10 shrink-0 text-xs opacity-60">HSL</span>
          <input
            v-model="hslInput"
            data-testid="color-hsl"
            class="input input-sm font-mono"
            placeholder="hsl(210, 50%, 40%)"
            spellcheck="false"
            @input="markEdited('hsl')"
          />
        </label>
        <div class="flex items-center gap-2">
          <span
            data-testid="color-swatch"
            class="h-8 w-8 shrink-0 rounded border border-base-300"
            :style="{ backgroundColor: state.current }"
            :title="state.current"
          />
          <button type="button" data-testid="color-set-fg" class="btn btn-outline btn-xs" @click="setForeground">
            设为前景
          </button>
          <button type="button" data-testid="color-set-bg" class="btn btn-outline btn-xs" @click="setBackground">
            设为背景
          </button>
        </div>
      </div>

      <div class="flex flex-col gap-2">
        <label class="flex items-center gap-2 text-sm">
          <span class="shrink-0 text-xs opacity-60">前景</span>
          <input
            v-model="fgColor"
            data-testid="color-fg"
            type="color"
            class="input input-sm h-9 w-16 cursor-pointer p-0.5"
          />
          <span class="font-mono text-xs opacity-60">{{ state.fg }}</span>
        </label>
        <label class="flex items-center gap-2 text-sm">
          <span class="shrink-0 text-xs opacity-60">背景</span>
          <input
            v-model="bgColor"
            data-testid="color-bg"
            type="color"
            class="input input-sm h-9 w-16 cursor-pointer p-0.5"
          />
          <span class="font-mono text-xs opacity-60">{{ state.bg }}</span>
        </label>

        <div v-if="contrast !== null && grades" class="rounded border border-base-300 bg-base-200/40 p-3">
          <p class="text-xs opacity-60">WCAG 对比度(前景 × 背景)</p>
          <p data-testid="color-ratio" class="mt-0.5 text-2xl font-semibold tabular-nums">{{ ratioText }}</p>
          <div class="mt-1.5 flex flex-wrap gap-1">
            <span
              :data-testid="`color-grade-normal-aa`"
              class="badge badge-sm"
              :class="grades.normalAA ? 'badge-success badge-soft' : 'badge-error badge-soft'"
            >
              正常文本 AA {{ grades.normalAA ? '通过' : '未达标' }}
            </span>
            <span
              data-testid="color-grade-normal-aaa"
              class="badge badge-sm"
              :class="grades.normalAAA ? 'badge-success badge-soft' : 'badge-error badge-soft'"
            >
              正常文本 AAA {{ grades.normalAAA ? '通过' : '未达标' }}
            </span>
            <span
              data-testid="color-grade-large-aa"
              class="badge badge-sm"
              :class="grades.largeAA ? 'badge-success badge-soft' : 'badge-error badge-soft'"
            >
              大文本 AA {{ grades.largeAA ? '通过' : '未达标' }}
            </span>
            <span
              data-testid="color-grade-large-aaa"
              class="badge badge-sm"
              :class="grades.largeAAA ? 'badge-success badge-soft' : 'badge-error badge-soft'"
            >
              大文本 AAA {{ grades.largeAAA ? '通过' : '未达标' }}
            </span>
          </div>
          <p
            class="mt-2 rounded border border-base-300 p-2 text-sm"
            :style="{ backgroundColor: state.bg, color: state.fg }"
          >
            前景文字预览示例 The quick brown fox
          </p>
        </div>
      </div>
    </div>

    <ErrorBanner :message="errorMessage" />

    <p class="text-xs opacity-50">
      口径:RGB 分量 0~255 整数(小数输入四舍五入,越界报错不截断);HSL 色相环绕 [0,360)、
      s/l 0~100,输出保留 1 位小数,RGB↔HSL 往返误差 ≤ ±1/通道;WCAG 2.x 相对亮度与对比度,
      比值四舍五入 2 位小数后判级(正常 ≥4.5/7,大文本 ≥3/4.5),展示与判级同口径。
      编辑任一输入其余两格式实时联动(150ms 防抖,Ctrl+Enter 立即重算);解析失败保留上次合法值
    </p>
  </div>
</template>
