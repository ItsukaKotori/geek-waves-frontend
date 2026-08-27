// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import { createPinia } from 'pinia'
import { RouterView } from 'vue-router'
import NotFoundView from '../../views/NotFoundView.vue'
import { router } from '../index'

/**
 * 404 兜底路由:未知深链应解析到 not-found 记录并渲染 NotFoundView,
 * 已知路由不受 catch-all 影响。
 */

/** 只挂 RouterView 的宿主组件(真实路由表 + 真实 MainLayout 布局链路) */
const Host = defineComponent({
  setup: () => () => h(RouterView),
})

/** 有界轮询:等待异步路由组件 chunk 加载并渲染出目标文案 */
async function waitForText(wrapper: ReturnType<typeof mount>, text: string): Promise<void> {
  for (let i = 0; i < 40 && !wrapper.text().includes(text); i++) {
    await new Promise((resolve) => setTimeout(resolve, 25))
    await nextTick()
  }
}

describe('404 catch-all 路由', () => {
  it('router.resolve 把未知深链解析到 not-found 且导航状态完整', () => {
    const resolved = router.resolve('/no/such/deep/link')
    expect(resolved.name).toBe('not-found')
    expect(resolved.matched.length).toBeGreaterThan(0)

    // 导航状态正常:query 与 fullPath 不因兜底匹配而丢失
    const withQuery = router.resolve('/deep/path?foo=1&bar=x')
    expect(withQuery.name).toBe('not-found')
    expect(withQuery.fullPath).toBe('/deep/path?foo=1&bar=x')
    expect(withQuery.query.foo).toBe('1')
  })

  it('已知路由不受 catch-all 影响', () => {
    expect(router.resolve('/tools').name).toBe('tools')
    expect(router.resolve('/monitor').name).toBe('monitor')
  })

  it('未知路径经真实路由渲染 NotFoundView(含 404 文案与返回首页链接)', async () => {
    await router.push('/totally/absent/page')
    await router.isReady()
    await flushPromises()

    const wrapper = mount(Host, { global: { plugins: [router, createPinia()] } })
    try {
      await waitForText(wrapper, '404')

      expect(router.currentRoute.value.name).toBe('not-found')
      expect(wrapper.text()).toContain('404')
      expect(wrapper.text()).toContain('页面不存在')

      const homeLink = wrapper.findAll('a').find((a) => a.attributes('href') === '/')
      expect(homeLink, '应存在指向首页的链接').toBeDefined()
      expect(homeLink?.classes().join(' ')).toContain('btn')
    } finally {
      wrapper.unmount()
    }
  })

  it('NotFoundView 可独立挂载且包含文案与回首页链接', () => {
    const wrapper = mount(NotFoundView, { global: { plugins: [router] } })
    try {
      expect(wrapper.text()).toContain('404')
      const links = wrapper.findAll('a')
      expect(links.some((a) => a.attributes('href') === '/')).toBe(true)
    } finally {
      wrapper.unmount()
    }
  })
})
