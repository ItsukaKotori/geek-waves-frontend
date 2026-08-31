<script setup lang="ts">
import { computed, ref, watch } from 'vue'
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
import PaneShell from '../tools-ui/PaneShell.vue'
import CodeEditor from '../tools-ui/CodeEditor.vue'
import CodeOutput from '../tools-ui/CodeOutput.vue'

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

/* 图片文件 → dataURL:上传后回填输入,复用既有解码预览管道 */

const dragOver = ref(false)
const fileErr = ref('')
const fileNote = ref('')
const browseRef = ref<HTMLInputElement | null>(null)

function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${n} 字节`
}

function runFile(file: File): void {
  if (!file.type.startsWith('image/')) {
    fileErr.value = '仅支持图片文件'
    return
  }
  fileErr.value = ''
  fileNote.value = `${file.name} · ${formatBytes(file.size)}`
  const reader = new FileReader()
  reader.onload = () => {
    if (typeof reader.result === 'string') state.input = reader.result
  }
  reader.readAsDataURL(file)
}

function onDrop(e: DragEvent): void {
  dragOver.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file) runFile(file)
}

function onBrowseChange(e: Event): void {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) runFile(file)
  input.value = ''
}

const MODE_LABELS: Record<Mode, string> = {
  b64: 'Base64',
  url: 'URL',
  hex: 'Hex',
}

/* ------------------------------ 展示层派生(纯 UI) ----------------------------- */

const inputPlaceholder = computed(() =>
  state.mode === 'b64'
    ? '输入明文或 Base64 字符串(支持图片 dataURL 预览)'
    : state.mode === 'hex'
      ? '输入文本或十六进制串(可含空格/冒号分隔)'
      : '输入文本或 URL 编码字符串',
)

const inputLines = computed(() => (state.input === '' ? 0 : state.input.split('\n').length))

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
    <!-- 工具栏:编码模式 -->
    <div class="tabs tabs-box tabs-sm w-fit">
      <button class="tab" :class="{ 'tab-active': state.mode === 'b64' }" @click="state.mode = 'b64'">Base64</button>
      <button class="tab" :class="{ 'tab-active': state.mode === 'url' }" @click="state.mode = 'url'">URL</button>
      <button class="tab" :class="{ 'tab-active': state.mode === 'hex' }" @click="state.mode = 'hex'">Hex</button>
    </div>

    <!-- 双栏工作台:输入在左,编码/解码双输出在右 -->
    <div class="grid items-stretch gap-3 lg:grid-cols-2">
      <PaneShell label="输入" :badge="MODE_LABELS[state.mode]" class="h-72 lg:h-full">
        <template #actions>
          <button
            v-if="state.mode === 'b64' && state.input.startsWith('data:')"
            type="button"
            class="btn btn-ghost btn-xs"
            @click="copy(state.input)"
          >
            {{ copied ? '已复制' : '复制 dataURL' }}
          </button>
          <button v-if="state.input" type="button" class="btn btn-ghost btn-xs" @click="state.input = ''">清空</button>
        </template>
        <!-- b64 模式独有:图片文件上传 → dataURL 回填(复用下方解码预览管道) -->
        <div
          v-if="state.mode === 'b64'"
          class="dropzone cursor-pointer rounded-box border border-dashed px-3 py-2.5 text-center text-xs transition-colors"
          :class="dragOver ? 'border-primary bg-primary/5' : 'border-base-300 hover:border-base-content/30'"
          role="button"
          tabindex="0"
          @dragover.prevent="dragOver = true"
          @dragleave.prevent="dragOver = false"
          @drop.prevent="onDrop"
          @click="browseRef?.click()"
          @keydown.enter.prevent="browseRef?.click()"
        >
          <input ref="browseRef" type="file" accept="image/*" class="hidden" @change="onBrowseChange" />
          <p class="text-base-content/70">
            {{ fileNote ? `已载入 ${fileNote} · ` : '' }}拖入或点击选择图片 → 转 Base64 dataURL
          </p>
          <p v-if="fileErr" class="text-error">{{ fileErr }}</p>
        </div>
        <CodeEditor v-model="state.input" :placeholder="inputPlaceholder" aria-label="待编解码文本" />
        <template #footer>
          <span>{{ state.input.length }} 字符</span>
          <span v-if="inputLines > 1">{{ inputLines }} 行</span>
        </template>
      </PaneShell>

      <div class="flex flex-col gap-3">
        <!-- 图片 Base64 预览:dataURL 输入 → 缩略图 + 尺寸信息 -->
        <div
          v-if="preview"
          class="image-preview flex items-start gap-4 rounded-box border border-base-300 bg-base-200/40 p-3"
        >
          <img :src="preview.url" alt="图片预览缩略图" class="max-h-40 max-w-[50%] rounded object-contain" />
          <div class="min-w-0 flex-col gap-1 text-xs leading-relaxed opacity-80">
            <p>MIME:<span class="font-mono">{{ preview.mime }}</span></p>
            <p>尺寸:<span class="font-mono">{{ preview.dims ? `${preview.dims.width} × ${preview.dims.height}` : '未知' }}</span></p>
            <p>大小:<span class="font-mono">{{ preview.bytes }} 字节</span>(Base64 约 {{ Math.ceil((preview.bytes * 4) / 3) }} 字符)</p>
          </div>
        </div>

        <PaneShell :label="`编码 → ${MODE_LABELS[state.mode]}`" class="h-40 flex-1">
          <template #actions>
            <button v-if="encoded" type="button" class="btn btn-ghost btn-xs" @click="copy(encoded)">
              {{ copied ? '已复制' : '复制' }}
            </button>
          </template>
          <CodeOutput :text="encoded" empty-hint="输入后实时编码" />
        </PaneShell>

        <PaneShell label="解码 → 文本" class="h-40 flex-1">
          <template #actions>
            <button v-if="decoded && !decodedError" type="button" class="btn btn-ghost btn-xs" @click="copy(decoded)">
              {{ copied ? '已复制' : '复制' }}
            </button>
          </template>
          <CodeOutput :text="decodedError ? '' : decoded" empty-hint="输入编码串实时解码" />
          <template #footer>
            <span v-if="decodedError" class="text-error">{{ decodedError }}</span>
          </template>
        </PaneShell>
      </div>
    </div>
  </div>
</template>
