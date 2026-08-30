// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import PasswordGenerator from '../PasswordGenerator.vue'
import { PASSWORD_CHARSETS } from '../../../tools/passwordGen'

/**
 * 密码/Token 生成器组件交互(生成为显式动作,参数变化自动重生成 —— 报告已声明):
 * 关键路径 = 挂载即出默认结果 / 长度滑杆联动 / 批量生成 / 字符集全关报错 /
 * 排除易混淆字符生效 / 复制按钮存在。随机源走真实 Web Crypto(jsdom/node 均内置)。
 */

const DEFAULT_POOL =
  PASSWORD_CHARSETS.lower +
  PASSWORD_CHARSETS.upper +
  PASSWORD_CHARSETS.digits +
  PASSWORD_CHARSETS.symbols

beforeEach(() => {
  localStorage.clear()
})

async function settle(): Promise<void> {
  await nextTick()
  await nextTick()
}

describe('PasswordGenerator 交互', () => {
  it('挂载即按默认参数自动生成(长度 16,字符域合规)', async () => {
    const w = mount(PasswordGenerator)
    await settle()
    const rows = w.findAll('[data-testid="pwd-results"] li')
    expect(rows.length).toBeGreaterThanOrEqual(1)
    for (const row of rows) {
      const pwd = row.find('code').text()
      expect(pwd).toHaveLength(16)
      for (const c of pwd) expect(DEFAULT_POOL).toContain(c)
    }
  })

  it('长度滑杆变化自动重生成(16 → 32)', async () => {
    const w = mount(PasswordGenerator)
    await settle()
    await w.find('[data-testid="pwd-length"]').setValue('32')
    await settle()
    const rows = w.findAll('[data-testid="pwd-results"] li')
    for (const row of rows) expect(row.find('code').text()).toHaveLength(32)
  })

  it('批量生成:批量数 5 → 5 条;显式「生成」按钮再生成', async () => {
    const w = mount(PasswordGenerator)
    await settle()
    await w.find('[data-testid="pwd-batch"]').setValue('5')
    await settle()
    expect(w.findAll('[data-testid="pwd-results"] li')).toHaveLength(5)
    // 显式动作:点击生成再出一批(仍 5 条且合规)
    await w.find('[data-testid="pwd-generate"]').trigger('click')
    await settle()
    expect(w.findAll('[data-testid="pwd-results"] li')).toHaveLength(5)
  })

  it('全部字符集关闭:明确报错并清空结果', async () => {
    const w = mount(PasswordGenerator)
    await settle()
    for (const key of ['lower', 'upper', 'digits', 'symbols']) {
      await w.find(`[data-testid="pwd-charset-${key}"]`).setValue(false)
    }
    await settle()
    expect(w.text()).toContain('至少选择一个字符集')
    expect(w.find('[data-testid="pwd-results"]').exists()).toBe(false)
  })

  it('排除易混淆字符生效(数字-only 长串无 0/1)', async () => {
    const w = mount(PasswordGenerator)
    await settle()
    await w.find('[data-testid="pwd-charset-lower"]').setValue(false)
    await w.find('[data-testid="pwd-charset-upper"]').setValue(false)
    await w.find('[data-testid="pwd-charset-symbols"]').setValue(false)
    await w.find('[data-testid="pwd-exclude"]').setValue(true)
    await w.find('[data-testid="pwd-length"]').setValue('64')
    await settle()
    const pwd = w.find('[data-testid="pwd-results"] li code').text()
    expect(pwd).toHaveLength(64)
    expect(pwd).not.toContain('0')
    expect(pwd).not.toContain('1')
  })

  it('熵估算随长度变化展示', async () => {
    const w = mount(PasswordGenerator)
    await settle()
    // 默认排除易混淆字符 → 池 84 字符 × 16 位 ≈ 102.3 bit → 极强
    expect(w.find('[data-testid="pwd-strength"]').text()).toContain('102.3')
    expect(w.find('[data-testid="pwd-strength"]').text()).toContain('极强')
    await w.find('[data-testid="pwd-length"]').setValue('8')
    await settle()
    expect(w.find('[data-testid="pwd-strength"]').text()).toContain('51.1')
  })

  it('逐条复制与全部复制按钮存在', async () => {
    const w = mount(PasswordGenerator)
    await settle()
    expect(w.find('[data-testid="pwd-copy-all"]').exists()).toBe(true)
    expect(w.find('[data-testid="pwd-results"] li button').exists()).toBe(true)
  })

  it('结果不写入 localStorage(敏感数据不落盘),参数变更后选项持久化', async () => {
    const w = mount(PasswordGenerator)
    await settle()
    await w.find('[data-testid="pwd-length"]').setValue('20')
    await settle()
    const snapshot = localStorage.getItem('geekwaves-tools:pwd') ?? ''
    expect(snapshot).not.toContain('"results"')
    expect(snapshot).toContain('"length":20')
    // 已生成的密码不出现在持久化快照中
    expect(snapshot).not.toContain(w.find('[data-testid="pwd-results"] li code').text())
  })
})
