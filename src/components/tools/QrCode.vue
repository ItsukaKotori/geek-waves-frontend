<script setup lang="ts">
import { ref } from 'vue'
import { generateQr, type QrEcc, type QrResult } from '../../tools/qrcodeGen'
import { useToolState } from '../../composables/useToolState'
import { watchDebounced } from '../../composables/useDebounce'
import PaneShell from '../tools-ui/PaneShell.vue'
import PaneSeam from '../tools-ui/PaneSeam.vue'

interface QrState {
  text: string
  ecc: QrEcc
  size: number
}

const { state } = useToolState<QrState>('qrcode', { text: '', ecc: 'M', size: 320 })

const ECC_CHOICES: Array<{ id: QrEcc; label: string; hint: string }> = [
  { id: 'L', label: 'L', hint: '可纠错 7%,容量最大' },
  { id: 'M', label: 'M', hint: '可纠错 15%(推荐)' },
  { id: 'Q', label: 'Q', hint: '可纠错 25%' },
  { id: 'H', label: 'H', hint: '可纠错 30%,适合印刷' },
]

const SIZE_CHOICES = [200, 320, 480, 640]

const result = ref<QrResult | null>(null)
const qrErr = ref('')
let seq = 0

/** 实时式:输入/纠错/尺寸任一变化即重渲染;序号守卫只落地最新请求 */
async function run(): Promise<void> {
  const token = ++seq
  qrErr.value = ''
  if (!state.text.trim()) {
    result.value = null
    return
  }
  try {
    const r = await generateQr(state.text, { ecc: state.ecc, size: state.size })
    if (token === seq) result.value = r
  } catch (e) {
    if (token === seq) {
      result.value = null
      qrErr.value = (e as Error).message || '二维码生成失败'
    }
  }
}

function recomputeNow(): void {
  runner.flush()
}

const runner = watchDebounced([() => state.text, () => state.ecc, () => state.size], () => void run())

/** SVG 走 data URL 下载,避免 Blob 生命周期管理 */
const svgHref = (): string =>
  result.value ? `data:image/svg+xml;utf8,${encodeURIComponent(result.value.svgString)}` : ''
</script>

<template>
  <div class="grid items-start gap-3 lg:grid-cols-[1fr_auto_1fr]" @keydown.ctrl.enter.prevent="recomputeNow">
    <!-- 输入侧:内容 + 纠错级别 + 尺寸 -->
    <PaneShell label="内容" badge="本地渲染" class="lg:h-full">
      <div class="flex h-full flex-col gap-3 p-3">
        <textarea
          v-model="state.text"
          aria-label="二维码内容"
          placeholder="输入 URL 或任意文本,实时生成二维码"
          rows="5"
          class="textarea textarea-sm flex-1 font-mono"
        ></textarea>
        <div class="flex flex-col gap-1.5">
          <span class="text-xs font-medium tracking-wider text-base-content/50">纠错级别</span>
          <div class="join self-start">
            <button
              v-for="c in ECC_CHOICES"
              :key="c.id"
              type="button"
              class="btn btn-xs join-item w-10"
              :class="state.ecc === c.id ? 'btn-primary' : 'btn-ghost'"
              :title="c.hint"
              @click="state.ecc = c.id"
            >
              {{ c.label }}
            </button>
          </div>
        </div>
        <div class="flex flex-col gap-1.5">
          <span class="text-xs font-medium tracking-wider text-base-content/50">导出尺寸(px)</span>
          <div class="join self-start">
            <button
              v-for="s in SIZE_CHOICES"
              :key="s"
              type="button"
              class="btn btn-xs join-item"
              :class="state.size === s ? 'btn-primary' : 'btn-ghost'"
              @click="state.size = s"
            >
              {{ s }}
            </button>
          </div>
        </div>
      </div>
    </PaneShell>

    <PaneSeam direction="lr" />

    <!-- 输出侧:预览 + 下载 -->
    <PaneShell label="二维码" class="lg:h-full">
      <div class="flex h-full flex-col items-center justify-center gap-4 p-4">
        <img
          v-if="result"
          data-qr
          :src="result.pngDataUrl"
          alt="二维码预览"
          class="max-h-80 rounded border border-base-300 bg-white p-2"
        />
        <p v-else-if="!qrErr" class="font-mono text-xs text-base-content/35">输入内容后实时生成</p>
        <div v-if="result" class="flex gap-2">
          <a :href="result.pngDataUrl" download="qrcode.png" class="btn btn-xs btn-outline">下载 PNG</a>
          <a :href="svgHref()" download="qrcode.svg" class="btn btn-xs btn-outline">下载 SVG</a>
        </div>
      </div>
      <template #footer>
        <span v-if="qrErr" class="text-error">{{ qrErr }}</span>
        <span v-else class="text-xs opacity-40">纠错级别越高,可容纳内容越少但越耐污损</span>
      </template>
    </PaneShell>
  </div>
</template>
