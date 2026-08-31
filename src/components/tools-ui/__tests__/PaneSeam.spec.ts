// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import PaneSeam from '../PaneSeam.vue'

describe('PaneSeam 双栏中缝', () => {
  it('swap 按钮点击触发 swap 事件,title 提供可访问名', async () => {
    const w = mount(PaneSeam, { props: { swap: true, swapTitle: '结果作为输入' } })
    const btn = w.find('button')
    expect(btn.attributes('aria-label')).toBe('结果作为输入')
    await btn.trigger('click')
    expect(w.emitted('swap')).toHaveLength(1)
  })

  it('未开启 swap / 未给 direction 时不渲染对应元素', () => {
    const w = mount(PaneSeam, { props: { direction: 'lr' } })
    expect(w.find('button').exists()).toBe(false)
    expect(w.text()).toContain('→')
  })
})
