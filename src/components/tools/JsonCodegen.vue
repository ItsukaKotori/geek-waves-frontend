<script setup lang="ts">
import { computed, ref } from 'vue'
import { codegenTargets, findTarget } from '../../tools/jsonCodegen'
import { useCopy } from '../../composables/useCopy'
import { useToolState } from '../../composables/useToolState'
import { watchDebounced } from '../../composables/useDebounce'
import ErrorBanner from '../ui/ErrorBanner.vue'

/**
 * JSON 类型生成(FE11 T2 批次二):JSON → Kotlin data class / Rust struct。
 * 生成器纯函数层照抄 jsonConvert.ts 既有类型生成模式(顶层须为对象、根名 Root、
 * 数组取首元素类型、null→Any?/serde_json::Value 对齐 TS 的 any、字段恒必填);
 * Rust 键名 snake_case 并在名称变化时补 #[serde(rename)]。实时范式:150ms 防抖。
 */

interface CodegenState {
  input: string
  targetId: string
}

/** 输入与目标经 localStorage 持久化(key 与注册表一致),刷新后恢复 */
const { state } = useToolState<CodegenState>('codegen', {
  input: JSON.stringify(
    {
      name: 'GeekWaves',
      stars: 128,
      tags: ['vue', 'ts'],
      author: { name: 'Zuikaku', bot: false },
    },
    null,
    2,
  ),
  targetId: 'kotlin',
})

const output = ref('')
const errorMessage = ref('')
const { copied, copy } = useCopy()

const target = computed(() => findTarget(state.targetId))

function run(): void {
  const src = state.input
  if (!src.trim()) {
    output.value = ''
    errorMessage.value = ''
    return
  }
  try {
    output.value = target.value ? target.value.generate(src) : ''
    errorMessage.value = ''
  } catch (e) {
    output.value = ''
    errorMessage.value = (e as Error).message || '类型生成失败'
  }
}

const runner = watchDebounced([() => state.input, () => state.targetId], run)

function recomputeNow(): void {
  runner.flush()
}

/** 清空输入立即失效旧输出,不等防抖窗口 */
function onInput(): void {
  if (state.input.trim() !== '') return
  runner.cancel()
  output.value = ''
  errorMessage.value = ''
  run()
}
</script>

<template>
  <div class="flex flex-col gap-3" @keydown.ctrl.enter.prevent="recomputeNow" @keydown.meta.enter.prevent="recomputeNow">
    <h2 class="text-base font-semibold tracking-tight">JSON 类型生成</h2>

    <div class="flex flex-wrap items-center gap-2">
      <span class="text-sm opacity-70">目标语言</span>
      <select v-model="state.targetId" data-testid="codegen-target" class="select select-sm w-36">
        <option v-for="t in codegenTargets" :key="t.id" :value="t.id">{{ t.label }}</option>
      </select>
      <span class="text-xs opacity-50">{{ target?.label }} 仅支持 JSON → {{ target?.label }}(单向生成)</span>
    </div>

    <textarea
      v-model="state.input"
      data-testid="codegen-input"
      rows="10"
      placeholder='{"name":"GeekWaves","tags":["vue","daisyui"]}'
      class="textarea textarea-bordered font-mono"
      spellcheck="false"
      @input="onInput"
    />

    <ErrorBanner :message="errorMessage" />

    <div class="flex flex-wrap gap-2">
      <button v-if="output" type="button" data-testid="codegen-copy" class="btn btn-sm btn-ghost" @click="copy(output)">
        {{ copied ? '已复制' : '复制' }}
      </button>
      <span v-if="!output && !errorMessage" class="self-center text-xs opacity-50">
        输入 JSON 后实时生成,Ctrl+Enter 立即重算
      </span>
    </div>

    <pre
      v-if="output"
      data-testid="codegen-output"
      class="max-h-96 overflow-auto whitespace-pre-wrap rounded-box border border-base-300 bg-base-200/60 p-3 font-mono text-sm"
    >{{ output }}</pre>

    <p class="text-xs opacity-50">
      口径:顶层须为对象(与 TS 接口/SQL 生成一致);数字整数 → Long/i64、浮点 → Double/f64
      (64 位范围外按浮点);null → Kotlin Any? / Rust serde_json::Value(对齐 TS 生成器的 any),
      字段恒必填、无 Option/默认值;Kotlin 键名保留原文(关键字/非法标识符反引号包裹),
      Rust 键名 snake_case,名称变化时补 #[serde(rename = "原键")] 保证可反序列化;
      嵌套对象为扁平独立声明,类名取字段名 PascalCase,冲突追加序号;归一化撞名的字段名
      同结构体内去重加序号(Rust 凭 serde(rename) 仍指向原键;Kotlin 不加注解,
      异形键的序列化保真不保证;单下划线/空键归一为 __)
    </p>
  </div>
</template>
