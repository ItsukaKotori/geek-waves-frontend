// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ErrorBanner from '../ErrorBanner.vue'

/**
 * ErrorBanner:纯展示错误横幅(DaisyUI alert 体系),关闭只向上抛事件,
 * 不自行隐藏 —— 可见性由父组件(状态持有方)控制。
 */

function mountBanner(props: Record<string, unknown> = {}) {
  return mount(ErrorBanner, {
    props: { message: '出错了:无法解析输入', ...props },
  })
}

describe('ErrorBanner 渲染', () => {
  it('以 alert 语义渲染消息文本', () => {
    const w = mountBanner()
    expect(w.find('[role="alert"]').exists()).toBe(true)
    expect(w.text()).toContain('出错了:无法解析输入')
  })

  it('默认 error 变体(alert-error)', () => {
    const w = mountBanner()
    expect(w.find('[role="alert"]').classes()).toEqual(
      expect.arrayContaining(['alert', 'alert-error']),
    )
    expect(w.find('[role="alert"]').classes()).not.toContain('alert-warning')
  })

  it.each(['warning', 'info', 'success'] as const)('%s 变体切换对应 alert 色', (variant) => {
    const w = mountBanner({ variant })
    expect(w.find('[role="alert"]').classes()).toContain(`alert-${variant}`)
  })

  it('非 dismissible 时不渲染关闭按钮', () => {
    const w = mountBanner()
    expect(w.find('button').exists()).toBe(false)
  })
})

describe('ErrorBanner 关闭事件', () => {
  it('dismissible 时渲染关闭按钮,点击仅向上 emit close(不自行消失)', async () => {
    const w = mountBanner({ dismissible: true })
    const closeButton = w.find('button[aria-label="关闭"]')
    expect(closeButton.exists()).toBe(true)

    await closeButton.trigger('click')

    expect(w.emitted('close')).toHaveLength(1)
    // 纯展示契约:横幅仍挂载,何时移除由父级决定
    expect(w.find('[role="alert"]').exists()).toBe(true)
  })

  it('默认不可关闭且从不触发 close', async () => {
    const w = mountBanner()
    expect(w.emitted('close')).toBeUndefined()
  })
})
