// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { nextTick } from 'vue'
import ToolsView from '../ToolsView.vue'

/**
 * ToolsView 工具工作台(工具选择已聚合到主侧栏 ToolRail,本视图仅渲染面板):
 * T1b URL 记忆(?tool= 直达 / 回落默认)与 T1a KeepAlive 保活
 * (未接 useToolState 的工具切走再切回输入不丢)。
 * 点击导航语义由 ToolRail.spec 覆盖。
 */

const wrappers: VueWrapper[] = []

async function mountAt(query: Record<string, string> = {}): Promise<{ wrapper: VueWrapper; router: Router }> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/tools', name: 'tools', component: ToolsView }],
  })
  await router.push({ path: '/tools', query })
  await router.isReady()

  const wrapper = mount(ToolsView, { global: { plugins: [router] } })
  wrappers.push(wrapper)
  await waitForTool(wrapper)
  return { wrapper, router }
}

/** 异步组件 chunk 加载完成且工具面板渲染出内容(真实宏任务等待,有界防死挂)。
 *  标题由 ToolHead 同步渲染,不能充当「chunk 已就绪」信号,故以面板容器出现元素子节点为准。 */
async function waitForTool(wrapper: VueWrapper): Promise<void> {
  for (let i = 0; i < 20 && !isToolRendered(wrapper); i++) {
    await new Promise((resolve) => setTimeout(resolve, 25))
    await nextTick()
  }
}

function isToolRendered(wrapper: VueWrapper): boolean {
  const panel = wrapper.find('[data-testid="tool-panel"]')
  return panel.exists() && panel.element.children.length > 0
}

/** 工具切换走路由(生产中由 ToolRail 点击驱动,此处直达同一 query 语义) */
async function switchTo(router: Router, key: string): Promise<void> {
  await router.replace({ query: { tool: key } })
  await flushPromises()
  await nextTick()
}

/** 当前激活工具面板的标题(h2),各工具标题文案互异 */
function activeHeading(wrapper: VueWrapper): string {
  return wrapper.find('section h2').text().trim()
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  while (wrappers.length) wrappers.pop()?.unmount()
})

describe('T1b 路由 query 记忆当前工具', () => {
  it('无 query 时回默认工具(JSON 工具)', async () => {
    const { wrapper } = await mountAt({})
    expect(activeHeading(wrapper)).toBe('JSON 工具')
  })

  it('?tool=http 直达 HTTP 接口测试', async () => {
    const { wrapper } = await mountAt({ tool: 'http' })
    expect(activeHeading(wrapper)).toBe('HTTP 接口测试')
  })

  it('?tool= 未知值回落默认工具', async () => {
    const { wrapper } = await mountAt({ tool: 'nope' })
    expect(activeHeading(wrapper)).toBe('JSON 工具')
  })

  it('query 变更(ToolRail 点击的同一语义)面板同步切换', async () => {
    const { wrapper, router } = await mountAt({})
    expect(activeHeading(wrapper)).toBe('JSON 工具')

    await switchTo(router, 'radix')
    await waitForTool(wrapper)
    expect(activeHeading(wrapper)).toBe('进制转换')
  })
})

describe('T1a KeepAlive 组件实例保活', () => {
  it('未接 useToolState 的工具(hash)切走再切回输入不丢', async () => {
    const { wrapper, router } = await mountAt({})

    await switchTo(router, 'hash')
    await waitForTool(wrapper)
    const hashInput = wrapper.find('input[placeholder="输入要哈希的文本"]')
    expect(hashInput.exists()).toBe(true)
    await hashInput.setValue('persist me via keepalive')
    expect(localStorage.getItem('geekwaves-tools:hash')).toBeNull() // 排除 storage 干扰

    await switchTo(router, 'ts')
    await waitForTool(wrapper)
    expect(activeHeading(wrapper)).toBe('时间戳')

    await switchTo(router, 'hash')
    await waitForTool(wrapper)
    expect(
      (wrapper.find('input[placeholder="输入要哈希的文本"]').element as HTMLInputElement).value,
    ).toBe('persist me via keepalive')
  })

  it('已接 useToolState 的工具(b64):切走再切回经 localStorage 恢复输入', async () => {
    await mountAt({}) // 预热一轮(chunk 就绪),主流程从直达 URL 开始
    const { wrapper, router } = await mountAt({ tool: 'b64' })
    await wrapper.find('textarea').setValue('wired state demo')

    await switchTo(router, 'radix')
    await waitForTool(wrapper)
    expect(activeHeading(wrapper)).toBe('进制转换')

    await switchTo(router, 'b64')
    await waitForTool(wrapper)
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe('wired state demo')
  })
})
