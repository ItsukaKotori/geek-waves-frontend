<script setup lang="ts">
import { ref, watch } from 'vue'
import {
  base64Encode,
  base64Decode,
  hexEncode,
  hexDecode,
} from '../../tools/encodeDecode'
import { parseDataUrl, sniffImageSize, type ImageSize } from '../../tools/imageInfo'
import { useCopy } from '../../composables/useCopy'
import { useToolState } from '../../composables/useToolState'
import { watchDebounced } from '../../composables/useDebounce'

type Mode = 'b64' | 'url' | 'hex'

interface EncoderDecoderState {
  mode: Mode
  input: string
}

/** 输入状态经 localStorage 持久化(key 与注册表一致),刷新后恢复;输出为临时结果不入快照 */
const { state } = useToolState<EncoderDecoderState>('b64', { mode: 'b64', input: '' })
const encoded = ref('')
const decoded = ref('')
const decodedError = ref('')
interface ImagePreviewInfo {
  url: string
  mime: string
  bytes: number
  dims: ImageSize | null
}
const preview = ref<ImagePreviewInfo | null>(null)
const { copied, copy } = useCopy()

const MODE_LABELS: Record<Mode, string> = {
  b64: 'Base64',
  url: 'URL',
  hex: 'Hex',
}

function detectImage(input: string): ImagePreviewInfo | null {
  const parsed = parseDataUrl(input)
  if (!parsed || !parsed.mime.startsWith('image/') || parsed.bytes.length === 0) return null
  return {
    url: input,
    mime: parsed.mime,
    bytes: parsed.bytes.length,
    dims: sniffImageSize(parsed.bytes),
  }
}

/**
 * 实时式(FE3):输入即出结果、变化即失效旧结果;150ms 防抖收敛连续击键。
 * 编码面永远不会失败(纯字节变换),解码失败给出行内错误;
 * 非 UTF-8 字节流按 fatal TextDecoder 诊断提示「疑似编码不符」而非输出乱码。
 */
function run(): void {
  preview.value = detectImage(state.input)
  const src = state.input
  if (!src) {
    encoded.value = ''
    decoded.value = ''
    decodedError.value = ''
    return
  }
  try {
    if (state.mode === 'b64') encoded.value = base64Encode(src)
    else if (state.mode === 'hex') encoded.value = hexEncode(src)
    else encoded.value = encodeURIComponent(src)
  } catch (e) {
    encoded.value = ''
    decodedError.value = (e as Error).message || '转换失败'
    return
  }
  try {
    if (state.mode === 'b64') decoded.value = base64Decode(src)
    else if (state.mode === 'hex') decoded.value = hexDecode(src)
    else decoded.value = decodeURIComponent(src)
    decodedError.value = ''
  } catch (e) {
    decoded.value = ''
    decodedError.value = (e as Error).message || '转换失败'
  }
}

/** Ctrl+Enter 兜底:立即重算一次 */
function recomputeNow(): void {
  runner.flush()
}

const runner = watchDebounced([() => state.mode, () => state.input], run)

/** 清空输入立即失效旧结果,不等防抖窗口 */
watch(
  () => state.input,
  (v) => {
    if (v !== '') return
    runner.cancel()
    encoded.value = ''
    decoded.value = ''
    decodedError.value = ''
    preview.value = null
  },
)
</script>

<template>
  <div class="flex flex-col gap-3" @keydown.ctrl.enter.prevent="recomputeNow">
    <h2 class="text-base font-semibold tracking-tight">Base64 / URL / Hex 编解码</h2>
    <div class="tabs tabs-box tabs-sm w-fit">
      <button class="tab" :class="{ 'tab-active': state.mode === 'b64' }" @click="state.mode = 'b64'">Base64</button>
      <button class="tab" :class="{ 'tab-active': state.mode === 'url' }" @click="state.mode = 'url'">URL</button>
      <button class="tab" :class="{ 'tab-active': state.mode === 'hex' }" @click="state.mode = 'hex'">Hex</button>
    </div>
    <textarea
      v-model="state.input"
      rows="6"
      :placeholder="
        state.mode === 'b64'
          ? '输入明文或 Base64 字符串(支持图片 dataURL 预览)'
          : state.mode === 'hex'
            ? '输入文本或十六进制串(可含空格/冒号分隔)'
            : '输入文本或 URL 编码字符串'
      "
      class="textarea textarea-bordered font-mono"
    />
    <!-- 图片 Base64 预览:dataURL 输入 → 缩略图 + 尺寸信息 -->
    <div v-if="preview" class="image-preview flex items-start gap-4 rounded-box border border-base-300 bg-base-200/40 p-3">
      <img :src="preview.url" alt="图片预览缩略图" class="max-h-40 max-w-[50%] rounded object-contain" />
      <div class="min-w-0 flex-col gap-1 text-xs leading-relaxed opacity-80">
        <p>MIME:<span class="font-mono">{{ preview.mime }}</span></p>
        <p>尺寸:<span class="font-mono">{{ preview.dims ? `${preview.dims.width} × ${preview.dims.height}` : '未知' }}</span></p>
        <p>大小:<span class="font-mono">{{ preview.bytes }} 字节</span>(Base64 约 {{ Math.ceil((preview.bytes * 4) / 3) }} 字符)</p>
      </div>
    </div>
    <div v-if="decodedError" class="rounded-box border border-error/30 bg-error/5 px-4 py-2.5 text-sm text-error">
      {{ decodedError }}
    </div>
    <section v-if="encoded || decoded || decodedError" class="flex flex-col gap-3">
      <div>
        <h3 class="pb-1 text-sm font-semibold opacity-80">编码 → {{ MODE_LABELS[state.mode] }}</h3>
        <pre class="whitespace-pre-wrap break-all rounded-box border border-base-300 bg-base-200/60 p-3 font-mono text-sm">{{ encoded }}</pre>
      </div>
      <div v-if="!decodedError">
        <h3 class="pb-1 text-sm font-semibold opacity-80">解码 → 文本</h3>
        <pre v-if="decoded" class="whitespace-pre-wrap rounded-box border border-base-300 bg-base-200/60 p-3 font-mono text-sm">{{ decoded }}</pre>
      </div>
      <button
        v-if="(encoded || decoded) && !decodedError"
        class="btn btn-sm btn-ghost w-fit"
        @click="copy(encoded || decoded)"
      >
        {{ copied ? '已复制' : '复制编码结果' }}
      </button>
    </section>
  </div>
</template>
