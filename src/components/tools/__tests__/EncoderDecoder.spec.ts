// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import EncoderDecoder from '../EncoderDecoder.vue'
import { base64Encode } from '../../../tools/encodeDecode'

const DEBOUNCE = 150

/** 输出区:第一个 pre 为编码结果,第二个为解码结果 */
const pres = (w: ReturnType<typeof mount>) => {
  return w.findAll('pre').map((p) => p.text())
}

beforeEach(() => {
  localStorage.clear()
})

describe('EncoderDecoder 实时式交互(FE3)', () => {
  it('输入变化后 ≤150ms 内编码结果更新,期间无陈旧/抢先结果', async () => {
    vi.useFakeTimers()
    const w = mount(EncoderDecoder)
    await w.find('textarea').setValue('GeekWaves')
    await vi.advanceTimersByTimeAsync(DEBOUNCE - 1)
    await nextTick()
    expect(pres(w)).toEqual([])
    await vi.advanceTimersByTimeAsync(1)
    await nextTick()
    expect(pres(w)[0]).toBe(base64Encode('GeekWaves'))
    // 输入清空 → 旧结果立即失效
    await w.find('textarea').setValue('')
    await nextTick()
    expect(pres(w)).toEqual([])
  })

  it('双向同时实时产出:合法 Base64 即时解出明文', async () => {
    vi.useFakeTimers()
    const w = mount(EncoderDecoder)
    await w.find('textarea').setValue(base64Encode('GeekWaves'))
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await nextTick()
    expect(pres(w)[1]).toBe('GeekWaves')
  })

  it('非法 Base64 在解码面板给出行内错误而非陈旧明文', async () => {
    vi.useFakeTimers()
    const w = mount(EncoderDecoder)
    await w.find('textarea').setValue('!!!')
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await nextTick()
    expect(w.text()).toContain('Invalid base64')
  })

  it('不再保留「编码 / 解码」等计算按钮,仅余复制类按钮', () => {
    const w = mount(EncoderDecoder)
    const labels = w.findAll('button').map((b) => b.text())
    expect(labels.filter((t) => ['编码', '解码', '计算'].includes(t))).toEqual([])
  })

  it('URL 模式同样实时:', async () => {
    vi.useFakeTimers()
    const w = mount(EncoderDecoder)
    const urlTab = w.findAll('button').find((b) => b.classes().includes('tab') && b.text() === 'URL')
    await urlTab!.trigger('click')
    await w.find('textarea').setValue('a b&c')
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await nextTick()
    expect(pres(w)[0]).toBe(encodeURIComponent('a b&c'))
  })

  it('Ctrl+Enter 立即冲刷计算(不等防抖)', async () => {
    vi.useFakeTimers()
    const w = mount(EncoderDecoder)
    await w.find('textarea').setValue('GeekWaves')
    await w.find('textarea').trigger('keydown.ctrl.enter')
    await nextTick()
    expect(pres(w)[0]).toBe(base64Encode('GeekWaves'))
  })
})

describe('EncoderDecoder FE5 功能补全', () => {
  const hexTab = (w: ReturnType<typeof mount>) =>
    w.findAll('button').find((b) => b.classes().includes('tab') && b.text() === 'Hex')!

  it('Hex 模式:编码得到 UTF-8 小写 hex 向量', async () => {
    vi.useFakeTimers()
    const w = mount(EncoderDecoder)
    await hexTab(w).trigger('click')
    await w.find('textarea').setValue('hello')
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await nextTick()
    expect(pres(w)[0]).toBe('68656c6c6f')
    vi.useRealTimers()
  })

  it('Hex 模式:解码容忍分隔符与大小写,输出明文', async () => {
    vi.useFakeTimers()
    const w = mount(EncoderDecoder)
    await hexTab(w).trigger('click')
    await w.find('textarea').setValue('e4:bd:a0 e5A5BD')
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await nextTick()
    expect(pres(w)[1]).toBe('你好')
    vi.useRealTimers()
  })

  it('Hex 模式:奇数长度给行内错误而非静默截断', async () => {
    vi.useFakeTimers()
    const w = mount(EncoderDecoder)
    await hexTab(w).trigger('click')
    await w.find('textarea').setValue('abc')
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await nextTick()
    expect(w.text()).toContain('Invalid hex')
    vi.useRealTimers()
  })

  it('Base64 模式遇到非法 UTF-8 字节流提示「疑似编码不符」而非乱码', async () => {
    vi.useFakeTimers()
    const w = mount(EncoderDecoder)
    // [0xe4,0xbd] 为被截断的多字节序列:'5Ls='
    await w.find('textarea').setValue('5Ls=')
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await nextTick()
    expect(w.text()).toContain('疑似编码不符')
    vi.useRealTimers()
  })

  it('dataURL 输入出现图片预览卡:mime/尺寸/大小信息', async () => {
    vi.useFakeTimers()
    const raw = new Uint8Array([
      ...[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
      0, 0, 0, 13,
      ...new TextEncoder().encode('IHDR'),
      ...[0, 0, 0, 7], // width = 7
      ...[0, 0, 0, 9], // height = 9
      8, 6, 0, 0, 0,
    ])
    const url = `data:image/png;base64,${Buffer.from(raw).toString('base64')}`
    const w = mount(EncoderDecoder)
    await w.find('textarea').setValue(url)
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await nextTick()
    const img = w.find('.image-preview img')
    expect(img.exists()).toBe(true)
    expect(img.attributes('src')).toBe(url)
    const text = w.text()
    expect(text).toContain('image/png')
    expect(text).toContain('7 × 9')
    expect(text).toContain('字节')
    vi.useRealTimers()
  })
})

describe('图片文件 → dataURL(拖拽/选择回填)', () => {
  const pngFile = () => {
    const raw = new Uint8Array([
      ...[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
      0, 0, 0, 13,
      ...new TextEncoder().encode('IHDR'),
      ...[0, 0, 0, 7],
      ...[0, 0, 0, 9],
      8, 6, 0, 0, 0,
    ])
    return new File([raw], 'dot.png', { type: 'image/png' })
  }

  it('仅 Base64 模式显示上传区(URL/Hex 不显示)', async () => {
    const w = mount(EncoderDecoder)
    expect(w.find('.dropzone').exists()).toBe(true)
    await w.findAll('button').find((b) => b.text() === 'URL')!.trigger('click')
    await nextTick()
    expect(w.find('.dropzone').exists()).toBe(false)
    await w.findAll('button').find((b) => b.text() === 'Hex')!.trigger('click')
    await nextTick()
    expect(w.find('.dropzone').exists()).toBe(false)
  })

  it('拖入图片:输入回填 dataURL,防抖后出现预览卡与文件信息', async () => {
    const w = mount(EncoderDecoder)
    await w.find('.dropzone').trigger('drop', { dataTransfer: { files: [pngFile()] } })
    await vi.waitFor(() => {
      expect(w.find('textarea').element.value).toMatch(/^data:image\/png;base64,/)
    })
    await vi.waitFor(() => {
      expect(w.find('.image-preview img').exists()).toBe(true)
    })
    expect(w.find('.image-preview').text()).toContain('7 × 9')
    expect(w.text()).toContain('dot.png')
  })

  it('非图片文件给行内错误,输入不被改写', async () => {
    const w = mount(EncoderDecoder)
    await w.find('textarea').setValue('已有内容')
    const txt = new File([new Uint8Array([1, 2, 3])], 'a.txt', { type: 'text/plain' })
    await w.find('.dropzone').trigger('drop', { dataTransfer: { files: [txt] } })
    await vi.waitFor(() => {
      expect(w.text()).toContain('仅支持图片')
    })
    expect(w.find('textarea').element.value).toBe('已有内容')
  })

  it('上传成功后提供「复制 dataURL」按钮', async () => {
    const w = mount(EncoderDecoder)
    await w.find('.dropzone').trigger('drop', { dataTransfer: { files: [pngFile()] } })
    await vi.waitFor(() => {
      expect(w.find('textarea').element.value).toMatch(/^data:image\/png;base64,/)
    })
    expect(w.findAll('button').some((b) => b.text().includes('复制 dataURL'))).toBe(true)
  })
})
