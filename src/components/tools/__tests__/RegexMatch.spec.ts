// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import RegexMatch from '../RegexMatch.vue'
import type { RegexOkPayload, RegexRunOutcome } from '../regexMatchClient'
import { scanMatches, truncateInput } from '../../../tools/regexMatch'

const DEBOUNCE = 150

/**
 * Client 接缝假身:默认用纯函数层在本地同步模拟 Worker 行为(ok),
 * 个别用例切换为挂起/可控结果以驱动护栏路径。
 */
vi.mock('../regexMatchClient', () => ({
  REGEX_GUARD_TIMEOUT_MS: 1000,
  createRegexClient: () => ({
    run: (req: unknown) => fakeRun(req as RunReq),
    dispose: vi.fn(),
  }),
}))

interface RunReq {
  pattern: string
  flags: string
  text: string
}

let fakeRun: (req: RunReq) => Promise<RegexRunOutcome>

function installSyncRunner(): void {
  fakeRun = vi.fn((req: RunReq): Promise<RegexRunOutcome> => {
    try {
      const t = truncateInput(req.text)
      const scanned = scanMatches(req.pattern, req.flags, t.text)
      return Promise.resolve({
        kind: 'ok',
        payload: {
          matches: scanned.matches,
          capped: scanned.capped,
          truncated: t.truncated,
          originalLength: t.originalLength,
        },
      })
    } catch (e) {
      return Promise.resolve({ kind: 'invalid', message: (e as Error).message })
    }
  })
}

beforeEach(() => {
  localStorage.clear()
  installSyncRunner()
})

async function fill(w: ReturnType<typeof mount>, pattern: string, text: string): Promise<void> {
  await w.findAll('input').at(0)!.setValue(pattern)
  await w.find('textarea').setValue(text)
}

async function settleAll(): Promise<void> {
  await vi.advanceTimersByTimeAsync(DEBOUNCE)
  await flushPromisesAndTick()
}

async function flushPromisesAndTick(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await nextTick()
}

describe('RegexMatch 重做(FE4):核心实时壳', () => {
  it('六个 flags 开关渲染并带 tooltip 解释', () => {
    vi.useFakeTimers()
    const w = mount(RegexMatch)
    const toggles = w.findAll('[data-flag]')
    expect(toggles.map((t) => t.attributes('data-flag'))).toEqual(['g', 'i', 'm', 's', 'u', 'y'])
    for (const t of toggles) {
      expect((t.attributes('title') ?? '')).not.toBe('')
    }
    vi.useRealTimers()
  })

  it('flags 改变参与重算:i 开关后大小写不敏感命中', async () => {
    vi.useFakeTimers()
    const w = mount(RegexMatch)
    await fill(w, '[a-z]{3}', 'ABC xyz')
    await settleAll()
    expect(w.text()).toContain('共 1 处匹配')
    const iToggle = w.find('[data-flag="i"]')
    await iToggle.trigger('click')
    await settleAll()
    expect(w.text()).toContain('共 2 处匹配')
    vi.useRealTimers()
  })

  it('关闭 g 只呈现首个匹配(整体/表格/计数一致)', async () => {
    vi.useFakeTimers()
    const w = mount(RegexMatch)
    await fill(w, '\\d+', 'x11 y22 z33')
    await settleAll()
    expect(w.text()).toContain('共 3 处匹配')
    await w.find('[data-flag="g"]').trigger('click')
    await settleAll()
    expect(w.text()).toContain('共 1 处匹配')
    const rows = w.findAll('[data-testid^="match-row-"]')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.text()).toContain('11')
    vi.useRealTimers()
  })

  it('非法正则走 invalid 路径展示「正则表达式非法」', async () => {
    vi.useFakeTimers()
    const w = mount(RegexMatch)
    await fill(w, '[unclosed', 'text')
    await settleAll()
    expect(w.text()).toContain('正则表达式非法')
    vi.useRealTimers()
  })

  it('空正则立即复位空闲态,不等防抖窗口', async () => {
    vi.useFakeTimers()
    const w = mount(RegexMatch)
    await fill(w, '\\d+', 'a1 b2')
    await settleAll()
    expect(w.text()).toContain('共 2 处匹配')
    await w.findAll('input').at(0)!.setValue('')
    await nextTick()
    expect(w.text()).not.toContain('共 2 处匹配')
    vi.useRealTimers()
  })

  it('Ctrl+Enter 立即冲刷当前快照(flush 不等防抖)', async () => {
    vi.useFakeTimers()
    const w = mount(RegexMatch)
    await fill(w, '\\d+', 'a1b2')
    const runMockBefore = (fakeRun as Mock).mock.calls.length
    await w.find('.rgx-root').trigger('keydown.ctrl.enter')
    await flushPromisesAndTick()
    expect(w.text()).toContain('共 2 处匹配')
    expect((fakeRun as Mock).mock.calls.length).toBe(runMockBefore + 1)
    vi.useRealTimers()
  })
})

describe('RegexMatch 重做(FE4):替换预览 / 预设 / 护栏提示', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('预设一键填入 pattern 与建议 flags 并自动试跑', async () => {
    const w = mount(RegexMatch)
    await w.find('textarea').setValue('13800138000 hello@example.com')
    await w.find('[data-testid="preset-select"]').setValue('email')
    await settleAll()
    const patternInput = w.findAll('input').at(0)!
    expect((patternInput.element as HTMLInputElement).value).toContain('@')
    expect(w.find('[data-flag="i"]').classes()).toContain('btn-primary')
    expect(w.text()).toContain('共 1 处匹配')
  })

  it('替换预览:$n/${name} 展开、次数与复制按钮', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    const w = mount(RegexMatch)
    await fill(w, '(?<year>\\d{4})-(\\d{2})', '2026-081999-12')
    await settleAll()
    await w.findAll('input').at(1)!.setValue('[${year}]-$2-')
    await nextTick()
    expect(w.text()).toContain('[2026]-08-[1999]-12-')
    expect(w.text()).toContain('共 2 处替换')
    await w.find('[data-testid="copy-replacement"]').trigger('click')
    await flushPromisesAndTick()
    expect(writeText).toHaveBeenCalledWith('[2026]-08-[1999]-12-')
  })

  it('文本超限展示截断提示并按截断口径渲染', async () => {
    const payload: RegexOkPayload = { matches: [], capped: false, truncated: true, originalLength: 300000 }
    fakeRun = vi.fn(() => Promise.resolve<RegexRunOutcome>({ kind: 'ok', payload }))
    const w = mount(RegexMatch)
    await fill(w, 'x', 'y'.repeat(300000))
    await settleAll()
    expect(w.text()).toContain('200KB')
  })

  it('匹配数达上限展示截断提示', async () => {
    const payload: RegexOkPayload = { matches: [], capped: true, truncated: false, originalLength: 5 }
    fakeRun = vi.fn(() => Promise.resolve<RegexRunOutcome>({ kind: 'ok', payload }))
    const w = mount(RegexMatch)
    await fill(w, '.', 'aaaaa')
    await settleAll()
    expect(w.text()).toContain('10000')
  })

  it('护栏终止(catastrophic)展示灾难性回溯提示', async () => {
    fakeRun = vi.fn(() => Promise.resolve<RegexRunOutcome>({ kind: 'catastrophic' }))
    const w = mount(RegexMatch)
    await fill(w, '(a+)+$', 'x'.repeat(50))
    await settleAll()
    expect(w.text()).toContain('灾难性回溯')
    expect(w.text()).not.toContain('共 ')
  })
})

describe('RegexMatch 重做(FE4):捕获组与位置', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('表格含编号分组与命名分组列头,未参与组显示空格单元', async () => {
    const w = mount(RegexMatch)
    await fill(w, '(a)?(b)|x(?<tail>x)', 'ab b axx')
    await settleAll()
    const headerTexts = w.findAll('thead th').map((h) => h.text())
    expect(headerTexts.some((t) => t.includes('1'))).toBe(true)
    expect(headerTexts.some((t) => t.includes('2'))).toBe(true)
    expect(headerTexts.some((t) => t.includes('3') && t.includes('tail'))).toBe(true)

    const rows = w.findAll('[data-testid^="match-row-"]')
    expect(rows).toHaveLength(3)
    const groupCellsOf = (rowIdx: number) =>
      rows[rowIdx]!.findAll('[data-testid^="group-cell-"]').map((c) => c.text())
    expect(groupCellsOf(0)).toEqual(['a', 'b', ''])
    expect(groupCellsOf(1)).toEqual(['', 'b', ''])
    expect(groupCellsOf(2)).toEqual(['', '', 'x'])
  })

  it('位置列为「第 N 行 第 M 列」多行正确', async () => {
    const w = mount(RegexMatch)
    await fill(w, 'beta', 'alpha beta\nxx beta end')
    await settleAll()
    const positions = w
      .findAll('[data-testid="match-position"]')
      .map((p) => p.text())
    expect(positions[0]).toBe('第 1 行 第 7 列')
    expect(positions[1]).toBe('第 2 行 第 4 列')
  })

  it('hover 表格行联动文本区对应段(进入加高亮、离开移除)', async () => {
    const w = mount(RegexMatch)
    await fill(w, '\\d+', 'v11 w22')
    await settleAll()
    const seg = w.findAll('.rgx-seg').find((s) => s.classes().includes('rgx-seg-match'))
    expect(seg).toBeDefined()
    expect(seg!.classes()).not.toContain('rgx-active')

    const row0 = w.find('[data-testid="match-row-0"]')
    await row0.trigger('mouseenter')
    await nextTick()
    const activeSeg = w.findAll('.rgx-seg.rgx-active')
    expect(activeSeg.length).toBeGreaterThan(0)
    expect(activeSeg.every((s) => s.text().length > 0)).toBe(true)

    await row0.trigger('mouseleave')
    await nextTick()
    expect(w.findAll('.rgx-seg.rgx-active')).toHaveLength(0)
  })
})
