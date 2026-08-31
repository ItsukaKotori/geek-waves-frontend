<script setup lang="ts">
import { computed, onScopeDispose, ref, watch } from 'vue'
import {
  hashValue,
  hmacValue,
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
import PaneShell from '../tools-ui/PaneShell.vue'
import CodeOutput from '../tools-ui/CodeOutput.vue'
import PaneSeam from '../tools-ui/PaneSeam.vue'

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
/** HMAC 密钥:普通 ref 而非 useToolState —— 密钥不落 localStorage */
const hmacSecret = ref('')

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

/** 结果徽章:填了密钥则标注 HMAC 前缀,与实际计算路径一致 */
const hashBadge = computed(() => (hmacSecret.value ? `HMAC-${state.algo}` : state.algo))

/** 实时式(FE3):输入即出结果、变化即失效旧结果;异步任务以序号守卫,只落地最新请求 */
async function calcHash(): Promise<void> {
  const token = ++hashSeq
  hashErr.value = ''
  hashRaw.value = ''
  if (!hashInput.value) return
  try {
    const out = hmacSecret.value
      ? await hmacValue(hashInput.value, state.algo, hmacSecret.value)
      : await hashValue(hashInput.value, state.algo)
    if (token === hashSeq) hashRaw.value = out
  } catch (e) {
    if (token === hashSeq) hashErr.value = (e as Error).message || '哈希计算失败'
  }
}

function recomputeNow(): void {
  runner.flush()
}

const runner = watchDebounced([hashInput, () => state.algo, hmacSecret], () => void calcHash())

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
    <!-- 输出格式选项:对哈希与 UUID 输出同时生效 -->
    <div class="flex flex-wrap items-center gap-x-5 gap-y-2">
      <span class="text-xs font-medium tracking-wider text-base-content/50">输出格式</span>
      <label class="flex cursor-pointer items-center gap-2 text-sm" title="输出转大写">
        <input v-model="state.upper" type="checkbox" class="checkbox checkbox-xs align-middle" />
        大写输出
      </label>
      <label class="flex cursor-pointer items-center gap-2 text-sm" title="去除 UUID 连字符">
        <input v-model="state.stripDash" type="checkbox" class="checkbox checkbox-xs align-middle" />
        去横线
      </label>
    </div>

    <!-- 文本哈希:双栏工作台 -->
    <div class="grid items-stretch gap-3 lg:grid-cols-[1fr_auto_1fr]">
      <PaneShell label="文本" class="h-48 lg:h-full">
        <div class="flex h-full flex-col gap-2 p-3">
          <select v-model="state.algo" class="select select-sm" aria-label="哈希算法">
            <option v-for="a in algos" :key="a" :value="a">{{ a }}</option>
          </select>
          <input
            v-model="hashInput"
            placeholder="输入要哈希的文本"
            aria-label="要哈希的文本"
            class="input input-sm min-w-0 flex-1 font-mono"
          />
          <input
            v-model="hmacSecret"
            type="password"
            placeholder="可选:密钥(填写后计算 HMAC)"
            aria-label="HMAC 密钥,留空则普通哈希"
            autocomplete="off"
            class="input input-sm min-w-0 font-mono"
          />
          <span class="text-xs text-base-content/40">输入后实时计算;密钥留空则普通哈希</span>
        </div>
      </PaneShell>

      <PaneSeam direction="lr" />

      <PaneShell label="哈希值" :badge="hashBadge" class="h-48 lg:h-full">
        <template #actions>
          <button v-if="hashOut" type="button" class="btn btn-ghost btn-xs" @click="hashCopy(hashOut)">
            {{ hashCopied ? '已复制' : '复制' }}
          </button>
        </template>
        <CodeOutput :text="hashOut" :empty-hint="`等待输入(${state.algo})`" />
        <template #footer>
          <span v-if="hashErr" class="text-error">{{ hashErr }}</span>
        </template>
      </PaneShell>
    </div>

    <!-- 文件哈希:拖拽区 + 多算法摘要 -->
    <PaneShell label="文件哈希" badge="单趟多算法">
      <div class="flex flex-col gap-3 p-3">
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
          <button
            class="btn btn-sm btn-ghost w-fit"
            @click="fileCopy(FILE_ROWS.map((r) => `${r.label}  ${fmt(fileDigests![r.algo])}`).join('\n'))"
          >
            {{ fileCopied ? '已复制' : '复制全部' }}
          </button>
        </div>
      </div>
      <template #footer>
        <span v-if="fileErr" class="text-error">{{ fileErr }}</span>
      </template>
    </PaneShell>

    <!-- UUID 生成:参数 / 结果双栏 -->
    <div class="grid items-stretch gap-3 lg:grid-cols-2">
      <PaneShell label="UUID 参数">
        <div class="flex h-full flex-col gap-2 p-3">
          <div class="flex flex-wrap items-center gap-2">
            <select v-model="state.uuidVersion" class="select select-sm w-24" aria-label="UUID 版本">
              <option value="v4">v4 随机</option>
              <option value="v7">v7 可排序</option>
            </select>
            <input
              v-model.number="state.uuidCount"
              type="number"
              min="1"
              max="500"
              aria-label="生成数量"
              class="input input-sm w-24"
            />
            <button type="button" class="btn btn-sm btn-primary" @click="genUuid">生成</button>
          </div>
          <p class="text-xs text-base-content/50">v4:随机 · v7:含毫秒时间戳前缀,可按字典序排序</p>
        </div>
      </PaneShell>

      <PaneShell label="UUID 结果" class="h-48 lg:h-full">
        <template #actions>
          <button v-if="uuids.length" type="button" class="btn btn-ghost btn-xs" @click="uuidCopy(uuidText)">
            {{ uuidCopied ? '已复制' : '复制' }}
          </button>
        </template>
        <CodeOutput :text="uuidText" empty-hint="点击生成" />
        <template #footer>
          <span v-if="uuidErr" class="text-error">{{ uuidErr }}</span>
        </template>
      </PaneShell>
    </div>
  </div>
</template>
