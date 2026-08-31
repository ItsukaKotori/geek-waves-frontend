// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import PaneShell from '../PaneShell.vue'

describe('PaneShell 面板框架', () => {
  it('渲染标签与徽标,主体/动作/状态条插槽各就其位', () => {
    const w = mount(PaneShell, {
      props: { label: '输入', badge: 'JSON' },
      slots: {
        default: '<p data-testid="body">主体</p>',
        actions: '<button data-testid="act">清空</button>',
        footer: '<span data-testid="foot">12 字符</span>',
      },
    })
    expect(w.text()).toContain('输入')
    expect(w.text()).toContain('JSON')
    expect(w.find('[data-testid="body"]').exists()).toBe(true)
    expect(w.find('[data-testid="act"]').exists()).toBe(true)
    expect(w.find('[data-testid="foot"]').exists()).toBe(true)
  })

  it('无徽标时不渲染徽标节点;无状态条插槽时不渲染 footer', () => {
    const w = mount(PaneShell, { props: { label: '输出' }, slots: { default: '<p />' } })
    expect(w.find('.badge').exists()).toBe(false)
    expect(w.find('footer').exists()).toBe(false)
  })
})
