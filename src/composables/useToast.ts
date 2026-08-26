import { ref } from 'vue'

export function useToast() {
  const toast = ref<{ msg: string; ok: boolean } | null>(null)
  let timer: ReturnType<typeof setTimeout> | undefined

  function showToast(msg: string, ok = true) {
    toast.value = { msg, ok }
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => (toast.value = null), 2500)
  }

  return { toast, showToast }
}
