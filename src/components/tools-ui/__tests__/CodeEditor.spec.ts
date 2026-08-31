// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import CodeEditor from '../CodeEditor.vue'

describe('CodeEditor 行号编辑器', () => {
  it('空值渲染单行行号;多行值按行数渲染行号', async () => {
    const w = mount(CodeEditor, { props: { modelValue: '' } })
    let nums = w.findAll('[aria-hidden] > div')
    expect(nums).toHaveLength(1)

    await w.setProps({ modelValue: 'a\nb\nc' })
    nums = w.findAll('[aria-hidden] > div')
    expect(nums.map((n) => n.text())).toEqual(['1', '2', '3'])
  })

  it('输入事件透传 update:modelValue,placeholder 透传', async () => {
    const w = mount(CodeEditor, { props: { modelValue: '', placeholder: '请输入' } })
    expect(w.find('textarea').attributes('placeholder')).toBe('请输入')
    await w.find('textarea').setValue('hello')
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual(['hello'])
  })

  it('testid 落在 textarea 上(测试定位契约)', () => {
    const w = mount(CodeEditor, { props: { modelValue: '', testid: 'md-input' } })
    expect(w.find('textarea[data-testid="md-input"]').exists()).toBe(true)
  })
})
