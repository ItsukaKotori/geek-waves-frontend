// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import * as monitorApi from '../../../api/monitor'
import type { ProbeTarget } from '../../../types/monitor'
import ProbeTargetManager from '../ProbeTargetManager.vue'

/**
 * ProbeTargetManager 删除确认回归:确认/取消语义钉死。确认机制迁移期可
 * 最小适配(window.confirm → ConfirmDialog),删除接口按 id 调用等断言不弱化。
 */

vi.mock('../../../api/monitor', () => ({
  createProbeTarget: vi.fn(),
  deleteProbeTarget: vi.fn(),
  fetchProbeTargets: vi.fn(),
  probeNow: vi.fn(),
  updateProbeTarget: vi.fn(),
}))

const fetchProbeTargetsMock = vi.mocked(monitorApi.fetchProbeTargets)
const deleteProbeTargetMock = vi.mocked(monitorApi.deleteProbeTarget)

function targetOf(partial: Partial<ProbeTarget> & Pick<ProbeTarget, 'id'>): ProbeTarget {
  return {
    name: `目标 ${partial.id}`,
    host: '127.0.0.1',
    port: 8082,
    protocol: 'HTTP',
    enabled: true,
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
  deleteProbeTargetMock.mockResolvedValue(undefined)
  fetchProbeTargetsMock.mockResolvedValue([targetOf({ id: 7, name: '本机后端' })])
})

describe('ProbeTargetManager 删除流程(ConfirmDialog)', () => {
  it('挂载后加载并渲染目标', async () => {
    const w = mount(ProbeTargetManager)
    await settle()

    expect(fetchProbeTargetsMock).toHaveBeenCalledTimes(1)
    expect(w.text()).toContain('本机后端')
  })

  it('确认删除:删除接口按 id 调用,toast「已删除」并重新加载', async () => {
    const w = mount(ProbeTargetManager)
    await settle()

    await findButtonByText(w, '删除')!.trigger('click')
    await settle()

    const confirmDialog = w.findComponent({ name: 'ConfirmDialog' })
    expect(confirmDialog.exists()).toBe(true)
    expect(confirmDialog.text()).toContain('确认删除探测目标「本机后端」?')
    const confirmButton = confirmDialog.findAll('button').find((b) => b.text() === '确认')
    expect(confirmButton!.classes()).toContain('btn-error')
    await confirmButton!.trigger('click')
    await settle()

    expect(deleteProbeTargetMock).toHaveBeenCalledWith(7)
    expect(fetchProbeTargetsMock).toHaveBeenCalledTimes(2)
    expect(w.text()).toContain('已删除')
  })

  it('取消删除:不调用删除接口、不重载', async () => {
    const w = mount(ProbeTargetManager)
    await settle()

    await findButtonByText(w, '删除')!.trigger('click')
    await settle()

    const confirmDialog = w.findComponent({ name: 'ConfirmDialog' })
    await confirmDialog.findAll('button').find((b) => b.text() === '取消')!.trigger('click')
    await settle()

    expect(deleteProbeTargetMock).not.toHaveBeenCalled()
    expect(fetchProbeTargetsMock).toHaveBeenCalledTimes(1)
  })
})
