// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, DOMWrapper, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { nextTick } from 'vue'
import ToolRail from '../ToolRail.vue'

/**
 * ToolRail 主侧栏工具列表(MainLayout 在 /tools 路由下展开):
 * T1b rail 点击语义(replace 不堆历史 / 已激活跳过)、
 * 筛选框(命中 label/key/分组名,无匹配给出空态)。
 */

const wrappers: VueWrapper[] = []

async function mountAt(query: Record<string, string> = {}): Promise<{ wrapper: VueWrapper; router: Router }> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/tools', name: 'tools', component: { template: '<div />' } }],
  })
  await router.push({ path: '/tools', query })
  await router.isReady()

  const wrapper = mount(ToolRail, { global: { plugins: [router] } })
  wrappers.push(wrapper)
  await nextTick()
  return { wrapper, router }
}

function railButton(wrapper: VueWrapper, label: string): DOMWrapper<HTMLButtonElement> {
  const btn = wrapper.findAll('button').find((b) => b.text().trim() === label)
  if (!btn) throw new Error(`工具按钮不存在:${label}`)
  return btn
}

async function clickTool(wrapper: VueWrapper, label: string): Promise<void> {
  await railButton(wrapper, label).trigger('click')
  await flushPromises()
  await nextTick()
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  while (wrappers.length) wrappers.pop()?.unmount()
})

describe('T1b rail 点击导航语义', () => {
  it('点击未激活工具:replace 更新 ?tool=(不新增历史)', async () => {
    const { wrapper, router } = await mountAt({})
    const replaceSpy = vi.spyOn(router, 'replace')

    await clickTool(wrapper, '进制转换')

    expect(router.currentRoute.value.query.tool).toBe('radix')
    expect(replaceSpy).toHaveBeenCalledTimes(1)
  })

  it('重复点击已激活的工具不产生额外导航(replace 防抖)', async () => {
    const { wrapper, router } = await mountAt({})
    const replaceSpy = vi.spyOn(router, 'replace')

    await clickTool(wrapper, 'JSON 工具')

    expect(replaceSpy).not.toHaveBeenCalled()
    expect(router.currentRoute.value.query.tool).toBeUndefined()
  })

  it('?tool= 直达工具在 rail 内高亮(主色指示)', async () => {
    const { wrapper } = await mountAt({ tool: 'hash' })
    expect(railButton(wrapper, '哈希计算').classes()).toContain('text-primary')
    expect(railButton(wrapper, 'JSON 工具').classes()).not.toContain('text-primary')
  })
})

describe('rail 工具筛选', () => {
  async function filterFor(wrapper: VueWrapper, text: string): Promise<void> {
    await wrapper.find('input[aria-label="筛选工具"]').setValue(text)
    await nextTick()
  }

  it('按 label 命中:仅保留命中的工具与所属分组,其余分组隐藏', async () => {
    const { wrapper } = await mountAt({})

    await filterFor(wrapper, 'json')

    const labels = wrapper.findAll('button').map((b) => b.text().trim())
    expect(labels).toEqual(['JSON 工具'])
    const groupTexts = wrapper.findAll('p').map((p) => p.text().trim())
    expect(groupTexts.some((t) => t.startsWith('格式化'))).toBe(true)
    expect(groupTexts.some((t) => t.startsWith('编解码'))).toBe(false)
  })

  it('按分组名命中:整组工具可见', async () => {
    const { wrapper } = await mountAt({})

    await filterFor(wrapper, '网络')

    const labels = wrapper.findAll('button').map((b) => b.text().trim())
    expect(labels).toContain('HTTP 接口测试')
    expect(labels).toContain('CIDR/IP 子网计算')
    expect(labels).not.toContain('JSON 工具')
  })

  it('无匹配时给出空态提示', async () => {
    const { wrapper } = await mountAt({})

    await filterFor(wrapper, 'zzz')

    expect(wrapper.text()).toContain('没有匹配「zzz」的工具')
  })
})
