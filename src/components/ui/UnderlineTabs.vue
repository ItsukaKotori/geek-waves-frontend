<script setup lang="ts">
interface TabItem<K extends string> {
  key: K
  label: string
}

defineProps<{
  tabs: ReadonlyArray<TabItem<string>>
  modelValue: string
}>()

defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <div role="tablist" class="flex flex-wrap gap-5 border-b border-base-300">
    <button
      v-for="t in tabs"
      :key="t.key"
      role="tab"
      type="button"
      class="-mb-px border-b-2 px-1 pb-2.5 text-sm font-medium transition-colors"
      :class="
        modelValue === t.key
          ? 'border-primary text-base-content'
          : 'border-transparent text-base-content/50 hover:text-base-content'
      "
      :aria-selected="modelValue === t.key"
      @click="$emit('update:modelValue', t.key)"
    >
      {{ t.label }}
    </button>
  </div>
</template>
