<script setup lang="ts">
import { ref } from 'vue'
import { tsToDate, dateToTs } from '../../tools/timestamp'
import { useCopy } from '../../composables/useCopy'

const tsText = ref('')
const d1 = ref<{ value: string; note: string } | null>(null)
const d1Err = ref('')

const localInput = ref('')
const d2 = ref<{ s: number; ms: number } | null>(null)
const d2Err = ref('')

const { copied, copy } = useCopy()

function tsToDateRun() {
  d1.value = null
  d1Err.value = ''
  const n = Number(tsText.value)
  if (!tsText.value.trim() || !Number.isFinite(n)) {
    d1Err.value = '请输入有效的时间戳数值'
    return
  }
  d1.value = {
    value: tsToDate(n),
    note: n < 1e12 ? '(按毫秒为 0.001 倍的秒级时间戳解释)' : '(按毫秒时间戳解释)',
  }
}

function dateToTsRun() {
  d2.value = null
  d2Err.value = ''
  if (!localInput.value) {
    d2Err.value = '请先选择日期时间'
    return
  }
  const date = new Date(localInput.value)
  if (Number.isNaN(date.getTime())) {
    d2Err.value = '日期无法解析'
    return
  }
  d2.value = dateToTs(date)
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <h2 class="text-base font-semibold tracking-tight">时间戳</h2>

    <section class="flex flex-col gap-2">
      <h3 class="text-sm font-semibold opacity-80">时间戳 → 日期时间</h3>
      <div class="flex gap-2">
        <input v-model="tsText" type="number" placeholder="1700000000 或 1700000000000" class="input input-sm flex-1 font-mono" />
        <button class="btn btn-sm btn-primary" @click="tsToDateRun">转换</button>
      </div>
      <p v-if="d1Err" class="text-error text-sm">{{ d1Err }}</p>
      <div v-if="d1" class="flex items-center gap-2">
        <pre class="flex-1 whitespace-pre-wrap rounded-box border border-base-300 bg-base-200/60 p-3">{{ d1.value }}</pre>
        <button class="btn btn-sm btn-ghost" @click="copy(d1.value)">
          {{ copied ? '已复制' : '复制' }}
        </button>
      </div>
      <p v-if="d1" class="text-xs opacity-60">{{ d1.note }}</p>
    </section>

    <section class="flex flex-col gap-2">
      <h3 class="text-sm font-semibold opacity-80">日期时间 → 时间戳</h3>
      <div class="flex gap-2">
        <input v-model="localInput" type="datetime-local" class="input input-sm flex-1" />
        <button class="btn btn-sm btn-primary" @click="dateToTsRun">转换</button>
      </div>
      <p v-if="d2Err" class="text-error text-sm">{{ d2Err }}</p>
      <div v-if="d2" class="flex items-center gap-2">
        <pre class="flex-1 whitespace-pre-wrap rounded-box border border-base-300 bg-base-200/60 p-3">s={{ d2.s }}
ms={{ d2.ms }}</pre>
        <button class="btn btn-sm btn-ghost" @click="copy(`s=${d2?.s}\nms=${d2?.ms}`)">
          {{ copied ? '已复制' : '复制' }}
        </button>
      </div>
    </section>
  </div>
</template>
