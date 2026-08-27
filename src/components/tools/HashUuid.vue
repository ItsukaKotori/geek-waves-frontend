<script setup lang="ts">
import { ref, watch } from 'vue'
import { hashValue, uuid4, type HashAlgorithm } from '../../tools/hashUuid'
import { useCopy } from '../../composables/useCopy'
import { watchDebounced } from '../../composables/useDebounce'

const algos: HashAlgorithm[] = ['MD5', 'SHA-1', 'SHA-256', 'SHA-512']

const algo = ref<HashAlgorithm>('SHA-256')
const hashInput = ref('')
const hashOut = ref('')
const hashErr = ref('')

const uuidCount = ref(5)
const uuids = ref<string[]>([])
const uuidErr = ref('')

const { copied: hashCopied, copy: hashCopy } = useCopy()
const { copied: uuidCopied, copy: uuidCopy } = useCopy()

let hashSeq = 0

/** 实时式(FE3):输入即出结果、变化即失效旧结果;异步任务以序号守卫,只落地最新请求 */
async function calcHash(): Promise<void> {
  const token = ++hashSeq
  hashErr.value = ''
  hashOut.value = ''
  if (!hashInput.value) return
  try {
    const out = await hashValue(hashInput.value, algo.value)
    if (token === hashSeq) hashOut.value = out
  } catch (e) {
    if (token === hashSeq) hashErr.value = (e as Error).message || '哈希计算失败'
  }
}

function recomputeNow(): void {
  runner.flush()
}

const runner = watchDebounced([hashInput, () => algo.value], () => void calcHash())

/** 清空输入立即失效旧哈希,不等防抖窗口 */
watch(hashInput, (v) => {
  if (v !== '') return
  runner.cancel()
  hashSeq++
  hashOut.value = ''
  hashErr.value = ''
})

function genUuid() {
  uuidErr.value = ''
  const n = Math.floor(Number(uuidCount.value))
  if (!Number.isFinite(n) || n < 1) {
    uuidErr.value = '数量需为 1 及以上的整数'
    return
  }
  uuids.value = uuid4(Math.min(n, 500))
}

function uuidText() {
  return uuids.value.join('\n')
}
</script>

<template>
  <div class="flex flex-col gap-4" @keydown.ctrl.enter.prevent="recomputeNow">
    <h2 class="text-base font-semibold tracking-tight">哈希计算 / UUID</h2>

    <section class="flex flex-col gap-2">
      <h3 class="text-sm font-semibold opacity-80">哈希计算</h3>
      <div class="flex gap-2">
        <select v-model="algo" class="select select-sm w-32">
          <option v-for="a in algos" :key="a" :value="a">{{ a }}</option>
        </select>
        <input v-model="hashInput" placeholder="输入要哈希的文本" class="input input-sm flex-1 font-mono" />
      </div>
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
      <h3 class="text-sm font-semibold opacity-80">UUID v4 生成</h3>
      <div class="flex gap-2">
        <input v-model.number="uuidCount" type="number" min="1" max="500" class="input input-sm w-24" />
        <button class="btn btn-sm btn-primary" @click="genUuid">生成</button>
      </div>
      <p v-if="uuidErr" class="text-error text-sm">{{ uuidErr }}</p>
      <div v-if="uuids.length" class="flex items-start gap-2">
        <pre class="flex-1 whitespace-pre-wrap rounded-box border border-base-300 bg-base-200/60 p-3">{{ uuidText() }}</pre>
        <button class="btn btn-sm btn-ghost" @click="uuidCopy(uuidText())">
          {{ uuidCopied ? '已复制' : '复制' }}
        </button>
      </div>
    </section>
  </div>
</template>
