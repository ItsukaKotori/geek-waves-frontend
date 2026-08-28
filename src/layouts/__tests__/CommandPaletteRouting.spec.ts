// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { nextTick } from 'vue'
import MainLayout from '../MainLayout.vue'
import ToolsView from '../../views/ToolsView.vue'
import { createPinia } from 'pinia'
import { RECENT_TOOLS_STORAGE_KEY } from '../../composables/useRecentTools'

/**
 * 命令面板应用级挂载(MainLayout)集成:选中条目走与侧栏一致的导航语义 —
 * ?tool= 同步 + 最近使用同源计入;面板全局可用(非工具页亦可调起)。
 */

const wrappers: VueWrapper[] = []

async function mountAt(path: string): Promise<{ wrapper: VueWrapper; router: Router }> {
  const router = createRouter({
    history: createMemoryHistory(),
    // 扁平路由:手动挂载 MainLayout 时其内层 RouterView 处于 depth 0,
    // 若把布局自身再配到路径上会递归再渲染一层布局(测试期双重实例)。
    routes: [
      { path: '/', name: 'news', component: { template: '<div>news</div>' } },
      {
        path: '/monitor',
        name: 'monitor',
        component: {
          template: '<div><button data-test="monitor-anchor">anchor</button></div>',
        },
      },
      { path: '/tools', name: 'tools', component: ToolsView },
    ],
  })
  await router.push(path)
  await router.isReady()

  const wrapper = mount(MainLayout, {
    global: { plugins: [router, createPinia()] },
    attachTo: document.body,
  })
  wrappers.push(wrapper)
  await flushPromises()
  await waitForTool(wrapper)
  return { wrapper, router }
}

/** 异步工具组件 chunk 加载完成且工具面板渲染出标题(真实宏任务等待,有界防死挂) */
async function waitForTool(wrapper: VueWrapper): Promise<void> {
  for (let i = 0; i < 20 && wrapper.findAll('h2').length === 0; i++) {
    await new Promise((resolve) => setTimeout(resolve, 25))
    await nextTick()
  }
}

function keydown(init: KeyboardEventInit, target: EventTarget = document.body): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init }))
}

async function pickCommand(
  wrapper: VueWrapper,
  query: string,
  mode: 'enter' | 'click',
): Promise<void> {
  keydown({ key: 'k', ctrlKey: true })
  await flushPromises()
  const input = wrapper.find<HTMLInputElement>('[data-test="command-palette-input"]')
  expect(input.exists(), '命令面板应已打开').toBe(true)
  if (query !== '') {
    await input.setValue(query)
    await flushPromises()
  }
  if (mode === 'enter') {
    await input.trigger('keydown', { key: 'Enter' })
  } else {
    await wrapper.findAll('[role="option"]')[0]!.trigger('click')
  }
  await flushPromises()
  await nextTick()
  await waitForTool(wrapper)
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  while (wrappers.length) wrappers.pop()?.unmount()
})

describe('T1c 全局调起与选中后的选择语义', () => {
  it('非工具页(monitor)Ctrl+K 搜索并 Enter → 跳转 /tools?tool=radix,最近使用同源计入', async () => {
    const { wrapper, router } = await mountAt('/monitor')
    const anchor = document.querySelector('[data-test="monitor-anchor"]')
    if (!(anchor instanceof HTMLElement)) throw new Error('锚点不存在')
    anchor.focus()

    await pickCommand(wrapper, '进制', 'enter')

    expect(router.currentRoute.value.path).toBe('/tools')
    expect(router.currentRoute.value.query.tool).toBe('radix')
    expect(wrapper.find('section h2').text()).toBe('进制转换')

    // 最近使用与侧栏点击同源:?tool= 变化由 ToolsView 的 query watch 统一计入
    const stored: Array<{ key: string }> = JSON.parse(
      localStorage.getItem(RECENT_TOOLS_STORAGE_KEY) ?? '[]',
    )
    expect(stored[0]?.key).toBe('radix')
  })

  it('跨页调起用 push 保留返回路径(back 可回到来源页)', async () => {
    const { wrapper, router } = await mountAt('/monitor')
    await pickCommand(wrapper, 'jwt', 'click')
    expect(router.currentRoute.value.path).toBe('/tools')
    expect(router.currentRoute.value.query.tool).toBe('jwt')

    await router.back()
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/monitor')
  })

  it('选中当前已激活的工具不产生任何导航(replace 防抖,与侧栏一致)', async () => {
    const { wrapper, router } = await mountAt('/tools?tool=radix')
    const replaceSpy = vi.spyOn(router, 'replace')

    keydown({ key: 'k', ctrlKey: true })
    await flushPromises()
    const input = wrapper.find<HTMLInputElement>('[data-test="command-palette-input"]')
    await input.setValue('进制')
    await flushPromises()

    const options = wrapper.findAll('[role="option"]').filter((o) => o.isVisible())
    expect(options).toHaveLength(1)
    expect(options[0]!.text()).toContain('进制转换')
    await options[0]!.trigger('click')
    await flushPromises()

    expect(replaceSpy).not.toHaveBeenCalled()
    expect(router.currentRoute.value.query.tool).toBe('radix')
  })

  it('工具页未带 ?tool=(默认激活首项)时选中默认工具与侧栏一致:不产生导航,URL 不变', async () => {
    const { wrapper, router } = await mountAt('/tools')
    const replaceSpy = vi.spyOn(router, 'replace')
    const pushSpy = vi.spyOn(router, 'push')

    await pickCommand(wrapper, 'JSON', 'enter')

    expect(replaceSpy).not.toHaveBeenCalled()
    expect(pushSpy).not.toHaveBeenCalled()
    expect(router.currentRoute.value.query.tool).toBeUndefined()
    expect(wrapper.find('section h2').text()).toBe('JSON 转换')
  })

  it('工具页内切换保持侧栏的 replace 语义(不新增历史)', async () => {
    const { wrapper, router } = await mountAt('/tools')
    const pushSpy = vi.spyOn(router, 'push')
    const replaceSpy = vi.spyOn(router, 'replace')

    await pickCommand(wrapper, '时间', 'enter')
    expect(router.currentRoute.value.query.tool).toBe('ts')
    expect(replaceSpy).toHaveBeenCalledTimes(1)
    expect(pushSpy).not.toHaveBeenCalled()
  })
})
