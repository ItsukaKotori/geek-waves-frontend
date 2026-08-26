import { describe, expect, it } from 'vitest'
import { DARK_THEME, LIGHT_THEME, resolveTheme } from '../theme'

describe('theme', () => {
  it('resolveTheme:合法存储值原样返回', () => {
    expect(resolveTheme(LIGHT_THEME)).toBe('gw-light')
    expect(resolveTheme(DARK_THEME)).toBe('gw-dark')
  })

  it('resolveTheme:非法/缺失存储值回退亮色主题', () => {
    expect(resolveTheme('light')).toBe('gw-light')
    expect(resolveTheme('black')).toBe('gw-light')
    expect(resolveTheme('')).toBe('gw-light')
    expect(resolveTheme(null)).toBe('gw-light')
    expect(resolveTheme(undefined)).toBe('gw-light')
  })
})
