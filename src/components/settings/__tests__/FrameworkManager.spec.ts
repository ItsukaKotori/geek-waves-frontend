// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import * as settingsApi from '../../../api/settings'
import type { FrameworkWatch, PageResult } from '../../../types'
import FrameworkManager from '../FrameworkManager.vue'

/**
 * FrameworkManager 特征回归:重置加载/加载更多追加/删除确认/行内添加
 * (normalizeRepo 归一 + 输入清空)/行刷新。删除确认机制迁移期可最小适配
 * (window.confirm → ConfirmDialog),断言不弱化。
 */

vi.mock('../../../api/settings', () => ({
  createFramework: vi.fn(),
  deleteFramework: vi.fn(),
  fetchFrameworks: vi.fn(),
  refreshFramework: vi.fn(),
}))

const fetchFrameworksMock = vi.mocked(settingsApi.fetchFrameworks)
const deleteFrameworkMock = vi.mocked(settingsApi.deleteFramework)
const createFrameworkMock = vi.mocked(settingsApi.createFramework)
const refreshFrameworkMock = vi.mocked(settingsApi.refreshFramework)

function watchOf(partial: Partial<FrameworkWatch> & Pick<FrameworkWatch, 'id'>): FrameworkWatch {
  return {
    name: `框架 ${partial.id}`,
    githubRepo: `org/repo-${partial.id}`,
    ...partial,
  }
}

function pageOf(records: FrameworkWatch[], total = records.length): PageResult<FrameworkWatch> {
  return { records, current: 1, size: 20, total, pages: 1 }
}

async function settle(): Promise<void> {
  await flushPromises()
  await flushPromises()
}

function findButtonByText(w: VueWrapper, text: string) {
  return w.findAll('button').find((b) => b.text() === text)
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
  deleteFrameworkMock.mockResolvedValue(undefined)
  createFrameworkMock.mockResolvedValue(watchOf({ id: 9 }))
  refreshFrameworkMock.mockResolvedValue(watchOf({ id: 1, latestVersion: 'v2.0.0' }))
})

describe('FrameworkManager 列表加载', () => {
  it('挂载后重置加载第一页并渲染名称/仓库', async () => {
    fetchFrameworksMock.mockResolvedValue(pageOf([watchOf({ id: 1, name: 'Vue 3' }), watchOf({ id: 2 })]))
    const w = mount(FrameworkManager)
    await settle()

    expect(fetchFrameworksMock).toHaveBeenCalledWith(1, 20)
    expect(w.text()).toContain('Vue 3')
    expect(w.text()).toContain('org/repo-2')
  })

  it('加载更多追加下一页记录', async () => {
    fetchFrameworksMock
      .mockResolvedValueOnce(pageOf([watchOf({ id: 1 })], 25))
      .mockResolvedValueOnce(pageOf([watchOf({ id: 2 })], 25))
    const w = mount(FrameworkManager)
    await settle()

    await findButtonByText(w, '加载更多')!.trigger('click')
    await settle()

    expect(fetchFrameworksMock).toHaveBeenLastCalledWith(2, 20)
    expect(w.text()).toContain('框架 1')
    expect(w.text()).toContain('框架 2')
  })

  it('加载失败渲染错误横幅与兜底文案,重试按钮重新拉取第一页', async () => {
    fetchFrameworksMock.mockRejectedValue(new Error('接口炸了'))
    const w = mount(FrameworkManager)
    await settle()

    expect(w.text()).toContain('接口炸了')

    fetchFrameworksMock.mockResolvedValue(pageOf([watchOf({ id: 1 })]))
    await w.find('button.btn-ghost.btn-sm.text-error').trigger('click')
    await settle()

    expect(fetchFrameworksMock).toHaveBeenLastCalledWith(1, 20)
    expect(w.text()).toContain('框架 1')
  })
})

describe('FrameworkManager 删除流程(ConfirmDialog)', () => {
  it('确认删除:删除接口按 id 调用,toast「已删除」并重置重载', async () => {
    fetchFrameworksMock.mockResolvedValue(pageOf([watchOf({ id: 7, name: 'Nuxt' })], 1))
    const w = mount(FrameworkManager)
    await settle()

    await findButtonByText(w, '删除')!.trigger('click')
    await settle()

    const confirmDialog = w.findComponent({ name: 'ConfirmDialog' })
    expect(confirmDialog.exists()).toBe(true)
    expect(confirmDialog.text()).toContain('确认删除框架关注「Nuxt」?')
    const confirmButton = confirmDialog.findAll('button').find((b) => b.text() === '确认')
    expect(confirmButton!.classes()).toContain('btn-error')
    await confirmButton!.trigger('click')
    await settle()

    expect(deleteFrameworkMock).toHaveBeenCalledWith(7)
    expect(fetchFrameworksMock).toHaveBeenCalledTimes(2)
    expect(fetchFrameworksMock).toHaveBeenLastCalledWith(1, 20)
    expect(w.text()).toContain('已删除')
  })

  it('取消删除:不调用删除接口、不重载', async () => {
    fetchFrameworksMock.mockResolvedValue(pageOf([watchOf({ id: 7 })], 1))
    const w = mount(FrameworkManager)
    await settle()

    await findButtonByText(w, '删除')!.trigger('click')
    await settle()

    const confirmDialog = w.findComponent({ name: 'ConfirmDialog' })
    await confirmDialog.findAll('button').find((b) => b.text() === '取消')!.trigger('click')
    await settle()

    expect(deleteFrameworkMock).not.toHaveBeenCalled()
    expect(fetchFrameworksMock).toHaveBeenCalledTimes(1)
  })
})

describe('FrameworkManager 行内添加', () => {
  it('校验:名称/仓库必填,不调用创建接口', async () => {
    fetchFrameworksMock.mockResolvedValue(pageOf([]))
    const w = mount(FrameworkManager)
    await settle()

    await findButtonByText(w, '添加')!.trigger('click')
    await settle()
    expect(w.text()).toContain('请填写框架名称')

    await w.find('input[placeholder="例:Vue 3"]').setValue('Vue 3')
    await findButtonByText(w, '添加')!.trigger('click')
    await settle()
    expect(w.text()).toContain('请填写 GitHub 仓库(owner/repo)')

    expect(createFrameworkMock).not.toHaveBeenCalled()
  })

  it('添加成功:仓库地址归一为 owner/repo,输入清空并重置重载', async () => {
    fetchFrameworksMock
      .mockResolvedValueOnce(pageOf([]))
      .mockResolvedValueOnce(pageOf([watchOf({ id: 9, name: 'Vue 3', githubRepo: 'vuejs/core' })]))
    const w = mount(FrameworkManager)
    await settle()

    const nameInput = w.find('input[placeholder="例:Vue 3"]')
    const repoInput = w.find('input[placeholder="例:vuejs/core 或 https://github.com/vuejs/core.git"]')
    await nameInput.setValue('Vue 3')
    await repoInput.setValue('https://github.com/vuejs/core.git')
    await findButtonByText(w, '添加')!.trigger('click')
    await settle()

    expect(createFrameworkMock).toHaveBeenCalledWith({ name: 'Vue 3', githubRepo: 'vuejs/core' })
    expect((nameInput.element as HTMLInputElement).value).toBe('')
    expect((repoInput.element as HTMLInputElement).value).toBe('')
    expect(w.text()).toContain('已添加框架关注')
    expect(fetchFrameworksMock).toHaveBeenLastCalledWith(1, 20)
    expect(w.text()).toContain('vuejs/core')
  })
})

describe('FrameworkManager 行刷新', () => {
  it('刷新接口返回后行内更新最新版本并 toast', async () => {
    fetchFrameworksMock.mockResolvedValue(pageOf([watchOf({ id: 1, name: 'Vue 3' })]))
    const w = mount(FrameworkManager)
    await settle()
    expect(w.text()).not.toContain('v2.0.0')

    await findButtonByText(w, '刷新')!.trigger('click')
    await settle()

    expect(refreshFrameworkMock).toHaveBeenCalledWith(1)
    expect(w.text()).toContain('v2.0.0')
    expect(w.text()).toContain('已更新: v2.0.0')
  })
})
