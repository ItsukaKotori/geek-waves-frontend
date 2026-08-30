// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import * as settingsApi from '../../../api/settings'
import type { AiProvider } from '../../../types'
import ProviderManager from '../ProviderManager.vue'

/**
 * ProviderManager 特征回归:列表加载/删除确认/启用切换/设为默认/
 * 新增编辑对话框(apiKey 仅在有值时提交)。迁移 useCrudList + ConfirmDialog
 * 期间交互机制可最小适配(window.confirm → ConfirmDialog),断言不弱化。
 */

vi.mock('../../../api/settings', () => ({
  createProvider: vi.fn(),
  deleteProvider: vi.fn(),
  fetchProviders: vi.fn(),
  setDefaultProvider: vi.fn(),
  updateProvider: vi.fn(),
}))

const fetchProvidersMock = vi.mocked(settingsApi.fetchProviders)
const deleteProviderMock = vi.mocked(settingsApi.deleteProvider)
const updateProviderMock = vi.mocked(settingsApi.updateProvider)
const setDefaultProviderMock = vi.mocked(settingsApi.setDefaultProvider)
const createProviderMock = vi.mocked(settingsApi.createProvider)

function providerOf(partial: Partial<AiProvider> & Pick<AiProvider, 'id'>): AiProvider {
  return {
    name: `配置 ${partial.id}`,
    vendor: 'OPENAI_COMPAT',
    enabled: true,
    isDefault: false,
    ...partial,
  }
}

async function settle(): Promise<void> {
  await flushPromises()
  await flushPromises()
}

function findButtonByText(w: VueWrapper, text: string) {
  return w.findAll('button').find((b) => b.text() === text)
}

async function mountManager(records: AiProvider[]) {
  fetchProvidersMock.mockResolvedValue(records)
  const w = mount(ProviderManager)
  await settle()
  return w
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
  deleteProviderMock.mockResolvedValue(undefined)
  updateProviderMock.mockResolvedValue(providerOf({ id: 1 }))
  createProviderMock.mockResolvedValue(providerOf({ id: 9 }))
  setDefaultProviderMock.mockResolvedValue(undefined)
})

describe('ProviderManager 列表加载', () => {
  it('挂载后加载并渲染配置名称与 vendor 标签', async () => {
    const w = await mountManager([providerOf({ id: 1, name: 'DeepSeek' }), providerOf({ id: 2, vendor: 'ANTHROPIC' })])

    expect(fetchProvidersMock).toHaveBeenCalledTimes(1)
    expect(w.text()).toContain('DeepSeek')
    expect(w.text()).toContain('Anthropic')
  })

  it('加载失败渲染错误横幅与兜底文案', async () => {
    fetchProvidersMock.mockRejectedValue(new Error('接口炸了'))
    const w = mount(ProviderManager)
    await settle()

    expect(w.text()).toContain('接口炸了')
    // 空态引导文案含厂商示例,此处断言配置卡片未渲染
    expect(w.text()).not.toContain('配置 1')
  })
})

describe('ProviderManager 删除流程(ConfirmDialog)', () => {
  it('确认删除:删除接口按 id 调用,toast「已删除」并重新加载', async () => {
    const w = await mountManager([providerOf({ id: 7, name: 'DeepSeek' })])

    await findButtonByText(w, '删除')!.trigger('click')
    await settle()

    const confirmDialog = w.findComponent({ name: 'ConfirmDialog' })
    expect(confirmDialog.exists()).toBe(true)
    expect(confirmDialog.text()).toContain('确认删除 AI 配置「DeepSeek」?')
    const confirmButton = confirmDialog.findAll('button').find((b) => b.text() === '确认')
    expect(confirmButton!.classes()).toContain('btn-error')
    await confirmButton!.trigger('click')
    await settle()

    expect(deleteProviderMock).toHaveBeenCalledWith(7)
    expect(fetchProvidersMock).toHaveBeenCalledTimes(2)
    expect(w.text()).toContain('已删除')
  })

  it('取消删除:不调用删除接口、不重载', async () => {
    const w = await mountManager([providerOf({ id: 7 })])

    await findButtonByText(w, '删除')!.trigger('click')
    await settle()

    const confirmDialog = w.findComponent({ name: 'ConfirmDialog' })
    await confirmDialog.findAll('button').find((b) => b.text() === '取消')!.trigger('click')
    await settle()

    expect(deleteProviderMock).not.toHaveBeenCalled()
    expect(fetchProvidersMock).toHaveBeenCalledTimes(1)
  })
})

describe('ProviderManager 启用切换', () => {
  it('乐观翻转并以 enabled: next 调用更新接口,toast 成功', async () => {
    const w = await mountManager([providerOf({ id: 7 })])
    const toggle = w.find('input[type="checkbox"].toggle')

    await toggle.trigger('change')
    await settle()

    expect(updateProviderMock).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ enabled: false, name: '配置 7', vendor: 'OPENAI_COMPAT' }),
    )
    expect(w.text()).toContain('已更新启用状态')
  })

  it('更新失败:回滚开关状态并错误 toast', async () => {
    updateProviderMock.mockRejectedValue(new Error('更新失败'))
    const w = await mountManager([providerOf({ id: 7 })])

    await w.find('input[type="checkbox"].toggle').trigger('change')
    await settle()

    expect((w.find('input[type="checkbox"].toggle').element as HTMLInputElement).checked).toBe(true)
    expect(w.text()).toContain('更新失败')
  })
})

describe('ProviderManager 设为默认', () => {
  it('调用 set-default 接口并重新加载,toast 带配置名', async () => {
    const w = await mountManager([providerOf({ id: 7, name: 'DeepSeek' })])

    await findButtonByText(w, '设为默认')!.trigger('click')
    await settle()

    expect(setDefaultProviderMock).toHaveBeenCalledWith(7)
    expect(fetchProvidersMock).toHaveBeenCalledTimes(2)
    expect(w.text()).toContain('已将「DeepSeek」设为默认')
  })
})

describe('ProviderManager 新增/编辑对话框', () => {
  it('新增:提交 payload 且 apiKey 仅在有值时带上', async () => {
    const w = await mountManager([providerOf({ id: 1 })])

    await findButtonByText(w, '新增 AI 配置')!.trigger('click')
    const dialog = w.find('dialog')
    expect(dialog.attributes('open')).toBeDefined()

    dialog.find('input[placeholder="例:DeepSeek"]').setValue('MyAI')
    dialog.find('input[placeholder="https://api.deepseek.com"]').setValue('https://api.my.ai')
    dialog.find('input[placeholder="deepseek-chat"]').setValue('my-model')
    dialog.find('input[placeholder="请输入 API Key"]').setValue('sk-123')
    await dialog.find('form').trigger('submit')
    await settle()

    expect(createProviderMock).toHaveBeenCalledWith({
      name: 'MyAI',
      vendor: 'OPENAI_COMPAT',
      enabled: true,
      isDefault: false,
      baseUrl: 'https://api.my.ai',
      model: 'my-model',
      apiKey: 'sk-123',
    })
    expect(w.text()).toContain('AI 配置已新增')
    expect(w.find('dialog').attributes('open')).toBeUndefined()
  })

  it('编辑:回填记录且 apiKey 置空,提交走更新接口', async () => {
    const w = await mountManager([providerOf({ id: 7, name: 'DeepSeek', model: 'deepseek-chat', baseUrl: 'https://api.deepseek.com', apiKeyEnc: 'enc' })])

    await findButtonByText(w, '编辑')!.trigger('click')
    const dialog = w.find('dialog')
    expect(dialog.attributes('open')).toBeDefined()

    const nameInput = dialog.find('input[placeholder="例:DeepSeek"]')
    expect((nameInput.element as HTMLInputElement).value).toBe('DeepSeek')
    const keyInput = dialog.find('input[placeholder="已设置,如需修改请重新输入"]')
    expect((keyInput.element as HTMLInputElement).value).toBe('')

    nameInput.setValue('DeepSeek2')
    await dialog.find('form').trigger('submit')
    await settle()

    expect(updateProviderMock).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ name: 'DeepSeek2', model: 'deepseek-chat' }),
    )
    const payload = updateProviderMock.mock.calls[0]![1]
    expect(payload.apiKey).toBeUndefined()
    expect(w.text()).toContain('已保存修改')
  })

  it('校验失败:提示文案且不调用接口', async () => {
    const w = await mountManager([providerOf({ id: 1 })])

    await findButtonByText(w, '新增 AI 配置')!.trigger('click')
    await w.find('dialog').find('form').trigger('submit')
    await settle()

    expect(w.text()).toContain('请填写名称')
    expect(createProviderMock).not.toHaveBeenCalled()
    expect(w.find('dialog').attributes('open')).toBeDefined()
  })
})
