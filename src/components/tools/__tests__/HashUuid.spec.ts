// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { webcrypto } from 'node:crypto'
import { md5 } from 'js-md5'
import HashUuid from '../HashUuid.vue'
import { hashChunks } from '../../../tools/hashUuid'
import type { WorkerLike } from '../regexMatchClient'

const DEBOUNCE = 150

/** jsdom 环境缺 WebCrypto,统一替换为 Node 实现(SHA 系列/UUID 都依赖它) */
vi.stubGlobal('crypto', webcrypto)

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const hashOutText = (w: ReturnType<typeof mount>) => {
  const pre = w.find('pre')
  return pre.exists() ? pre.text() : ''
}

describe('HashUuid 实时式交互(FE3)', () => {
  it('文本哈希 ≤150ms 内实时产出,期间无陈旧结果', async () => {
    vi.useFakeTimers()
    const w = mount(HashUuid)
    await w.findAll('select')[0].setValue('MD5')
    await w.find('input[placeholder]').setValue('GeekWaves')
    await vi.advanceTimersByTimeAsync(DEBOUNCE - 1)
    await nextTick()
    expect(hashOutText(w)).toBe('')
    await vi.advanceTimersByTimeAsync(1)
    await nextTick()
    expect(hashOutText(w)).toBe(md5('GeekWaves'))
  })

  it('不再保留「计算」按钮', () => {
    const w = mount(HashUuid)
    expect(w.findAll('button').map((b) => b.text())).not.toContain('计算')
  })

  it('连续快速输入只产出末值哈希(防抖竞态)', async () => {
    vi.useFakeTimers()
    const w = mount(HashUuid)
    await w.findAll('select')[0].setValue('MD5')
    await w.find('input[placeholder]').setValue('a')
    await w.find('input[placeholder]').setValue('ab')
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await nextTick()
    expect(hashOutText(w)).toBe(md5('ab'))
  })

  it('清空输入立即失效旧哈希', async () => {
    vi.useFakeTimers()
    const w = mount(HashUuid)
    await w.findAll('select')[0].setValue('MD5')
    await w.find('input[placeholder]').setValue('GeekWaves')
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await w.find('input[placeholder]').setValue('')
    await nextTick()
    expect(hashOutText(w)).toBe('')
  })

  it('Ctrl+Enter 立即冲刷哈希计算(不等防抖)', async () => {
    vi.useFakeTimers()
    const w = mount(HashUuid)
    await w.findAll('select')[0].setValue('MD5')
    await w.find('input[placeholder]').setValue('GeekWaves')
    await w.find('input[placeholder]').trigger('keydown.ctrl.enter')
    await nextTick()
    expect(hashOutText(w)).toBe(md5('GeekWaves'))
  })

  it('UUID 生成保留显式「生成」按钮并可用(webcrypto stub)', async () => {
    const w = mount(HashUuid)
    const genBtn = w.findAll('button').find((b) => b.text() === '生成')
    expect(genBtn).toBeTruthy()
    await genBtn!.trigger('click')
    await nextTick()
    const text = w.findAll('pre').map((p) => p.text()).join('\n')
    expect(text).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/m)
  })
})

/** 测试假 Worker:收到 hash-file 请求后在同进程内用真实纯函数计算并回包 */
class FakeHashWorker implements WorkerLike {
  onmessage: ((ev: { data: unknown }) => void) | null = null
  onerror: ((ev: unknown) => void) | null = null
  terminated = false

  postMessage(msg: unknown): void {
    const { id, file } = msg as { id: number; file: File }
    void Promise.resolve().then(async () => {
      if (this.terminated) return
      try {
        const bytes = new Uint8Array(await file.arrayBuffer())
        this.onmessage?.({ data: { id, ok: true, digests: await hashChunks([bytes]) } })
      } catch (e) {
        this.onmessage?.({ data: { id, ok: false, message: (e as Error).message } })
      }
    })
  }

  terminate(): void {
    this.terminated = true
  }
}

describe('HashUuid FE5 功能补全', () => {
  it('文件拖拽哈希:一次投递四算法并列展示(经注入 Worker 缝)', async () => {
    const factory = vi.fn(() => new FakeHashWorker())
    const w = mount(HashUuid, { props: { workerFactory: factory } })
    const file = new File(['GeekWaves'], 'gw.txt')
    await w.find('.dropzone').trigger('drop', { dataTransfer: { files: [file] } })
    await vi.waitFor(() => {
      expect(w.find('[data-algo="MD5"]').exists()).toBe(true)
    })
    const rows = w.findAll('[data-algo]').map((r) => ({
      algo: r.attributes('data-algo'),
      text: r.text(),
    }))
    expect(rows.map((r) => r.algo)).toEqual(['MD5', 'SHA-1', 'SHA-256', 'SHA-512'])
    const md5Row = rows.find((r) => r.algo === 'MD5')!
    expect(md5Row.text).toContain(md5('GeekWaves'))
    // 文件名与大小信息可见
    expect(w.text()).toContain('gw.txt')
    expect(w.text()).toContain('9 字节')
  })

  it('大写开关即时作用于已产出哈希(无重算延迟)', async () => {
    const w = mount(HashUuid, { props: { workerFactory: () => new FakeHashWorker() } })
    const file = new File(['GeekWaves'], 'gw.txt')
    await w.find('.dropzone').trigger('drop', { dataTransfer: { files: [file] } })
    await vi.waitFor(() => {
      expect(w.text()).toContain(md5('GeekWaves'))
    })
    const upperToggle = w.findAll('input[type="checkbox"]')[0]
    await upperToggle.setValue(true)
    await nextTick()
    expect(w.text()).toContain(md5('GeekWaves').toUpperCase())
  })

  it('去横线选项让 UUID 输出为连续 32 位十六进制', async () => {
    vi.stubGlobal('crypto', webcrypto)
    const w = mount(HashUuid)
    const stripDash = w.findAll('input[type="checkbox"]')[1]
    await stripDash.setValue(true)
    await w.findAll('button').find((b) => b.text() === '生成')!.trigger('click')
    await nextTick()
    const text = w.find('pre').text()
    expect(text).toMatch(/^[0-9A-Fa-f]{32}$/m)
    expect(text).not.toContain('-')
  })

  it('UUID v7 可选生成且格式正确', async () => {
    vi.stubGlobal('crypto', webcrypto)
    const w = mount(HashUuid)
    await w.findAll('select')[1].setValue('v7')
    await w.findAll('button').find((b) => b.text() === '生成')!.trigger('click')
    await nextTick()
    const text = w.find('pre').text()
    expect(text).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/m)
  })

  it('文本哈希支持 SHA3 算法项', async () => {
    vi.useFakeTimers()
    const w = mount(HashUuid)
    const options = w.findAll('select')[0].findAll('option').map((o) => o.element.value)
    expect(options).toContain('SHA3-256')
    expect(options).toContain('SHA3-512')
    vi.useRealTimers()
  })
})
