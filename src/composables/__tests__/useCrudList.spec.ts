import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCrudList } from '../useCrudList'

/**
 * useCrudList:泛型 CRUD 列表组合式(按 settings 四 Manager 的既有骨架归一)。
 * - replace 模式:每次 load 整表替换(SourceManager / ProviderManager 形态);
 *   失败清空列表并归零 total/pages。
 * - append 模式:loadMore 追加下一页,load(true) 重置回第一页(FrameworkManager 形态);
 *   追加失败保留已加载列表与 total,重置失败仅清空列表。
 * - removeItem 承担删除后的 toast + 重载骨架(以记录 id 调用删除接口;confirm 交互由 ConfirmDialog 负责)。
 * - toggleEnabled 为乐观更新骨架,失败回滚。
 * - dialog 部分:openAdd/openEdit 回填表单,save 走 校验 → submit → toast → 重载。
 */

interface Row {
  id: number
  name: string
  enabled: boolean
}

function row(id: number, enabled = true): Row {
  return { id, name: `行 ${id}`, enabled }
}

function pageOf(rows: Row[], total: number | string = rows.length, pages: number | string = 1) {
  return { records: rows, total, pages }
}

/** void load() 的重载发生在内部,需要等微任务落地 */
async function settled() {
  await vi.waitFor(() => {})
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useCrudList replace 模式(Source/Provider 形态)', () => {
  it('load 成功:写入 items/total/pages,期间 loading=true,结束后关闭', async () => {
    const fetchPage = vi.fn().mockResolvedValue(pageOf([row(1), row(2)], '7', '4'))
    const crud = useCrudList<Row>({ fetchPage, fallbackError: '加载失败' })

    const pending = crud.load()
    expect(crud.loading.value).toBe(true)
    await pending

    expect(fetchPage).toHaveBeenCalledWith(1)
    expect(crud.items.value.map((r) => r.id)).toEqual([1, 2])
    expect(crud.total.value).toBe(7)
    expect(crud.pages.value).toBe(4)
    expect(crud.loading.value).toBe(false)
    expect(crud.err.value).toBe('')
  })

  it('load 失败:err 取错误 message,清空列表并归零 total/pages', async () => {
    const fetchPage = vi.fn().mockRejectedValue(new Error('网络炸了'))
    const crud = useCrudList<Row>({ fetchPage, fallbackError: '加载失败' })

    await crud.load()

    expect(crud.err.value).toBe('网络炸了')
    expect(crud.items.value).toEqual([])
    expect(crud.total.value).toBe(0)
    expect(crud.pages.value).toBe(0)
    expect(crud.loading.value).toBe(false)
  })

  it('load 失败且错误无 message:落到兜底文案', async () => {
    const fetchPage = vi.fn().mockRejectedValue({})
    const crud = useCrudList<Row>({ fetchPage, fallbackError: '加载失败' })

    await crud.load()

    expect(crud.err.value).toBe('加载失败')
  })

  it('go:页码夹取到 [1, pages] 后重新拉取', async () => {
    const fetchPage = vi.fn().mockResolvedValue(pageOf([], 30, 3))
    const crud = useCrudList<Row>({ fetchPage, fallbackError: '加载失败' })
    await crud.load()

    crud.go(5)
    expect(crud.page.value).toBe(3)
    await settled()
    expect(fetchPage).toHaveBeenLastCalledWith(3)

    crud.go(0)
    expect(crud.page.value).toBe(1)
    await settled()
    expect(fetchPage).toHaveBeenLastCalledWith(1)
  })

  it('fetcher 直接返回数组(无分页):items 即结果,total 随长度', async () => {
    const fetchPage = vi.fn().mockResolvedValue([row(1), row(2), row(3)])
    const crud = useCrudList<Row>({ fetchPage, fallbackError: '加载失败' })

    await crud.load()

    expect(crud.items.value).toHaveLength(3)
    expect(crud.total.value).toBe(3)
  })

  it('无分页 fetcher 失败:同样清空列表', async () => {
    const fetchPage = vi.fn().mockResolvedValueOnce([row(1)]).mockRejectedValue(new Error('挂了'))
    const crud = useCrudList<Row>({ fetchPage, fallbackError: '加载失败' })
    await crud.load()

    await crud.load()

    expect(crud.err.value).toBe('挂了')
    expect(crud.items.value).toEqual([])
    expect(crud.total.value).toBe(0)
  })
})

describe('useCrudList append 模式(Framework 形态)', () => {
  it('load(true) 重置回第一页并整表替换', async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce(pageOf([row(1)], 20, 2))
      .mockResolvedValueOnce(pageOf([row(2)], 20, 2))
      .mockResolvedValueOnce(pageOf([row(1)], 20, 2))
    const crud = useCrudList<Row>({ fetchPage, mode: 'append', fallbackError: '加载失败' })
    await crud.load(true)

    crud.loadMore()
    await settled()
    expect(crud.items.value.map((r) => r.id)).toEqual([1, 2])
    expect(crud.page.value).toBe(2)

    await crud.load(true)
    expect(fetchPage).toHaveBeenLastCalledWith(1)
    expect(crud.items.value.map((r) => r.id)).toEqual([1])
    expect(crud.page.value).toBe(1)
  })

  it('loadMore 失败:err 提示但保留已加载列表与 total', async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce(pageOf([row(1)], 20, 2))
      .mockRejectedValue(new Error('翻页失败'))
    const crud = useCrudList<Row>({ fetchPage, mode: 'append', fallbackError: '加载失败' })
    await crud.load(true)

    crud.loadMore()
    await settled()

    expect(crud.err.value).toBe('翻页失败')
    expect(crud.items.value.map((r) => r.id)).toEqual([1])
    expect(crud.total.value).toBe(20)
    expect(crud.loading.value).toBe(false)
  })

  it('重置加载失败:清空列表但保留 total(现有 Framework 行为)', async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce(pageOf([row(1)], 20, 2))
      .mockRejectedValue(new Error('重置失败'))
    const crud = useCrudList<Row>({ fetchPage, mode: 'append', fallbackError: '加载失败' })
    await crud.load(true)

    await crud.load(true)

    expect(crud.err.value).toBe('重置失败')
    expect(crud.items.value).toEqual([])
    expect(crud.total.value).toBe(20)
  })
})

describe('useCrudList removeItem', () => {
  it('删除成功:toast「已删除」并重载当前页,返回 true', async () => {
    const fetchPage = vi.fn().mockResolvedValue(pageOf([row(1), row(2)]))
    const crud = useCrudList<Row>({ fetchPage, fallbackError: '加载失败' })
    await crud.load()
    const target = crud.items.value[1]!
    const removeApi = vi.fn().mockResolvedValue(undefined)

    const ok = await crud.removeItem(target, removeApi)

    expect(ok).toBe(true)
    expect(removeApi).toHaveBeenCalledWith(target.id)
    expect(crud.toast.value).toMatchObject({ msg: '已删除', ok: true })
    expect(fetchPage).toHaveBeenCalledTimes(2)
    expect(fetchPage).toHaveBeenLastCalledWith(1)
  })

  it('删除失败:错误 toast,不重载,返回 false', async () => {
    const fetchPage = vi.fn().mockResolvedValue(pageOf([row(1)]))
    const crud = useCrudList<Row>({ fetchPage, fallbackError: '加载失败' })
    await crud.load()
    const removeApi = vi.fn().mockRejectedValue(new Error('删不掉'))

    const ok = await crud.removeItem(crud.items.value[0]!, removeApi)

    expect(ok).toBe(false)
    expect(crud.toast.value).toMatchObject({ msg: '删不掉', ok: false })
    expect(fetchPage).toHaveBeenCalledTimes(1)
  })

  it('删除失败且错误无 message:兜底「删除失败」', async () => {
    const fetchPage = vi.fn().mockResolvedValue(pageOf([row(1)]))
    const crud = useCrudList<Row>({ fetchPage, fallbackError: '加载失败' })
    await crud.load()
    const removeApi = vi.fn().mockRejectedValue({})

    await crud.removeItem(crud.items.value[0]!, removeApi)

    expect(crud.toast.value).toMatchObject({ msg: '删除失败', ok: false })
  })

  it('reloadAfterRemove=reset:删除后重载回第一页(append 模式)', async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce(pageOf([row(1)], 20, 2))
      .mockResolvedValueOnce(pageOf([row(2)], 20, 2))
      .mockResolvedValueOnce(pageOf([row(1)], 20, 2))
    const crud = useCrudList<Row>({
      fetchPage,
      mode: 'append',
      reloadAfterRemove: 'reset',
      fallbackError: '加载失败',
    })
    await crud.load(true)
    crud.loadMore()
    await settled()
    expect(crud.items.value.map((r) => r.id)).toEqual([1, 2])

    const removeApi = vi.fn().mockResolvedValue(undefined)
    await crud.removeItem(crud.items.value[1]!, removeApi)

    await vi.waitFor(() => expect(fetchPage).toHaveBeenLastCalledWith(1))
    expect(crud.page.value).toBe(1)
    expect(crud.items.value.map((r) => r.id)).toEqual([1])
  })
})

describe('useCrudList toggleEnabled', () => {
  it('成功:乐观翻转,按 next 调用更新器,toast「已更新启用状态」', async () => {
    const fetchPage = vi.fn().mockResolvedValue(pageOf([row(1)]))
    const crud = useCrudList<Row>({ fetchPage, fallbackError: '加载失败' })
    const target = row(1, true)
    const update = vi.fn().mockResolvedValue(undefined)

    await crud.toggleEnabled(target, (it, next) => update(it.id, next))

    expect(update).toHaveBeenCalledWith(1, false)
    expect(target.enabled).toBe(false)
    expect(crud.toast.value).toMatchObject({ msg: '已更新启用状态', ok: true })
  })

  it('失败:回滚到原状态并错误 toast', async () => {
    const fetchPage = vi.fn().mockResolvedValue(pageOf([row(1)]))
    const crud = useCrudList<Row>({ fetchPage, fallbackError: '加载失败' })
    const target = row(1, true)
    const update = vi.fn().mockRejectedValue(new Error('更新失败'))

    await crud.toggleEnabled(target, (it, next) => update(it.id, next))

    expect(target.enabled).toBe(true)
    expect(crud.toast.value).toMatchObject({ msg: '更新失败', ok: false })
  })
})

describe('useCrudList dialog(新增/编辑骨架)', () => {
  interface Form {
    name: string
    note: string
  }

  function setup() {
    const fetchPage = vi.fn().mockResolvedValue(pageOf([row(1)]))
    const submit = vi.fn().mockResolvedValue(undefined)
    const crud = useCrudList<Row, Form>({
      fetchPage,
      fallbackError: '加载失败',
      dialog: {
        blank: () => ({ name: '', note: '' }),
        fromItem: (r) => ({ name: r.name, note: `来自 ${r.id}` }),
        submit,
        savedToast: { add: '已新增测试项', edit: '已保存修改' },
      },
    })
    return { fetchPage, submit, crud }
  }

  it('openAdd:表单置为 blank,editingId 归零', async () => {
    const { crud } = setup()
    await crud.load()

    crud.openAdd()

    expect(crud.editingId.value).toBe(0)
    expect(crud.form.value).toEqual({ name: '', note: '' })
    expect(crud.formErr.value).toBe('')
  })

  it('openEdit:fromItem 回填表单并记录编辑 id', async () => {
    const { crud } = setup()
    await crud.load()

    crud.openEdit(crud.items.value[0]!)

    expect(crud.editingId.value).toBe(1)
    expect(crud.form.value).toEqual({ name: '行 1', note: '来自 1' })
  })

  it('save:校验失败时 formErr 提示且不提交', async () => {
    const fetchPage = vi.fn().mockResolvedValue(pageOf([row(1)]))
    const submit = vi.fn().mockResolvedValue(undefined)
    const crud = useCrudList<Row, Form>({
      fetchPage,
      dialog: {
        blank: () => ({ name: '', note: '' }),
        fromItem: (r) => ({ name: r.name, note: '' }),
        submit,
        validate: (f) => (f.name.trim() ? '' : '请填写名称'),
      },
    })
    await crud.load()

    crud.openAdd()
    await crud.save()

    expect(crud.formErr.value).toBe('请填写名称')
    expect(submit).not.toHaveBeenCalled()
  })

  it('save 成功(新增):以 editingId=0 提交,toast 文案取 add,重载列表', async () => {
    const { fetchPage, submit, crud } = setup()
    await crud.load()

    crud.openAdd()
    crud.form.value.name = '新行'
    await crud.save()

    expect(submit).toHaveBeenCalledWith(0, expect.objectContaining({ name: '新行' }))
    expect(crud.toast.value).toMatchObject({ msg: '已新增测试项', ok: true })
    expect(crud.formErr.value).toBe('')
    expect(crud.saving.value).toBe(false)
    expect(fetchPage).toHaveBeenCalledTimes(2)
  })

  it('save 成功(编辑):editingId 为记录 id,toast 文案取 edit', async () => {
    const { submit, crud } = setup()
    await crud.load()

    crud.openEdit(crud.items.value[0]!)
    await crud.save()

    expect(submit).toHaveBeenCalledWith(1, expect.objectContaining({ name: '行 1' }))
    expect(crud.toast.value).toMatchObject({ msg: '已保存修改', ok: true })
  })

  it('save 失败:formErr 取错误 message,saving 复位且不关闭流程提示成功', async () => {
    const fetchPage = vi.fn().mockResolvedValue(pageOf([row(1)]))
    const submit = vi.fn().mockRejectedValue(new Error('保存被拒'))
    const crud = useCrudList<Row, Form>({
      fetchPage,
      dialog: {
        blank: () => ({ name: '', note: '' }),
        fromItem: (r) => ({ name: r.name, note: '' }),
        submit,
      },
    })
    await crud.load()

    crud.openAdd()
    await crud.save()

    expect(crud.formErr.value).toBe('保存被拒')
    expect(crud.saving.value).toBe(false)
    expect(crud.toast.value).toBeNull()
  })

  it('save 失败且错误无 message:兜底「保存失败」', async () => {
    const fetchPage = vi.fn().mockResolvedValue(pageOf([row(1)]))
    const submit = vi.fn().mockRejectedValue({})
    const crud = useCrudList<Row, Form>({
      fetchPage,
      dialog: {
        blank: () => ({ name: '', note: '' }),
        fromItem: (r) => ({ name: r.name, note: '' }),
        submit,
      },
    })
    await crud.load()

    crud.openAdd()
    await crud.save()

    expect(crud.formErr.value).toBe('保存失败')
  })
})
