import { ref } from 'vue'

export function useCopy() {
  const copied = ref(false)
  let timer: ReturnType<typeof setTimeout> | undefined

  async function copy(text: string) {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      copied.value = true
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => (copied.value = false), 1500)
    } catch {
      copied.value = false
    }
  }

  return { copied, copy }
}
