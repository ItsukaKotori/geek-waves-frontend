import { ref, type Ref } from 'vue'
import { useToast } from './useToast'

/**
 * 泛型 CRUD 列表组合式 —— 按 settings 各 Manager 的既有骨架归一:
 * SourceManager / ProviderManager(replace 整表替换,Provider 无分页)、
 * FrameworkManager(append 追加翻页)。行为与被替代的手写骨架逐点对齐:
 *
 * - load:loading/err 状态机;replace 失败清空列表并归零 total/pages;
 *   append 追加失败保留已加载列表与 total,重置失败仅清空列表。
 * - removeItem:删除成功 toast「已删除」+ 重载,失败错误 toast(确认交互
 *   属于 ConfirmDialog,由调用方先行 await)。
 * - toggleEnabled:乐观翻转,失败回滚(两端文案与既有实现一致)。
 * - dialog(可选):openAdd/openEdit 回填表单,save 走 校验 → submit →
 *   toast → 关闭 → 重载,失败写入 formErr;模板 <dialog> 元素由调用方
 *   以 useTemplateRef 绑定后经 dialogEl 传入。
 */

/** 分页取数结果;直接返回数组表示无分页接口(total 随 records) */
export interface CrudPage<T> {
  records: T[]
  total?: number | string
  pages?: number | string
}

/** CRUD 记录的最小形态(编辑回填需要 id) */
export type CrudRecord = { id: number | string }

export interface UseCrudListOptions<T extends CrudRecord> {
  /** 按页码取数 */
  fetchPage: (page: number) => Promise<CrudPage<T> | T[]>
  /** append:loadMore 追加下一页、load(true) 重置;replace(默认):每次整表替换 */
  mode?: 'replace' | 'append'
  /** 列表加载失败的兜底文案 */
  fallbackError?: string
  /** 删除成功后的重载方式:current 保持当前页(默认)/ reset 回第一页 */
  reloadAfterRemove?: 'current' | 'reset'
}

export interface UseCrudDialogOptions<T extends CrudRecord, F> {
  /** 模板 <dialog> 元素引用(经 useTemplateRef 绑定后传入;缺省时仅做无弹窗逻辑) */
  dialogEl?: Ref<HTMLDialogElement | null>
  /** 新增时的空白表单 */
  blank: () => F
  /** 编辑时由记录回填表单 */
  fromItem: (item: T) => F
  /** 保存提交;editingId 为 0 表示新增 */
  submit: (editingId: number | string, form: F) => Promise<unknown>
  /** 提交前校验,返回错误文案(空串视为通过) */
  validate?: (form: F) => string
  /** 保存成功 toast 文案 */
  savedToast?: { add: string; edit: string }
}

export interface UseCrudListReturn<T extends CrudRecord> {
  items: Ref<T[]>
  loading: Ref<boolean>
  err: Ref<string>
  page: Ref<number>
  total: Ref<number>
  pages: Ref<number>
  load: (reset?: boolean) => Promise<void>
  loadMore: () => void
  go: (p: number) => void
  removeItem: (item: T, remove: (id: number | string) => Promise<unknown>) => Promise<boolean>
  toggleEnabled: <K extends { enabled: boolean }>(
    item: K,
    buildUpdate: (item: K, next: boolean) => unknown,
  ) => Promise<void>
  toast: Ref<{ msg: string; ok: boolean } | null>
  showToast: (msg: string, ok?: boolean) => void
}

export interface UseCrudDialogReturn<T extends CrudRecord, F> {
  dialogEl: Ref<HTMLDialogElement | null>
  editingId: Ref<number | string>
  form: Ref<F>
  saving: Ref<boolean>
  formErr: Ref<string>
  openAdd: () => void
  openEdit: (item: T) => void
  closeDialog: () => void
  save: () => Promise<void>
}

export function useCrudList<T extends CrudRecord>(options: UseCrudListOptions<T>): UseCrudListReturn<T>
export function useCrudList<T extends CrudRecord, F>(
  options: UseCrudListOptions<T> & { dialog: UseCrudDialogOptions<T, F> },
): UseCrudListReturn<T> & UseCrudDialogReturn<T, F>
export function useCrudList<T extends CrudRecord, F>(
  options: UseCrudListOptions<T> & { dialog?: UseCrudDialogOptions<T, F> },
): UseCrudListReturn<T> & Partial<UseCrudDialogReturn<T, F>> {
  const {
    fetchPage,
    mode = 'replace',
    fallbackError = '加载失败',
    reloadAfterRemove = 'current',
  } = options
  const { toast, showToast } = useToast()

  const items = ref<T[]>([]) as Ref<T[]>
  const loading = ref(false)
  const err = ref('')
  const page = ref(1)
  const total = ref(0)
  const pages = ref(0)

  async function load(reset = false) {
    if (mode === 'append' && reset) page.value = 1
    loading.value = true
    err.value = ''
    const replace = mode !== 'append' || reset || page.value === 1
    try {
      const res = await fetchPage(page.value)
      const incoming = Array.isArray(res) ? res : res.records
      items.value = replace ? incoming : [...items.value, ...incoming]
      if (Array.isArray(res)) {
        total.value = res.length
      } else {
        total.value = Number(res.total)
        pages.value = res.pages != null ? Number(res.pages) : 0
      }
    } catch (e) {
      err.value = (e as Error).message || fallbackError
      if (replace) {
        items.value = []
        if (mode !== 'append') {
          total.value = 0
          pages.value = 0
        }
      }
    } finally {
      loading.value = false
    }
  }

  function go(p: number) {
    page.value = Math.max(1, Math.min(p, Math.max(pages.value, 1)))
    void load()
  }

  function loadMore() {
    page.value += 1
    void load()
  }

  async function removeItem(
    item: T,
    remove: (id: number | string) => Promise<unknown>,
  ): Promise<boolean> {
    try {
      await remove(item.id)
      showToast('已删除')
      void load(reloadAfterRemove === 'reset')
      return true
    } catch (e) {
      showToast((e as Error).message || '删除失败', false)
      return false
    }
  }

  async function toggleEnabled<K extends { enabled: boolean }>(
    item: K,
    buildUpdate: (item: K, next: boolean) => unknown,
  ): Promise<void> {
    const next = !item.enabled
    item.enabled = next
    try {
      await buildUpdate(item, next)
      showToast('已更新启用状态')
    } catch (e) {
      item.enabled = !next
      showToast((e as Error).message || '更新失败', false)
    }
  }

  const base: UseCrudListReturn<T> = {
    items,
    loading,
    err,
    page,
    total,
    pages,
    load,
    loadMore,
    go,
    removeItem,
    toggleEnabled,
    toast,
    showToast,
  }

  const dialog = options.dialog
  if (!dialog) return base
  const dlg: UseCrudDialogOptions<T, F> = dialog

  const dialogEl = dlg.dialogEl ?? (ref(null) as Ref<HTMLDialogElement | null>)
  const saving = ref(false)
  const formErr = ref('')
  const editingId = ref<number | string>(0)
  const form = ref(dialog.blank()) as Ref<F>

  function openAdd() {
    editingId.value = 0
    form.value = dlg.blank()
    formErr.value = ''
    dialogEl.value?.showModal()
  }

  function openEdit(item: T) {
    editingId.value = item.id
    form.value = dlg.fromItem(item)
    formErr.value = ''
    dialogEl.value?.showModal()
  }

  function closeDialog() {
    dialogEl.value?.close()
  }

  async function save() {
    const msg = dlg.validate?.(form.value) ?? ''
    if (msg) {
      formErr.value = msg
      return
    }
    formErr.value = ''
    saving.value = true
    try {
      await dlg.submit(editingId.value, form.value)
      showToast(
        editingId.value
          ? (dlg.savedToast?.edit ?? '已保存修改')
          : (dlg.savedToast?.add ?? '已新增'),
      )
      closeDialog()
      void load()
    } catch (e) {
      formErr.value = (e as Error).message || '保存失败'
    } finally {
      saving.value = false
    }
  }

  return {
    ...base,
    dialogEl,
    editingId,
    form,
    saving,
    formErr,
    openAdd,
    openEdit,
    closeDialog,
    save,
  }
}
