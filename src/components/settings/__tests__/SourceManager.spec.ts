// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import * as settingsApi from '../../../api/settings'
import type { InfoSource, PageResult } from '../../../types'
import SourceManager from '../SourceManager.vue'

/**
 * SourceManager 特征回归:列表加载/分页/删除确认/启用切换/新增编辑对话框/
 * PRESETS 类型预设。断言钉住对外行为,迁移 useCrudList + ConfirmDialog 期间
 * 交互机制可最小适配(删除确认由 window.confirm → ConfirmDialog),断言不弱化。
 */

vi.mock('../../../api/settings', () => ({
  createSource: vi.fn(),
  deleteSource: vi.fn(),
  fetchSources: vi.fn(),
  triggerFetch: vi.fn(),
  updateSource: vi.fn(),
}))

const fetchSourcesMock = vi.mocked(settingsApi.fetchSources)
const deleteSourceMock = vi.mocked(settingsApi.deleteSource)
const updateSourceMock = vi.mocked(settingsApi.updateSource)
const createSourceMock = vi.mocked(settingsApi.createSource)

function sourceOf(partial: Partial<InfoSource> & Pick<InfoSource, 'id'>): InfoSource {
  return {
    name: `源 ${partial.id}`,
    code: `src${partial.id}`,
    type: 'RSS',
    enabled: true,
    ...partial,
  }
}

function pageOf(records: InfoSource[], total = records.length, pages = 1): PageResult<InfoSource> {
  return { records, current: 1, size: 20, total, pages }
}

async function settle(): Promise<void> {
  await flushPromises()
  await flushPromises()
}

function findButtonByText(w: VueWrapper, text: string) {
  return w.findAll('button').find((b) => b.text() === text)
}

let wrapper: VueWrapper | null = null

async function mountManager(records: InfoSource[], pages = 1) {
  fetchSourcesMock.mockResolvedValue(pageOf(records, records.length, pages))
  wrapper = mount(SourceManager)
  await settle()
  return wrapper
}

beforeAll(() => {
  // jsdom 未实现 <dialog>,以最小行为桩替代(showModal 标记 open,close 触发 close 事件)
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false
    this.dispatchEvent(new Event('close'))
  }
})

beforeEach(() => {
  vi.clearAllMocks()
  deleteSourceMock.mockResolvedValue(undefined)
  updateSourceMock.mockResolvedValue(sourceOf({ id: 1 }))
  createSourceMock.mockResolvedValue(sourceOf({ id: 9 }))
})

describe('SourceManager 列表加载与分页', () => {
  it('挂载后按第一页加载并渲染名称/编码', async () => {
    const w = await mountManager([sourceOf({ id: 1 }), sourceOf({ id: 2 })])

    expect(fetchSourcesMock).toHaveBeenCalledWith(1, 20)
    expect(w.text()).toContain('源 1')
    expect(w.text()).toContain('src2')
  })

  it('加载失败渲染错误横幅与兜底文案', async () => {
    fetchSourcesMock.mockRejectedValue(new Error('接口炸了'))
    const w = mount(SourceManager)
    await settle()

    expect(w.text()).toContain('接口炸了')
    expect(w.text()).not.toContain('源 1')
  })

  it('下一页按页码 +1 重新拉取(page, PAGE_SIZE)', async () => {
    const w = await mountManager([sourceOf({ id: 1 })], 2)

    await findButtonByText(w, '下一页')!.trigger('click')
    await settle()

    expect(fetchSourcesMock).toHaveBeenLastCalledWith(2, 20)
  })
})

describe('SourceManager 删除流程(ConfirmDialog)', () => {
  it('确认删除:删除接口按 id 调用,toast「已删除」并重新加载', async () => {
    const w = await mountManager([sourceOf({ id: 7 })])

    await findButtonByText(w, '删除')!.trigger('click')
    await settle()

    const confirmDialog = w.findComponent({ name: 'ConfirmDialog' })
    expect(confirmDialog.exists()).toBe(true)
    expect(confirmDialog.text()).toContain('确认删除信息源「源 7」?')
    const confirmButton = confirmDialog
      .findAll('button')
      .find((b) => b.text() === '确认')
    expect(confirmButton!.classes()).toContain('btn-error')
    await confirmButton!.trigger('click')
    await settle()

    expect(deleteSourceMock).toHaveBeenCalledWith(7)
    expect(fetchSourcesMock).toHaveBeenCalledTimes(2)
    expect(w.text()).toContain('已删除')
  })

  it('取消删除:不调用删除接口、不重载', async () => {
    const w = await mountManager([sourceOf({ id: 7 })])

    await findButtonByText(w, '删除')!.trigger('click')
    await settle()

    const confirmDialog = w.findComponent({ name: 'ConfirmDialog' })
    const cancelButton = confirmDialog.findAll('button').find((b) => b.text() === '取消')
    await cancelButton!.trigger('click')
    await settle()

    expect(deleteSourceMock).not.toHaveBeenCalled()
    expect(fetchSourcesMock).toHaveBeenCalledTimes(1)
  })
})

describe('SourceManager 启用切换', () => {
  it('乐观翻转并以 enabled: next 调用更新接口,toast 成功', async () => {
    updateSourceMock.mockResolvedValue(sourceOf({ id: 7, enabled: false }))
    const w = await mountManager([sourceOf({ id: 7 })])
    const toggle = w.find('input[type="checkbox"].toggle')

    await toggle.trigger('change')
    await settle()

    expect(updateSourceMock).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ enabled: false, name: '源 7', code: 'src7', type: 'RSS' }),
    )
    expect(w.text()).toContain('已更新启用状态')
  })

  it('更新失败:回滚开关状态并错误 toast', async () => {
    updateSourceMock.mockRejectedValue(new Error('更新失败'))
    const w = await mountManager([sourceOf({ id: 7 })])
    const toggle = w.find('input[type="checkbox"].toggle')
    expect((toggle.element as HTMLInputElement).checked).toBe(true)

    await toggle.trigger('change')
    await settle()

    expect((w.find('input[type="checkbox"].toggle').element as HTMLInputElement).checked).toBe(true)
    expect(w.text()).toContain('更新失败')
  })
})

describe('SourceManager 新增/编辑对话框', () => {
  it('新增:表单初始为 RSS 预设,提交后按 payload 调用创建接口', async () => {
    const w = await mountManager([sourceOf({ id: 1 })])

    await findButtonByText(w, '新增信息源')!.trigger('click')
    expect(w.find('dialog').attributes('open')).toBeDefined()

    const dialog = w.find('dialog')
    dialog.find('input[placeholder="例:V2EX 热帖"]').setValue('测试源')
    dialog.find('input[placeholder="例:v2ex"]').setValue('test')
    await dialog.find('form').trigger('submit')
    await settle()

    expect(createSourceMock).toHaveBeenCalledWith({
      name: '测试源',
      code: 'test',
      type: 'RSS',
      baseUrl: undefined,
      configJson: '{"url":""}',
      sortOrder: 0,
      refreshMinutes: 60,
    })
    expect(w.text()).toContain('已新增信息源')
    expect(w.find('dialog').attributes('open')).toBeUndefined()
  })

  it('编辑:按记录回填表单,提交走更新接口', async () => {
    const w = await mountManager([
      sourceOf({
        id: 7,
        name: 'HN',
        code: 'hn',
        type: 'HN_API',
        baseUrl: 'https://x',
        refreshMinutes: 30,
        configJson: '{"a":1}',
      }),
    ])

    await findButtonByText(w, '编辑')!.trigger('click')
    const dialog = w.find('dialog')
    expect(dialog.attributes('open')).toBeDefined()
    const nameInput = dialog.find('input[placeholder="例:V2EX 热帖"]')
    expect((nameInput.element as HTMLInputElement).value).toBe('HN')

    nameInput.setValue('HN2')
    await dialog.find('form').trigger('submit')
    await settle()

    expect(updateSourceMock).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ name: 'HN2', type: 'HN_API', baseUrl: 'https://x', refreshMinutes: 30 }),
    )
    expect(w.text()).toContain('已保存修改')
  })

  it('校验失败:提示文案且不调用接口', async () => {
    const w = await mountManager([sourceOf({ id: 1 })])

    await findButtonByText(w, '新增信息源')!.trigger('click')
    const dialog = w.find('dialog')
    await dialog.find('form').trigger('submit')
    await settle()

    expect(w.text()).toContain('请填写名称')
    expect(createSourceMock).not.toHaveBeenCalled()
    expect(w.find('dialog').attributes('open')).toBeDefined()
  })

  it('类型切换应用 PRESETS:未定制 configJson 时替换为预设并联动刷新间隔', async () => {
    const w = await mountManager([sourceOf({ id: 1 })])

    await findButtonByText(w, '新增信息源')!.trigger('click')
    const dialog = w.find('dialog')
    const select = dialog.find('select')
    await select.setValue('JSON_API')
    await settle()

    const config = dialog.find('textarea').element as HTMLTextAreaElement
    expect(config.value).toBe('{"itemsPath":"$[*]","titlePath":"$.title","urlPath":"$.url"}')
    const refresh = dialog.find('input[type="number"]')
    expect((refresh.element as HTMLInputElement).value).toBe('30')

    // 用户已定制 configJson 后切换类型:定制值保留
    await dialog.find('textarea').setValue('{"custom":true}')
    await select.setValue('HTML')

    expect((dialog.find('textarea').element as HTMLTextAreaElement).value).toBe('{"custom":true}')
  })
})
