/**
 * 颜色工具纯函数层:HEX / RGB / HSL 三格式互转 + WCAG 2.x 对比度。
 *
 * 口径声明:
 * - RGB 分量恒为 0~255 整数;解析输入出现小数时四舍五入(Math.round)到整数,
 *   越界(含负数)明确报错,不做静默截断(clamp)。
 * - HSL:h 输出前环绕归一到 [0,360)(任意输入角等价),s/l 限定 0~100;
 *   输出保留 1 位小数(Math.round(x×10)/10)—— 由此 RGB↔HSL 往返存在
 *   ≤ ±1/通道 的量化误差(色相 0.1° 量化所致),已在测试中声明验证。
 * - WCAG 2.x 相对亮度(sRGB 线性化,阈值 0.03928)与对比度公式;对比度
 *   比值「四舍五入到 2 位小数(半入)」后再判级:AA 正常 ≥4.5 / AAA 正常 ≥7 /
 *   AA 大文本 ≥3 / AAA 大文本 ≥4.5。展示与判级使用同一舍入值,口径一致。
 */

export interface Rgb {
  r: number
  g: number
  b: number
}

export interface Hsl {
  /** 色相 [0,360) */
  h: number
  /** 饱和度 [0,100] */
  s: number
  /** 亮度 [0,100] */
  l: number
}

export interface WcagGrades {
  normalAA: boolean
  normalAAA: boolean
  largeAA: boolean
  largeAAA: boolean
}

/* ------------------------------ 解析与格式化 ------------------------------ */

function requireNonEmpty(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) throw new Error('输入为空')
  return trimmed
}

/** 解析 HEX:#abc / abc / #aabbcc / aabbcc(大小写不敏感) */
export function parseHex(input: string): Rgb {
  const s = requireNonEmpty(input).replace(/^#/, '')
  if (s.length !== 3 && s.length !== 6) {
    throw new Error('HEX 须为 3 或 6 位十六进制(如 #abc 或 #aabbcc)')
  }
  if (!/^[0-9a-fA-F]+$/.test(s)) {
    throw new Error('HEX 须为十六进制数字(0-9a-f)')
  }
  if (s.length === 3) {
    const [r, g, b] = [...s].map((c) => parseInt(c + c, 16))
    return { r: r!, g: g!, b: b! }
  }
  return {
    r: parseInt(s.slice(0, 2), 16),
    g: parseInt(s.slice(2, 4), 16),
    b: parseInt(s.slice(4, 6), 16),
  }
}

/** 输出小写 #rrggbb */
export function rgbToHex(rgb: Rgb): string {
  const h = (v: number) => v.toString(16).padStart(2, '0')
  return `#${h(clampComponent(rgb.r))}${h(clampComponent(rgb.g))}${h(clampComponent(rgb.b))}`
}

export const formatHex = rgbToHex

/** 解析 RGB:rgb(255, 0, 0) / 255, 0, 0 / 255 0 0;小数四舍五入,越界报错 */
export function parseRgb(input: string): Rgb {
  const s = requireNonEmpty(input).replace(/^rgb\(/i, '').replace(/\)$/, '')
  const parts = s.split(/[\s,]+/).filter((p) => p !== '')
  if (parts.length !== 3) throw new Error('RGB 须为 3 个分量(r, g, b)')
  const values = parts.map((p) => {
    if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(p)) throw new Error(`RGB 分量须为数字,得到「${p}」`)
    return Math.round(Number(p))
  })
  return { r: clampComponent(values[0]!), g: clampComponent(values[1]!), b: clampComponent(values[2]!) }
}

/** 输出 rgb(255, 0, 0) 形态 */
export function formatRgb(rgb: Rgb): string {
  return `rgb(${clampComponent(rgb.r)}, ${clampComponent(rgb.g)}, ${clampComponent(rgb.b)})`
}

/** 解析 HSL:hsl(210, 50%, 40%) / 210, 50, 40 / 210 50% 40%;h 环绕,s/l 限定 0~100 */
export function parseHsl(input: string): Hsl {
  const s = requireNonEmpty(input).replace(/^hsl\(/i, '').replace(/\)$/, '')
  const parts = s.split(/[\s,]+/).filter((p) => p !== '')
  if (parts.length !== 3) throw new Error('HSL 须为 3 个分量(h, s%, l%)')
  const nums = parts.map((p) => {
    if (!/^[+-]?(\d+\.?\d*|\.\d+)%?$/.test(p)) throw new Error(`HSL 分量须为数字(可带 %),得到「${p}」`)
    return Number(p.replace(/%$/, ''))
  })
  const [h, s2, l] = nums as [number, number, number]
  return { h: wrapHue(h), s: clampHsl(s2, 's'), l: clampHsl(l, 'l') }
}

/** 输出 hsl(210, 50%, 40%) 形态(分量保留最多 1 位小数) */
export function formatHsl(hsl: Hsl): string {
  return `hsl(${trimNum(wrapHue(hsl.h))}, ${trimNum(clampHsl(hsl.s, 's'))}%, ${trimNum(clampHsl(hsl.l, 'l'))}%)`
}

function clampComponent(v: number): number {
  if (!Number.isFinite(v) || v < 0 || v > 255) {
    throw new Error(`RGB 分量须为 0~255 的整数,得到 ${v}`)
  }
  return Math.round(v)
}

function clampHsl(v: number, which: 's' | 'l'): number {
  if (!Number.isFinite(v) || v < 0 || v > 100) {
    throw new Error(`HSL ${which === 's' ? '饱和度' : '亮度'}须为 0~100,得到 ${v}`)
  }
  return v
}

/** 色相环绕归一到 [0,360) */
export function wrapHue(h: number): number {
  return ((h % 360) + 360) % 360
}

/** 数值展示:最多 1 位小数,去掉无意义的 .0 */
function trimNum(v: number): string {
  const rounded = Math.round(v * 10) / 10
  return rounded.toFixed(1).replace(/\.0$/, '')
}

/* ------------------------------ RGB ↔ HSL --------------------------------- */

/** RGB → HSL(标准公式;输出 h/s/l 分别保留 1 位小数,口径见模块注释) */
export function rgbToHsl(rgb: Rgb): Hsl {
  const r = rgb.r / 255
  const g = rgb.g / 255
  const b = rgb.b / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  let h = 0
  let s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60
    else if (max === g) h = ((b - r) / d + 2) * 60
    else h = ((r - g) / d + 4) * 60
  }
  return {
    h: Math.round(wrapHue(h) * 10) / 10,
    s: Math.round(s * 1000) / 10,
    l: Math.round(l * 1000) / 10,
  }
}

/** HSL → RGB(h 任意角环绕,s/l 0~100;分量四舍五入到整数) */
export function hslToRgb(hsl: Hsl): Rgb {
  const h = wrapHue(hsl.h) / 360
  const s = clampHsl(hsl.s, 's') / 100
  const l = clampHsl(hsl.l, 'l') / 100
  let r: number
  let g: number
  let b: number
  if (s === 0) {
    r = g = b = l
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    r = hueChannel(h + 1 / 3, p, q)
    g = hueChannel(h, p, q)
    b = hueChannel(h - 1 / 3, p, q)
  }
  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) }
}

function hueChannel(t: number, p: number, q: number): number {
  if (t < 0) t += 1
  if (t > 1) t -= 1
  if (t < 1 / 6) return p + (q - p) * 6 * t
  if (t < 1 / 2) return q
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
  return p
}

export function hexToHsl(input: string): Hsl {
  return rgbToHsl(parseHex(input))
}

export function hslToHex(hsl: Hsl): string {
  return rgbToHex(hslToRgb(hsl))
}

/* --------------------------- WCAG 2.x 对比度 ------------------------------ */

/** sRGB 相对亮度(WCAG 2.x 定义;0.03928 旧阈值与规范原文一致) */
export function relativeLuminance(rgb: Rgb): number {
  const lin = (v: number): number => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(rgb.r) + 0.7152 * lin(rgb.g) + 0.0722 * lin(rgb.b)
}

/** 原始对比度(自动取亮者为分子,与参数顺序无关) */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const lighter = Math.max(la, lb)
  const darker = Math.min(la, lb)
  return (lighter + 0.05) / (darker + 0.05)
}

/** 对比度比值:四舍五入到 2 位小数(半入)—— 展示与判级统一口径 */
export function wcagRatio(a: Rgb, b: Rgb): number {
  const raw = contrastRatio(a, b)
  return Math.round((raw + Number.EPSILON) * 100) / 100
}

/** WCAG 判级(输入为舍入后的比值):AA 正常 ≥4.5 / AAA 正常 ≥7 / AA 大文本 ≥3 / AAA 大文本 ≥4.5 */
export function wcagGrades(ratio: number): WcagGrades {
  return {
    normalAA: ratio >= 4.5,
    normalAAA: ratio >= 7,
    largeAA: ratio >= 3,
    largeAAA: ratio >= 4.5,
  }
}
