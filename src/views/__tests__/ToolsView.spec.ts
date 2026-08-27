// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { nextTick } from 'vue'
import ToolsView from '../ToolsView.vue'

/**
 * ToolsView 工具中心:T1b URL 记忆(?tool= 直达 / 回落默认 / 点击同步)
 * 与 T1a KeepAlive 保活(未接 useToolState 的工具切走再切回输入不丢)。
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

/** 异步组件 chunk 加载完成且工具面板渲染出标题(真实宏任务等待,有界防死挂) */
async function waitForTool(wrapper: VueWrapper): Promise<void> {
  for (let i = 0; i < 20 && wrapper.findAll('h2').length === 0; i++) {
    await new Promise((resolve) => setTimeout(resolve, 25))
    await nextTick()
  }
}

function navButton(wrapper: VueWrapper, label: string) {
  const btn = wrapper.findAll('button').find((b) => b.text().trim() === label)
  if (!btn) throw new Error(`侧栏按钮不存在:${label}`)
  return btn
}

async function switchTo(wrapper: VueWrapper, label: string): Promise<void> {
  await navButton(wrapper, label).trigger('click')
  await flushPromises()
  await nextTick()
  await waitForTool(wrapper)
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
  it('无 query 时回默认工具(JSON 转换)', async () => {
    const { wrapper } = await mountAt({})
    expect(activeHeading(wrapper)).toBe('JSON 转换')
  })

  it('?tool=http 直达 HTTP 接口测试', async () => {
    const { wrapper } = await mountAt({ tool: 'http' })
    expect(activeHeading(wrapper)).toBe('HTTP 接口测试')
  })

  it('?tool= 未知值回落默认工具', async () => {
    const { wrapper } = await mountAt({ tool: 'nope' })
    expect(activeHeading(wrapper)).toBe('JSON 转换')
  })

  it('点击切换工具:面板与 query 同步更新且使用 replace(不新增历史)', async () => {
    const { wrapper, router } = await mountAt({})
    expect(activeHeading(wrapper)).toBe('JSON 转换')

    const replaceSpy = vi.spyOn(router, 'replace')

    await switchTo(wrapper, '进制转换')
    expect(activeHeading(wrapper)).toBe('进制转换')
    expect(router.currentRoute.value.query.tool).toBe('radix')
    expect(replaceSpy).toHaveBeenCalledTimes(1)
  })

  it('重复点击已激活的工具不产生额外导航(replace 防抖)', async () => {
    const { wrapper, router } = await mountAt({})
    const replaceSpy = vi.spyOn(router, 'replace')

    await navButton(wrapper, 'JSON 转换').trigger('click')
    await flushPromises()

    expect(replaceSpy).not.toHaveBeenCalled()
    expect(router.currentRoute.value.query.tool).toBeUndefined()
  })
})

describe('T1a KeepAlive 组件实例保活', () => {
  it('未接 useToolState 的工具(hash)切走再切回输入不丢', async () => {
    const { wrapper } = await mountAt({})

    await switchTo(wrapper, '哈希计算')
    const hashInput = wrapper.find('input[placeholder="输入要哈希的文本"]')
    expect(hashInput.exists()).toBe(true)
    await hashInput.setValue('persist me via keepalive')
    expect(localStorage.getItem('geekwaves-tools:hash')).toBeNull() // 排除 storage 干扰

    await switchTo(wrapper, '时间戳')
    expect(activeHeading(wrapper)).toBe('时间戳')

    await switchTo(wrapper, '哈希计算')
    expect(
      (wrapper.find('input[placeholder="输入要哈希的文本"]').element as HTMLInputElement).value,
    ).toBe('persist me via keepalive')
  })

  it('已接 useToolState 的工具(b64):切走再切回经 localStorage 恢复输入', async () => {
    await mountAt({}) // 预热一轮(chunk 就绪),主流程从直达 URL 开始
    const { wrapper } = await mountAt({ tool: 'b64' })
    await wrapper.find('textarea').setValue('wired state demo')

    await switchTo(wrapper, '进制转换')
    expect(activeHeading(wrapper)).toBe('进制转换')

    await switchTo(wrapper, 'Base64/URL')
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe('wired state demo')
  })
})
