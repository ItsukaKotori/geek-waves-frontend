<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { CommandItem } from '../../types/command'

/**
 * 全局命令面板(T1c):Ctrl/Cmd+K 开关、Esc/遮罩关闭、实时过滤、
 * ↑↓ 循环导航 + Enter 确认、鼠标点击直达。
 *
 * 面板只认识 CommandItem 一种可执行条目,不感知路由与业务来源 ——
 * 未来全站搜索等新数据源产出同型条目注入 items 即可扩展。
 *
 * 焦点管理:打开聚焦搜索框并记住打开前焦点元素;关闭后归还(元素已脱离文档则跳过)。
 * 自定义浮层而非 <dialog>:jsdom 未实现 showModal/focus-trap,此方案测试全可达。
 */
const props = defineProps<{ items: CommandItem[] }>()

const isOpen = ref(false)
const query = ref('')
const activeIndex = ref(0)
const inputRef = ref<HTMLInputElement | null>(null)
let lastFocused: HTMLElement | null = null

const filtered = computed<CommandItem[]>(() => {
  const needle = query.value.trim().toLowerCase()
  if (needle === '') return props.items
  return props.items.filter((item) =>
    `${item.label} ${item.hint ?? ''} ${item.keywords ?? ''}`.toLowerCase().includes(needle),
  )
})

const activeDescendantId = computed(() => {
  const item = filtered.value[activeIndex.value]
  return item ? optionId(item) : ''
})

watch(
  () => filtered.value.length,
  (len) => {
    // 过滤结果收缩时把高亮钳制回合法范围
    if (activeIndex.value >= len) activeIndex.value = Math.max(0, len - 1)
  },
)

function optionId(item: CommandItem): string {
  return `cp-opt-${item.id}`
}

function focusInput(): void {
  inputRef.value?.focus()
}

function openPanel(): void {
  if (isOpen.value) return
  const current = document.activeElement
  lastFocused = current instanceof HTMLElement ? current : null
  query.value = ''
  activeIndex.value = 0
  isOpen.value = true
  void nextTick(focusInput)
}

async function closePanel(): Promise<void> {
  if (!isOpen.value) return
  isOpen.value = false
  // 等 v-if 摘除后归还焦点;目标元素可能因路由切换被移出文档(isConnected 兜底)
  await nextTick()
  const target = lastFocused
  lastFocused = null
  if (target && target.isConnected && typeof target.focus === 'function') {
    target.focus()
  }
}

/** Ctrl/Cmd+K 全局开关(Mac metaKey 同效);输入态聚焦亦允许 —— K 无文本编辑冲突 */
function onGlobalKeydown(e: KeyboardEvent): void {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    if (isOpen.value) void closePanel()
    else openPanel()
  }
}

onMounted(() => document.addEventListener('keydown', onGlobalKeydown))
onBeforeUnmount(() => document.removeEventListener('keydown', onGlobalKeydown))

/** 高亮项滚动进可视区(带最近邻策略,不强制居中) */
function scrollActiveIntoView(): void {
  const active = filtered.value[activeIndex.value]
  if (!active) return
  const el = document.getElementById(optionId(active))
  if (el && typeof el.scrollIntoView === 'function') {
    el.scrollIntoView({ block: 'nearest' })
  }
}

watch([activeIndex, () => filtered.value.length], () => void nextTick(scrollActiveIntoView))

function move(delta: number): void {
  const len = filtered.value.length
  if (len === 0) return
  activeIndex.value = (((activeIndex.value + delta) % len) + len) % len
}

function confirmActive(): void {
  const item = filtered.value[activeIndex.value]
  if (!item) return
  item.run()
  void closePanel()
}

function choose(item: CommandItem): void {
  item.run()
  void closePanel()
}

/** Esc 关闭(避开输入法组合态误触)+ Tab 在面板内圈定焦点 */
function onPanelKeydown(e: KeyboardEvent): void {
  if (e.isComposing) return
  if (e.key === 'Escape' && isOpen.value) {
    e.preventDefault()
    void closePanel()
    return
  }
  if (e.key === 'Tab') {
    e.preventDefault()
    // 面板内唯一稳定可达点是搜索框(options 采用 aria-activedescendant 方案不可聚焦)
    focusInput()
  }
}
</script>

<template>
  <div v-if="isOpen" data-test="command-palette-overlay" class="fixed inset-0 z-[60]">
    <div
      data-test="command-palette-backdrop"
      class="absolute inset-0 bg-black/40"
      @click="closePanel"
    ></div>
    <div
      role="dialog"
      aria-modal="true"
      aria-label="命令面板"
      class="relative mx-auto mt-[12vh] flex w-[92%] max-w-xl flex-col overflow-hidden rounded-box border border-base-300 bg-base-100 shadow-2xl"
      @keydown="onPanelKeydown"
    >
      <div class="flex items-center gap-2 border-b border-base-300 px-4 py-3">
        <input
          ref="inputRef"
          v-model="query"
          data-test="command-palette-input"
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-haspopup="listbox"
          aria-autocomplete="list"
          aria-controls="gw-command-listbox"
          :aria-activedescendant="activeDescendantId"
          placeholder="搜索工具…"
          class="input input-sm input-ghost h-auto grow px-1 text-base font-medium placeholder:text-base-content/40 focus:outline-none"
          @keydown.down.prevent="move(1)"
          @keydown.up.prevent="move(-1)"
          @keydown.enter.prevent="confirmActive"
        />
        <kbd class="kbd kbd-sm text-xs opacity-60">Esc</kbd>
      </div>

      <ul id="gw-command-listbox" role="listbox" aria-label="命令列表" class="max-h-[50vh] overflow-y-auto p-2">
        <li
          v-for="(item, index) in filtered"
          :id="optionId(item)"
          :key="item.id"
          role="option"
          :aria-selected="index === activeIndex ? 'true' : 'false'"
          class="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm"
          :class="
            index === activeIndex
              ? 'bg-base-200 text-primary'
              : 'text-base-content/80 hover:bg-base-200/60'
          "
          @mousedown.prevent
          @click="choose(item)"
        >
          <span class="font-medium">{{ item.label }}</span>
          <span class="text-xs opacity-50">{{ item.hint }}</span>
        </li>
        <li
          v-if="filtered.length === 0"
          data-test="command-palette-empty"
          class="px-3 py-6 text-center text-sm text-base-content/50"
        >
          无匹配命令
        </li>
      </ul>
    </div>
  </div>
</template>
