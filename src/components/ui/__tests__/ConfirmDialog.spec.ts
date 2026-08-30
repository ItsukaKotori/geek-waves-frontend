// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import ConfirmDialog from '../ConfirmDialog.vue'

/**
 * ConfirmDialog:DaisyUI 原生 <dialog> 确认框,替代同步阻塞的 window.confirm。
 * 契约:
 * - confirm(options) 返回 Promise<boolean>,确认=true、取消/关闭=false;
 * - 挂起期间(已打开)再次 confirm() 立即 resolve(false),不叠加弹窗;
 * - ESC / 点击遮罩等原生 close 一律视为取消(close-without-choice);
 * - danger=true 时确认按钮为危险态(btn-error)。
 */

function findButtonByText(w: VueWrapper, text: string) {
  return w.findAll('button').find((b) => b.text() === text)
}

/** 打开确认框(同步返回未决 promise;渲染态经 flushPromises 刷新) */
function open(w: VueWrapper, message: string, extra: Record<string, unknown> = {}) {
  const vm = w.vm as unknown as {
    confirm: (options: Record<string, unknown>) => Promise<boolean>
  }
  return vm.confirm({ message, ...extra })
}

describe('ConfirmDialog', () => {
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

  it('confirm 打开对话框:渲染消息与默认按钮,点确认 resolve(true) 并关闭', async () => {
    const w = mount(ConfirmDialog)
    const pending = open(w, '确认删除「X」?')
    await flushPromises()

    const dialog = w.find('dialog')
    expect(dialog.attributes('open')).toBeDefined()
    expect(w.text()).toContain('确认删除「X」?')
    expect(findButtonByText(w, '确认')).toBeTruthy()
    expect(findButtonByText(w, '取消')).toBeTruthy()

    await findButtonByText(w, '确认')!.trigger('click')
    await expect(pending).resolves.toBe(true)
    expect(w.find('dialog').attributes('open')).toBeUndefined()
  })

  it('点取消 resolve(false) 并关闭', async () => {
    const w = mount(ConfirmDialog)
    const pending = open(w, '确认执行?')
    await flushPromises()

    await findButtonByText(w, '取消')!.trigger('click')

    await expect(pending).resolves.toBe(false)
    expect(w.find('dialog').attributes('open')).toBeUndefined()
  })

  it('自定义确认/取消文案与可选标题', async () => {
    const w = mount(ConfirmDialog)
    open(w, '正文', { title: '危险操作', confirmText: '删除', cancelText: '再想想' })
    await flushPromises()

    expect(w.find('h3').text()).toBe('危险操作')
    expect(findButtonByText(w, '删除')).toBeTruthy()
    expect(findButtonByText(w, '再想想')).toBeTruthy()
    expect(findButtonByText(w, '确认')).toBeUndefined()
  })

  it('无标题时不渲染 h3', async () => {
    const w = mount(ConfirmDialog)
    open(w, '只有正文')
    await flushPromises()

    expect(w.find('h3').exists()).toBe(false)
  })

  it('danger=true 确认按钮为 btn-error,默认为 btn-primary', async () => {
    const w = mount(ConfirmDialog)
    open(w, '危险吗?', { danger: true })
    await flushPromises()
    expect(findButtonByText(w, '确认')!.classes()).toContain('btn-error')

    const w2 = mount(ConfirmDialog)
    open(w2, '普通确认?')
    await flushPromises()
    expect(findButtonByText(w2, '确认')!.classes()).toContain('btn-primary')
    expect(findButtonByText(w2, '确认')!.classes()).not.toContain('btn-error')
  })

  it('挂起期间再次 confirm() 立即 resolve(false),不叠加弹窗', async () => {
    const w = mount(ConfirmDialog)
    const vm = w.vm as unknown as { confirm: (o: Record<string, unknown>) => Promise<boolean> }
    const first = vm.confirm({ message: '第一个' })
    await flushPromises()

    await expect(vm.confirm({ message: '第二个' })).resolves.toBe(false)
    expect(w.text()).toContain('第一个')
    expect(w.text()).not.toContain('第二个')

    await findButtonByText(w, '确认')!.trigger('click')
    await expect(first).resolves.toBe(true)
  })

  it('原生 close 事件(ESC/遮罩)视为取消:resolve(false)', async () => {
    const w = mount(ConfirmDialog)
    const pending = open(w, '直接关掉试试')
    await flushPromises()

    w.find('dialog').element.dispatchEvent(new Event('close'))

    await expect(pending).resolves.toBe(false)
  })

  it('确认后的 close 事件不再重复结算(幂等)', async () => {
    const w = mount(ConfirmDialog)
    const pending = open(w, '确认后补发 close')
    await flushPromises()

    await findButtonByText(w, '确认')!.trigger('click')
    await pending
    // polyfill 的 close 已派发过一次 close 事件;再补一次不应产生任何未定状态
    w.find('dialog').element.dispatchEvent(new Event('close'))

    await expect(pending).resolves.toBe(true)
  })
})
