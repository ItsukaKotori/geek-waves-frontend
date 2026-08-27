<script setup lang="ts">
import { computed, onScopeDispose, ref, watch } from 'vue'
import {
  hashValue,
  uuid4,
  uuid7,
  formatHex,
  type HashAlgorithm,
  type FileHashes,
} from '../../tools/hashUuid'
import { createHashFileClient, defaultHashFileWorkerFactory, type FileHashOutcome } from './hashFileClient'
import type { WorkerFactory, WorkerLike } from './regexMatchClient'
import { useCopy } from '../../composables/useCopy'
import { useToolState } from '../../composables/useToolState'
import { watchDebounced } from '../../composables/useDebounce'

const algos: HashAlgorithm[] = ['MD5', 'SHA-1', 'SHA-256', 'SHA-512', 'SHA3-256', 'SHA3-512']

interface HashUuidState {
  algo: HashAlgorithm
  /** 哈希 / UUID 输出统一:大写 */
  upper: boolean
  /** 哈希 / UUID 输出统一:去横线(对哈希本体无横线是幂等项) */
  stripDash: boolean
  /** UUID 版本:v4 随机 / v7 时间戳排序(RFC 9562) */
  uuidVersion: 'v4' | 'v7'
  uuidCount: number
}

/** 选项与输入持久化(key 与注册表一致);输出为临时结果不入快照 */
const { state } = useToolState<HashUuidState>('hash', {
  algo: 'SHA-256',
  upper: false,
  stripDash: false,
  uuidVersion: 'v4',
  uuidCount: 5,
})

const hashInput = ref('')
const hashRaw = ref('')
const hashErr = ref('')

/** 文件哈希(worker 编排)状态 */
const fileName = ref('')
const fileSize = ref<number | null>(null)
const fileDigests = ref<FileHashes | null>(null)
const fileBusy = ref(false)
const fileErr = ref('')
const dragOver = ref(false)
const browseRef = ref<HTMLInputElement | null>(null)

const uuids = ref<string[]>([])
const uuidErr = ref('')

const { copied: hashCopied, copy: hashCopy } = useCopy()
const { copied: fileCopied, copy: fileCopy } = useCopy()
const { copied: uuidCopied, copy: uuidCopy } = useCopy()

let hashSeq = 0

/** 输出格式化是纯展示变换,大写/去横线切换即时生效、无重算延迟 */
function fmt(hex: string): string {
  return formatHex(hex, { upper: state.upper, stripDash: state.stripDash })
}

const hashOut = computed(() => (hashRaw.value ? fmt(hashRaw.value) : ''))

/** 实时式(FE3):输入即出结果、变化即失效旧结果;异步任务以序号守卫,只落地最新请求 */
async function calcHash(): Promise<void> {
  const token = ++hashSeq
  hashErr.value = ''
  hashRaw.value = ''
  if (!hashInput.value) return
  try {
    const out = await hashValue(hashInput.value, state.algo)
    if (token === hashSeq) hashRaw.value = out
  } catch (e) {
    if (token === hashSeq) hashErr.value = (e as Error).message || '哈希计算失败'
  }
}

function recomputeNow(): void {
  runner.flush()
}

const runner = watchDebounced([hashInput, () => state.algo], () => void calcHash())

/** 清空输入立即失效旧哈希,不等防抖窗口 */
watch(hashInput, (v) => {
  if (v !== '') return
  runner.cancel()
  hashSeq++
  hashRaw.value = ''
  hashErr.value = ''
})

/* 文件哈希 */

const workerFactoryProp = defineProps<{ workerFactory?: () => WorkerLike }>()
const client = createHashFileClient(
  (workerFactoryProp.workerFactory as WorkerFactory | undefined) ?? defaultHashFileWorkerFactory,
)
/** 组件真实卸载(或 HMR)时释放 Worker;KeepAlive 缓存不触发,资源域一致性兜底 */
onScopeDispose(() => {
  client.dispose()
})

async function runFile(file: File): Promise<void> {
  fileName.value = file.name
  fileSize.value = file.size
  fileBusy.value = true
  fileErr.value = ''
  const outcome: FileHashOutcome = await client.run(file)
  if (outcome.kind === 'superseded') return
  fileBusy.value = false
  if (outcome.kind === 'ok') fileDigests.value = outcome.digests
  else {
    fileDigests.value = null
    fileErr.value = outcome.message
  }
}

function onDrop(e: DragEvent): void {
  dragOver.value = false
  const file = e.dataTransfer?.files?.[0]
  if (!file) return
  void runFile(file)
}

function onBrowseChange(e: Event): void {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) void runFile(file)
  input.value = ''
}

function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${n} 字节`
}

const FILE_ROWS: Array<{ algo: keyof FileHashes; label: string }> = [
  { algo: 'MD5', label: 'MD5' },
  { algo: 'SHA-1', label: 'SHA-1' },
  { algo: 'SHA-256', label: 'SHA-256' },
  { algo: 'SHA-512', label: 'SHA-512' },
]

/* UUID 生成(v4 随机 / v7 时间戳排序) */

function genUuid() {
  uuidErr.value = ''
  const n = Math.floor(Number(state.uuidCount))
  if (!Number.isFinite(n) || n < 1) {
    uuidErr.value = '数量需为 1 及以上的整数'
    return
  }
  uuids.value = state.uuidVersion === 'v7' ? uuid7(Math.min(n, 500)) : uuid4(Math.min(n, 500))
}

const uuidText = computed(() => uuids.value.map((u) => fmt(u)).join('\n'))
</script>

<template>
  <div class="flex flex-col gap-4" @keydown.ctrl.enter.prevent="recomputeNow">
    <h2 class="text-base font-semibold tracking-tight">哈希计算 / UUID</h2>

    <section class="flex flex-col gap-2">
      <h3 class="text-sm font-semibold opacity-80">哈希计算</h3>
      <div class="flex flex-wrap items-center gap-2">
        <select v-model="state.algo" class="select select-sm w-36">
          <option v-for="a in algos" :key="a" :value="a">{{ a }}</option>
        </select>
        <input v-model="hashInput" placeholder="输入要哈希的文本" class="input input-sm min-w-40 flex-1 font-mono" />
      </div>
      <label class="cursor-pointer text-sm" title="输出转大写">
        <input v-model="state.upper" type="checkbox" class="checkbox checkbox-sm align-middle" />
        大写输出
      </label>
      <label class="cursor-pointer text-sm" title="去除 UUID 连字符">
        <input v-model="state.stripDash" type="checkbox" class="checkbox checkbox-sm align-middle" />
        去横线
      </label>
      <span class="text-xs opacity-50">输入后实时计算,Ctrl+Enter 立即重算</span>
      <p v-if="hashErr" class="text-error text-sm">{{ hashErr }}</p>
      <div v-if="hashOut" class="flex items-start gap-2">
        <pre class="flex-1 whitespace-pre-wrap rounded-box border border-base-300 bg-base-200/60 p-3">{{ hashOut }}</pre>
        <button class="btn btn-sm btn-ghost" @click="hashCopy(hashOut)">
          {{ hashCopied ? '已复制' : '复制' }}
        </button>
      </div>
    </section>

    <section class="flex flex-col gap-2">
      <h3 class="text-sm font-semibold opacity-80">文件哈希(单趟多算法)</h3>
      <div
        class="dropzone cursor-pointer rounded-box border border-dashed p-6 text-center transition-colors"
        :class="dragOver ? 'border-primary bg-primary/5' : 'border-base-300 hover:border-base-content/30'"
        role="button"
        tabindex="0"
        @dragover.prevent="dragOver = true"
        @dragleave.prevent="dragOver = false"
        @drop.prevent="onDrop"
        @click="browseRef?.click()"
        @keydown.enter.prevent="browseRef?.click()"
      >
        <input ref="browseRef" type="file" class="hidden" @change="onBrowseChange" />
        <p class="text-sm">{{ fileBusy ? '正在计算…' : '拖拽文件到此处,或点击选择文件' }}</p>
        <p v-if="fileName && fileSize !== null" class="mt-1 text-xs opacity-60">
          {{ fileName }} · {{ formatBytes(fileSize) }}
          <span v-if="fileBusy">(流式读取中,主线程不卡顿)</span>
        </p>
      </div>
      <p v-if="fileErr" class="text-error text-sm">{{ fileErr }}</p>
      <div v-if="fileDigests && !fileBusy" class="grid gap-1">
        <div
          v-for="row in FILE_ROWS"
          :key="row.algo"
          :data-algo="row.algo"
          class="flex items-start gap-2 rounded border border-base-300 bg-base-200/60 px-2 py-1.5"
        >
          <span class="w-16 shrink-0 pt-0.5 text-xs font-semibold opacity-70">{{ row.label }}</span>
          <code class="min-w-0 flex-1 break-all font-mono text-xs">{{ fmt(fileDigests[row.algo]) }}</code>
          <button class="btn btn-xs btn-ghost shrink-0" @click="fileCopy(fmt(fileDigests[row.algo]))">复制</button>
        </div>
        <button class="btn btn-sm btn-ghost w-fit" @click="fileCopy(FILE_ROWS.map((r) => `${r.label}  ${fmt(fileDigests![r.algo])}`).join('\n'))">
          {{ fileCopied ? '已复制' : '复制全部' }}
        </button>
      </div>
    </section>

    <section class="flex flex-col gap-2">
      <h3 class="text-sm font-semibold opacity-80">UUID 生成</h3>
      <div class="flex flex-wrap items-center gap-2">
        <select v-model="state.uuidVersion" class="select select-sm w-20" aria-label="UUID 版本">
          <option value="v4">v4</option>
          <option value="v7">v7</option>
        </select>
        <input v-model.number="state.uuidCount" type="number" min="1" max="500" class="input input-sm w-24" />
        <button class="btn btn-sm btn-primary" @click="genUuid">生成</button>
      </div>
      <p class="text-xs opacity-50">v4:随机 · v7:含毫秒时间戳前缀,可按字典序排序</p>
      <p v-if="uuidErr" class="text-error text-sm">{{ uuidErr }}</p>
      <div v-if="uuids.length" class="flex items-start gap-2">
        <pre class="flex-1 whitespace-pre-wrap rounded-box border border-base-300 bg-base-200/60 p-3">{{ uuidText }}</pre>
        <button class="btn btn-sm btn-ghost" @click="uuidCopy(uuidText)">
          {{ uuidCopied ? '已复制' : '复制' }}
        </button>
      </div>
    </section>
  </div>
</template>
