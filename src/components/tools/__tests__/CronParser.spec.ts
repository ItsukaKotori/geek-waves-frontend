// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import CronParser from '../CronParser.vue'

/**
 * crontab 解析组件交互(实时范式:输入即解析,150ms 防抖,无计算按钮):
 * 关键路径 = 中文描述实时更新 / 未来 5 次运行时间 / 非法表达式明确报错 /
 * 支持范围提示 / Ctrl+Enter 冲刷。
 */

const DEBOUNCE = 150

beforeEach(() => {
  localStorage.clear()
})

describe('CronParser 实时解析', () => {
  it('默认表达式出中文描述与 5 次运行时间', async () => {
    vi.useFakeTimers()
    const w = mount(CronParser)
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await nextTick()
    expect(w.find('[data-testid="cron-description"]').text()).toBe('每隔 5 分钟')
    const runs = w.findAll('[data-testid="cron-next-runs"] li')
    expect(runs).toHaveLength(5)
  })

  it('输入变化实时更新描述(防抖窗口内不抢先)', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 0, 15, 10, 3, 0))
    const w = mount(CronParser)
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await w.find('[data-testid="cron-expr"]').setValue('30 8 * * 1-5')
    await vi.advanceTimersByTimeAsync(DEBOUNCE - 1)
    expect(w.find('[data-testid="cron-description"]').text()).toBe('每隔 5 分钟')
    await vi.advanceTimersByTimeAsync(1)
    await nextTick()
    expect(w.find('[data-testid="cron-description"]').text()).toBe('每周一至周五 08:30')
  })

  it('未来 5 次运行时间逐次递推(月末边界)', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 0, 31, 12, 0, 0))
    const w = mount(CronParser)
    await w.find('[data-testid="cron-expr"]').setValue('0 0 1 * *')
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await nextTick()
    const runs = w.findAll('[data-testid="cron-next-runs"] li').map((li) => li.text())
    expect(runs).toEqual([
      '2026-02-01 00:00 周日',
      '2026-03-01 00:00 周日',
      '2026-04-01 00:00 周三',
      '2026-05-01 00:00 周五',
      '2026-06-01 00:00 周一',
    ])
  })

  it('非法表达式明确报错(段数/越界)', async () => {
    vi.useFakeTimers()
    const w = mount(CronParser)
    const input = w.find('[data-testid="cron-expr"]')
    await input.setValue('* * * *')
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await nextTick()
    expect(w.text()).toContain('5 段')
    await input.setValue('61 * * * *')
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await nextTick()
    expect(w.text()).toContain('超出范围')
  })

  it('展示支持范围声明(标准 5 段,不含宏/秒级)', () => {
    const w = mount(CronParser)
    expect(w.text()).toContain('标准 5 段')
    expect(w.text()).toContain('@')
  })

  it('Ctrl+Enter 立即冲刷解析(不等防抖)', async () => {
    vi.useFakeTimers()
    const w = mount(CronParser)
    await w.find('[data-testid="cron-expr"]').setValue('0 0 1 * *')
    await w.find('[data-testid="cron-expr"]').trigger('keydown.ctrl.enter')
    await nextTick()
    expect(w.find('[data-testid="cron-description"]').text()).toBe('每月 1 日 00:00')
  })
})
