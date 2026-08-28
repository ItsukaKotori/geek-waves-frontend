// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DOMWrapper, mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import CommandPalette from '../CommandPalette.vue'
import type { CommandItem } from '../../../types/command'

/**
 * CommandPalette 全局命令面板(T1c):Ctrl/Cmd+K 开关、Esc/遮罩关闭、
 * 实时过滤、↑↓ 循环导航 + Enter 确认、选中执行动作、焦点开合管理、Tab 焦点圈定。
 */

const items: CommandItem[] = [
  { id: 'tool:json', label: 'JSON 转换', hint: '编解码', keywords: 'json format', run: vi.fn() },
  { id: 'tool:ts', label: '时间戳', hint: '编解码', keywords: 'ts timestamp', run: vi.fn() },
  {
    id: 'tool:http',
    label: 'HTTP 接口测试',
    hint: '接口',
    keywords: 'http api request',
    run: vi.fn(),
  },
]

const wrappers: VueWrapper[] = []

async function mountPalette(attachTo: boolean = false): Promise<VueWrapper> {
  const wrapper = mount(CommandPalette, {
    props: { items },
    attachTo: attachTo ? document.body : undefined,
  })
  wrappers.push(wrapper)
  await nextTick()
  return wrapper
}

function keydown(init: KeyboardEventInit, target: EventTarget = document.body): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init }))
}

function overlayOf(wrapper: VueWrapper): DOMWrapper<Element> {
  return wrapper.find('[data-test="command-palette-overlay"]')
}

function visibleOptions(wrapper: VueWrapper): DOMWrapper<Element>[] {
  return wrapper.findAll('[role="option"]').filter((o) => o.isVisible())
}

function inputOf(wrapper: VueWrapper): DOMWrapper<HTMLInputElement> {
  return wrapper.find<HTMLInputElement>('[data-test="command-palette-input"]')
}

function activeOptionId(wrapper: VueWrapper): string {
  return inputOf(wrapper).attributes('aria-activedescendant') ?? ''
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  while (wrappers.length) wrappers.pop()?.unmount()
})

describe('T1c 开关切换(Ctrl/Cmd+K 与 Esc/遮罩)', () => {
  it('默认不渲染任何浮层内容', async () => {
    const w = await mountPalette()
    expect(overlayOf(w).exists()).toBe(false)
  })

  it('Ctrl+K 打开浮层并聚焦搜索框(dialog + aria-modal 完备)', async () => {
    const w = await mountPalette(true)
    keydown({ key: 'k', ctrlKey: true })
    await nextTick()

    expect(overlayOf(w).isVisible()).toBe(true)
    const dialog = w.find('[role="dialog"]')
    expect(dialog.exists()).toBe(true)
    expect(dialog.attributes('aria-modal')).toBe('true')
    expect(document.activeElement).toBe(inputOf(w).element)
  })

  it('Mac 上 Cmd+K(metaKey)同样可打开', async () => {
    const w = await mountPalette()
    keydown({ key: 'k', metaKey: true })
    await nextTick()
    expect(overlayOf(w).exists()).toBe(true)
  })

  it('再次 Ctrl+K 可关闭(toggle),且不残留 aria 活动状态', async () => {
    const w = await mountPalette()
    keydown({ key: 'k', ctrlKey: true })
    await nextTick()
    expect(overlayOf(w).exists()).toBe(true)

    keydown({ key: 'k', ctrlKey: true })
    await nextTick()
    expect(overlayOf(w).exists()).toBe(false)
  })

  it('Esc 关闭浮层并把焦点归还给打开前的元素', async () => {
    const w = await mountPalette(true)
    const anchor = document.createElement('button')
    document.body.appendChild(anchor)
    anchor.focus()
    expect(document.activeElement).toBe(anchor)

    keydown({ key: 'k', ctrlKey: true })
    await nextTick()
    expect(document.activeElement).toBe(inputOf(w).element)

    inputOf(w).trigger('keydown', { key: 'Escape' })
    await nextTick()
    expect(overlayOf(w).exists()).toBe(false)
    expect(document.activeElement).toBe(anchor)

    anchor.remove()
  })

  it('点击遮罩关闭;点击面板内部不关闭', async () => {
    const w = await mountPalette(true)
    keydown({ key: 'k', ctrlKey: true })
    await nextTick()

    inputOf(w).element.click()
    await nextTick()
    expect(overlayOf(w).exists()).toBe(true)

    overlayOf(w).find('[data-test="command-palette-backdrop"]').trigger('click')
    await nextTick()
    expect(overlayOf(w).exists()).toBe(false)
  })

  it('重新打开时过滤词与高亮复位(每次打开是干净状态)', async () => {
    const w = await mountPalette()
    keydown({ key: 'k', ctrlKey: true })
    await nextTick()
    await inputOf(w).setValue('http')
    await nextTick()
    expect(visibleOptions(w)).toHaveLength(1)

    keydown({ key: 'k', ctrlKey: true })
    await nextTick()

    keydown({ key: 'k', ctrlKey: true })
    await nextTick()
    expect((inputOf(w).element as HTMLInputElement).value).toBe('')
    expect(visibleOptions(w)).toHaveLength(items.length)
    expect(activeOptionId(w)).toContain('tool:json')
  })
})

describe('T1c 过滤匹配(label/hint/keywords 不区分大小写,实时 computed)', () => {
  it('空查询列出全部条目', async () => {
    const w = await mountPalette()
    keydown({ key: 'k', ctrlKey: true })
    await nextTick()
    expect(visibleOptions(w)).toHaveLength(3)
  })

  it('按 label 匹配,大小写不敏感(json 与 JSON 等价)', async () => {
    const w = await mountPalette()
    keydown({ key: 'k', ctrlKey: true })
    await nextTick()
    await inputOf(w).setValue('JSON')
    await nextTick()
    let texts = visibleOptions(w).map((o) => o.text().replace(/\s+/g, ''))
    expect(texts).toEqual(['JSON转换编解码'])

    await inputOf(w).setValue('json')
    await nextTick()
    texts = visibleOptions(w).map((o) => o.text().replace(/\s+/g, ''))
    expect(texts).toEqual(['JSON转换编解码'])
  })

  it('按 keywords 别名匹配:输入 ts 命中「时间戳」而 label 不含该字样', async () => {
    const w = await mountPalette()
    keydown({ key: 'k', ctrlKey: true })
    await nextTick()
    await inputOf(w).setValue('ts')
    await nextTick()
    expect(visibleOptions(w).map((o) => o.text().replace(/\s+/g, ''))).toEqual(['时间戳编解码'])
  })

  it('无匹配时展示空态提示,列表为空', async () => {
    const w = await mountPalette()
    keydown({ key: 'k', ctrlKey: true })
    await nextTick()
    await inputOf(w).setValue('不存在的命令xyz')
    await nextTick()
    expect(visibleOptions(w)).toHaveLength(0)
    expect(w.find('[data-test="command-palette-empty"]').text()).toBe('无匹配命令')
  })
})

describe('T1c 键盘导航(↑↓ 循环、Enter 确认、鼠标可点)', () => {
  async function openAndFind(): Promise<VueWrapper> {
    // run spy 为文件级共享 vi.fn,先清调用历史保证断言不受用例顺序影响
    for (const item of items) (item.run as ReturnType<typeof vi.fn>).mockClear()
    const w = await mountPalette(true)
    keydown({ key: 'k', ctrlKey: true })
    await nextTick()
    return w
  }

  it('ArrowDown 下移高亮并由 aria-selected/aria-activedescendant 表达;到末尾循环回首项', async () => {
    const w = await openAndFind()
    const options = visibleOptions(w)
    expect(activeOptionId(w)).toBe(options[0]!.attributes('id'))

    await inputOf(w).trigger('keydown', { key: 'ArrowDown' })
    await nextTick()
    expect(options[1]!.attributes('id')).toBe(activeOptionId(w))
    expect(options[1]!.attributes('aria-selected')).toBe('true')
    expect(options[0]!.attributes('aria-selected')).toBe('false')

    await inputOf(w).trigger('keydown', { key: 'ArrowDown' })
    await nextTick()
    expect(activeOptionId(w)).toBe(options[2]!.attributes('id'))

    // 到末尾再下 → 回到第一项(循环)
    await inputOf(w).trigger('keydown', { key: 'ArrowDown' })
    await nextTick()
    expect(activeOptionId(w)).toBe(options[0]!.attributes('id'))
  })

  it('ArrowUp 从首项上移循环到末项', async () => {
    const w = await openAndFind()
    const options = visibleOptions(w)
    await inputOf(w).trigger('keydown', { key: 'ArrowUp' })
    await nextTick()
    expect(activeOptionId(w)).toBe(options[2]!.attributes('id'))
  })

  it('Enter 触发当前高亮条目的 run 并关闭面板', async () => {
    const w = await openAndFind()
    await inputOf(w).trigger('keydown', { key: 'ArrowDown' })
    await nextTick()
    await inputOf(w).trigger('keydown', { key: 'Enter' })
    await nextTick()

    expect(items[1]!.run).toHaveBeenCalledTimes(1)
    expect(items[0]!.run).not.toHaveBeenCalled()
    expect(overlayOf(w).exists()).toBe(false)
  })

  it('鼠标点击条目触发对应 run 并关闭面板', async () => {
    const w = await openAndFind()
    const httpRow = w.findAll('[role="option"]')[2]!
    await httpRow.trigger('click')
    await nextTick()

    expect(items[2]!.run).toHaveBeenCalledTimes(1)
    expect(overlayOf(w).exists()).toBe(false)
  })

  it('无匹配时 Enter 安全无效(不抛错、不调用任何 run)', async () => {
    const w = await openAndFind()
    await inputOf(w).setValue('zzz-no-match')
    await nextTick()
    await inputOf(w).trigger('keydown', { key: 'Enter' })
    await nextTick()
    for (const item of items) expect(item.run).not.toHaveBeenCalled()
  })

  it('Tab 在面板内圈定不逃逸(焦点停留于面板内首个可达位置)', async () => {
    const w = await openAndFind()
    await inputOf(w).trigger('keydown', { key: 'Tab' })
    await nextTick()
    const active = document.activeElement
    expect(active).not.toBe(null)
    if (active instanceof Element) {
      expect(w.element.contains(active)).toBe(true)
    }
  })
})

describe('T1c 卸载清理与防御性边界', () => {
  it('卸载后全局 Ctrl+K 监听不再生效(document keydown 已解除注册)', async () => {
    const w = await mountPalette()
    keydown({ key: 'k', ctrlKey: true })
    await nextTick()
    expect(overlayOf(w).exists()).toBe(true)
    w.unmount()

    // 卸载后派发不应有任何效果,也不应抛错
    expect(() => keydown({ key: 'k', ctrlKey: true })).not.toThrow()
    await nextTick()
    expect(document.body.textContent).not.toContain('搜索工具')
  })

  it('高亮索引在过滤结果收缩时被钳制在合法范围', async () => {
    const w = await mountPalette()
    keydown({ key: 'k', ctrlKey: true })
    await nextTick()
    // 高亮移到第 3 项后收窄到只剩 1 条,索引必须回落到 0
    await inputOf(w).trigger('keydown', { key: 'ArrowDown' })
    await inputOf(w).trigger('keydown', { key: 'ArrowDown' })
    await inputOf(w).setValue('json')
    await nextTick()
    expect(activeOptionId(w)).toBe(visibleOptions(w)[0]!.attributes('id'))
  })
})
