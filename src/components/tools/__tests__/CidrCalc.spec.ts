// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import CidrCalc from '../CidrCalc.vue'

/**
 * CIDR/IP 子网计算组件交互(实时范式:输入即算,150ms 防抖,无计算按钮):
 * 关键路径 = 默认输入出结果 / 非法输入明确报错并隐藏结果 / IPv6 形态与
 * 科学计数展示 / Ctrl+Enter 冲刷 / 输入持久化。
 */

const DEBOUNCE = 150

beforeEach(() => {
  localStorage.clear()
})

describe('CidrCalc 实时计算', () => {
  it('默认输入(/24)展示网络/广播/可用范围/主机数', async () => {
    vi.useFakeTimers()
    const w = mount(CidrCalc)
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await nextTick()
    expect(w.find('[data-testid="cidr-version"]').text()).toBe('IPv4')
    expect(w.find('[data-testid="cidr-network"]').text()).toBe('192.168.1.0')
    expect(w.find('[data-testid="cidr-broadcast"]').text()).toBe('192.168.1.255')
    expect(w.find('[data-testid="cidr-range"]').text()).toContain('192.168.1.1')
    expect(w.find('[data-testid="cidr-range"]').text()).toContain('192.168.1.254')
    expect(w.find('[data-testid="cidr-hosts"]').text()).toContain('254')
    expect(w.find('[data-testid="cidr-netmask"]').text()).toBe('255.255.255.0')
    expect(w.find('[data-testid="cidr-wildcard"]').text()).toBe('0.0.0.255')
  })

  it('非法输入明确报错并隐藏结果', async () => {
    vi.useFakeTimers()
    const w = mount(CidrCalc)
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await w.find('[data-testid="cidr-input"]').setValue('192.168.1.0/33')
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await nextTick()
    expect(w.text()).toContain('0~32')
    expect(w.find('[data-testid="cidr-network"]').exists()).toBe(false)
  })

  it('IPv6 输入展示 v6 标识:无广播/反掩码行,主机数科学计数', async () => {
    vi.useFakeTimers()
    const w = mount(CidrCalc)
    await w.find('[data-testid="cidr-input"]').setValue('2001:db8::/32')
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await nextTick()
    expect(w.find('[data-testid="cidr-version"]').text()).toBe('IPv6')
    expect(w.find('[data-testid="cidr-network"]').text()).toBe('2001:db8::')
    expect(w.find('[data-testid="cidr-broadcast"]').exists()).toBe(false)
    expect(w.find('[data-testid="cidr-wildcard"]').exists()).toBe(false)
    expect(w.find('[data-testid="cidr-hosts"]').text()).toContain('e+28')
  })

  it('/31 显示点对点口径(可用 2,范围两端即网络/广播)', async () => {
    vi.useFakeTimers()
    const w = mount(CidrCalc)
    await w.find('[data-testid="cidr-input"]').setValue('10.0.0.4/31')
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await nextTick()
    expect(w.find('[data-testid="cidr-range"]').text()).toContain('10.0.0.4')
    expect(w.find('[data-testid="cidr-range"]').text()).toContain('10.0.0.5')
    expect(w.find('[data-testid="cidr-hosts"]').text()).toContain('2')
  })

  it('Ctrl+Enter 立即冲刷计算(不等防抖)', async () => {
    vi.useFakeTimers()
    const w = mount(CidrCalc)
    await w.find('[data-testid="cidr-input"]').setValue('10.0.0.0/8')
    await w.find('[data-testid="cidr-input"]').trigger('keydown.ctrl.enter')
    await nextTick()
    expect(w.find('[data-testid="cidr-network"]').text()).toBe('10.0.0.0')
  })

  it('输入经 useToolState 持久化', async () => {
    vi.useFakeTimers()
    const w = mount(CidrCalc)
    await w.find('[data-testid="cidr-input"]').setValue('172.16.0.0/12')
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await nextTick()
    expect(localStorage.getItem('geekwaves-tools:cidr')).toContain('"172.16.0.0/12"')
  })
})
