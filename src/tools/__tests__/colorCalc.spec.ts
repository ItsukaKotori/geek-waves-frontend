// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  contrastRatio,
  formatHex,
  formatHsl,
  formatRgb,
  hslToHex,
  hslToRgb,
  parseHex,
  parseHsl,
  parseRgb,
  rgbToHex,
  rgbToHsl,
  wcagGrades,
  wcagRatio,
  type Rgb,
} from '../colorCalc'

/**
 * 颜色工具纯函数层:HEX/RGB/HSL 三格式互转 + WCAG 对比度。
 * 口径声明:
 * - RGB 分量恒为 0~255 整数;解析输入出现小数时四舍五入到整数,越界报错。
 * - HSL 输出 h∈[0,360)(环绕归一)、s/l∈[0,100],保留 1 位小数;往返误差 ≤ ±1/通道。
 * - WCAG 2.x 相对亮度与对比度公式;对比度比值四舍五入到 2 位小数(半入)
 *   后再判级(AA 正常 ≥4.5 / AAA 正常 ≥7 / AA 大文本 ≥3 / AAA 大文本 ≥4.5)。
 */

const BLACK: Rgb = { r: 0, g: 0, b: 0 }
const WHITE: Rgb = { r: 255, g: 255, b: 255 }

describe('HEX 解析与格式化', () => {
  it('#rgb 缩写展开', () => {
    expect(parseHex('#abc')).toEqual({ r: 170, g: 187, b: 204 })
  })

  it('#rrggbb 大小写不敏感', () => {
    expect(parseHex('#ABCDEF')).toEqual({ r: 171, g: 205, b: 239 })
    expect(parseHex('abcdef')).toEqual({ r: 171, g: 205, b: 239 })
  })

  it('非法 HEX 逐类明确报错', () => {
    expect(() => parseHex('')).toThrow(/输入为空/)
    expect(() => parseHex('#12')).toThrow(/3 或 6/)
    expect(() => parseHex('#12345')).toThrow(/3 或 6/)
    expect(() => parseHex('#1234567')).toThrow(/3 或 6/)
    expect(() => parseHex('zzzzzz')).toThrow(/十六进制/)
    expect(() => parseHex('#12345g')).toThrow(/十六进制/)
  })

  it('formatHex 输出小写 #rrggbb', () => {
    expect(formatHex({ r: 0, g: 0, b: 0 })).toBe('#000000')
    expect(formatHex(parseHex('#ABC'))).toBe('#aabbcc')
  })
})

describe('RGB 解析与格式化', () => {
  it('rgb() 函数式 / 逗号式 / 空格式均可解析', () => {
    expect(parseRgb('rgb(255, 0, 0)')).toEqual({ r: 255, g: 0, b: 0 })
    expect(parseRgb('0, 128, 255')).toEqual({ r: 0, g: 128, b: 255 })
    expect(parseRgb('rgb(16 32 48)')).toEqual({ r: 16, g: 32, b: 48 })
  })

  it('小数四舍五入到整数(口径声明)', () => {
    expect(parseRgb('rgb(127.4, 127.5, 0)')).toEqual({ r: 127, g: 128, b: 0 })
  })

  it('非法 RGB 逐类明确报错', () => {
    expect(() => parseRgb('rgb(256, 0, 0)')).toThrow(/0~255/)
    expect(() => parseRgb('rgb(-1, 0, 0)')).toThrow(/0~255/)
    expect(() => parseRgb('rgb(1, 2)')).toThrow(/3 个/)
    expect(() => parseRgb('rgb(a, b, c)')).toThrow(/数字/)
    expect(() => parseRgb('')).toThrow(/输入为空/)
  })

  it('formatRgb 输出规范空格形态', () => {
    expect(formatRgb({ r: 51, g: 102, b: 153 })).toBe('rgb(51, 102, 153)')
  })
})

describe('HSL 解析与格式化', () => {
  it('hsl() 函数式(含 %)/ 逗号式 / 空格式均可解析', () => {
    expect(parseHsl('hsl(210, 50%, 40%)')).toEqual({ h: 210, s: 50, l: 40 })
    expect(parseHsl('210, 50, 40')).toEqual({ h: 210, s: 50, l: 40 })
    expect(parseHsl('hsl(210 50% 40%)')).toEqual({ h: 210, s: 50, l: 40 })
  })

  it('色相环绕:h 归一到 [0,360)', () => {
    expect(parseHsl('hsl(360, 0%, 50%)')).toEqual({ h: 0, s: 0, l: 50 })
    expect(parseHsl('hsl(-90, 50%, 50%)')).toEqual({ h: 270, s: 50, l: 50 })
    expect(parseHsl('hsl(810, 0%, 50%)')).toEqual({ h: 90, s: 0, l: 50 })
  })

  it('非法 HSL 逐类明确报错', () => {
    expect(() => parseHsl('hsl(0, 101%, 0%)')).toThrow(/0~100/)
    expect(() => parseHsl('hsl(0, -5%, 50%)')).toThrow(/0~100/)
    expect(() => parseHsl('hsl(0, 50%)')).toThrow(/3 个/)
    expect(() => parseHsl('hsl(x, y, z)')).toThrow(/数字/)
  })

  it('formatHsl 输出规范形态', () => {
    expect(formatHsl({ h: 210, s: 50, l: 40 })).toBe('hsl(210, 50%, 40%)')
    expect(formatHsl({ h: 12.3, s: 4.5, l: 0 })).toBe('hsl(12.3, 4.5%, 0%)')
  })
})

describe('RGB ↔ HSL 互转与往返', () => {
  it('典型颜色精确映射', () => {
    expect(rgbToHsl({ r: 255, g: 0, b: 0 })).toEqual({ h: 0, s: 100, l: 50 })
    expect(rgbToHsl({ r: 51, g: 102, b: 153 })).toEqual({ h: 210, s: 50, l: 40 })
    expect(rgbToHsl(BLACK)).toEqual({ h: 0, s: 0, l: 0 })
    expect(rgbToHsl(WHITE)).toEqual({ h: 0, s: 0, l: 100 })
    expect(rgbToHsl({ r: 255, g: 0, b: 255 })).toEqual({ h: 300, s: 100, l: 50 })
  })

  it('hslToRgb 典型颜色精确还原', () => {
    expect(hslToRgb({ h: 210, s: 50, l: 40 })).toEqual({ r: 51, g: 102, b: 153 })
    expect(hslToRgb({ h: 0, s: 100, l: 50 })).toEqual({ r: 255, g: 0, b: 0 })
  })

  it('色相环绕:hslToRgb 对 360/-90/810 与 0/270/90 等价', () => {
    const base = hslToRgb({ h: 0, s: 50, l: 50 })
    expect(hslToRgb({ h: 360, s: 50, l: 50 })).toEqual(base)
    expect(hslToRgb({ h: 270, s: 50, l: 50 })).toEqual(hslToRgb({ h: -90, s: 50, l: 50 }))
    expect(hslToRgb({ h: 90, s: 50, l: 50 })).toEqual(hslToRgb({ h: 810, s: 50, l: 50 }))
  })

  it('灰阶与 0/255/360 边界往返', () => {
    expect(hslToRgb({ h: 0, s: 0, l: 50.2 })).toEqual({ r: 128, g: 128, b: 128 })
    expect(hslToRgb({ h: 0, s: 0, l: 0 })).toEqual(BLACK)
    expect(hslToRgb({ h: 0, s: 0, l: 100 })).toEqual(WHITE)
  })

  it('往返误差 ≤ ±1/通道(含 1 位小数量化后的色相)', () => {
    const samples: Rgb[] = [
      { r: 0, g: 0, b: 0 },
      { r: 255, g: 255, b: 255 },
      { r: 255, g: 0, b: 0 },
      { r: 51, g: 102, b: 153 },
      { r: 218, g: 165, b: 32 },
      { r: 1, g: 254, b: 127 },
      { r: 128, g: 128, b: 128 },
    ]
    for (const rgb of samples) {
      const back = hslToRgb(rgbToHsl(rgb))
      expect(Math.abs(back.r - rgb.r)).toBeLessThanOrEqual(1)
      expect(Math.abs(back.g - rgb.g)).toBeLessThanOrEqual(1)
      expect(Math.abs(back.b - rgb.b)).toBeLessThanOrEqual(1)
    }
  })

  it('组合便捷函数 hex↔hsl 一致', () => {
    expect(rgbToHex(hslToRgb({ h: 210, s: 50, l: 40 }))).toBe('#336699')
    expect(rgbToHsl(parseHex('#336699'))).toEqual({ h: 210, s: 50, l: 40 })
    expect(formatHex(hslToRgb(parseHsl('hsl(210, 50%, 40%)')))).toBe('#336699')
    expect(hslToHex(rgbToHsl(parseHex('#336699')))).toBe('#336699')
  })
})

describe('WCAG 对比度(2 位小数半入口径)', () => {
  it('黑白对比度恒为 21', () => {
    expect(wcagRatio(BLACK, WHITE)).toBe(21)
    expect(contrastRatio(BLACK, WHITE)).toBe(21)
  })

  it('与顺序无关(自动取亮者为分子)', () => {
    expect(wcagRatio(WHITE, BLACK)).toBe(21)
  })

  it('AA 判级边界:#767676=4.54 通过、#777777=4.48 未达标', () => {
    expect(wcagRatio(parseHex('#767676'), WHITE)).toBe(4.54)
    expect(wcagGrades(4.54).normalAA).toBe(true)
    expect(wcagRatio(parseHex('#777777'), WHITE)).toBe(4.48)
    expect(wcagGrades(4.48).normalAA).toBe(false)
  })

  it('判级阈值:4.5 / 3 / 7 边界(按 2 位小数舍入后的值判级)', () => {
    expect(wcagGrades(4.5)).toEqual({ normalAA: true, normalAAA: false, largeAA: true, largeAAA: true })
    expect(wcagGrades(3)).toEqual({ normalAA: false, normalAAA: false, largeAA: true, largeAAA: false })
    expect(wcagGrades(7)).toEqual({ normalAA: true, normalAAA: true, largeAA: true, largeAAA: true })
    expect(wcagGrades(2.99)).toEqual({ normalAA: false, normalAAA: false, largeAA: false, largeAAA: false })
  })

  it('#336699 与白色对比度 6.00(组件默认态)', () => {
    expect(wcagRatio(parseHex('#336699'), WHITE)).toBe(6)
  })

  it('#ff0000 与白色对比度 4.00', () => {
    expect(wcagRatio(parseHex('#ff0000'), WHITE)).toBe(4)
  })
})
