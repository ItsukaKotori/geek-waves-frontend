<script setup lang="ts">
import { computed, ref } from 'vue'
import { regexHighlights, type Highlight } from '../../tools/regexMatch'

const pattern = ref('')
const flags = ref('')
const text = ref('')
const error = ref('')
const highlights = ref<Highlight[]>([])
const matched = ref(false)

function run() {
  error.value = ''
  highlights.value = []
  matched.value = false
  if (!pattern.value.trim()) {
    error.value = '请输入正则表达式'
    return
  }
  try {
    highlights.value = regexHighlights(pattern.value, text.value, flags.value.trim())
    matched.value = true
  } catch (e) {
    error.value = `正则表达式非法:${(e as Error).message}`
  }
}

const segments = computed(() => {
  const out: { text: string; hl: boolean }[] = []
  let pos = 0
  for (const h of highlights.value) {
    if (h.start > pos) out.push({ text: text.value.slice(pos, h.start), hl: false })
    if (h.end > h.start) out.push({ text: text.value.slice(h.start, h.end), hl: true })
    pos = h.end
  }
  if (pos < text.value.length) out.push({ text: text.value.slice(pos), hl: false })
  return out
})
</script>

<template>
  <div class="flex flex-col gap-3">
    <h2 class="text-base font-semibold tracking-tight">正则视觉匹配</h2>
    <div class="flex flex-col gap-2">
      <div class="flex gap-2">
        <input v-model="pattern" placeholder="要匹配的正则,如 \d+" class="input input-sm flex-1 font-mono" />
        <input v-model="flags" placeholder="flags,如 igm(可空)" class="input input-sm w-36 font-mono" />
        <button class="btn btn-sm btn-primary" @click="run">匹配</button>
      </div>
      <textarea v-model="text" rows="8" placeholder="在此输入待匹配的文本" class="textarea textarea-bordered font-mono" />
    </div>
    <p v-if="error" class="text-error text-sm">{{ error }}</p>

    <template v-if="matched">
      <pre class="whitespace-pre-wrap break-all rounded bg-base-200 p-3 font-mono text-sm"
        ><template v-for="(s, i) in segments" :key="i"
      ><span v-if="s.hl" class="rounded bg-warning px-0.5">{{ s.text }}</span
      ><template v-else>{{ s.text }}</template></template
    ></pre>
      <p v-if="highlights.length === 0" class="text-sm opacity-60">未匹配到任何内容</p>
      <div v-else class="text-sm">
        <p class="font-semibold">共 {{ highlights.length }} 处匹配</p>
        <ol class="mt-1 list-inside list-decimal space-y-1 font-mono">
          <li v-for="(h, i) in highlights" :key="i">[{{ h.start }}, {{ h.end }}) {{ text.slice(h.start, h.end) }}</li>
        </ol>
      </div>
    </template>
  </div>
</template>
