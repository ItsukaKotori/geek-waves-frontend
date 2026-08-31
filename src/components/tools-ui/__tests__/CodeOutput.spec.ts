// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import CodeOutput from '../CodeOutput.vue'

describe('CodeOutput 行号输出区', () => {
  it('渲染输出文本与行号', () => {
    const w = mount(CodeOutput, { props: { text: 'one\ntwo\nthree' } })
    expect(w.text()).toContain('three')
    const nums = w.findAll('[aria-hidden] > div')
    expect(nums.map((n) => n.text())).toEqual(['1', '2', '3'])
  })

  it('空输出显示引导文案,不渲染行号槽', () => {
    const w = mount(CodeOutput, { props: { text: '', emptyHint: '输入后实时出结果' } })
    expect(w.text()).toContain('输入后实时出结果')
    expect(w.findAll('[aria-hidden] > div')).toHaveLength(0)
  })
})
