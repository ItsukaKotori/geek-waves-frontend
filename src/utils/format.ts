/**
 * 监控页数值格式化纯函数:字节/百分比/时长/速率。
 * 缺失值(null/undefined/NaN)统一渲染为占位符「—」,由后端降级 DTO 触发。
 */

const BYTES_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'] as const

export function fmtBytes(bytes?: number | null): string {
  if (bytes == null || !Number.isFinite(bytes)) return '—'
  let v = Math.abs(bytes)
  if (v < 1024) return `${Math.round(v)} B`
  let unit = 0
  while (v >= 1024 && unit < BYTES_UNITS.length - 1) {
    v /= 1024
    unit++
  }
  const s = v.toFixed(1).replace(/\.0$/, '')
  return `${bytes < 0 ? '-' : ''}${s} ${BYTES_UNITS[unit]}`
}

export function fmtSpeed(bytesPerSec?: number | null): string {
  if (bytesPerSec == null || !Number.isFinite(bytesPerSec)) return '—'
  return `${fmtBytes(bytesPerSec)}/s`
}

export function fmtPercent(value?: number | null, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return `${value.toFixed(digits)}%`
}

/** 时长:最多展示两个最高位的非零单位(如 1d 1h / 59s / 0s) */
export function fmtDuration(ms?: number | null): string {
  if (ms == null || !Number.isFinite(ms)) return '—'
  const total = Math.floor(Math.abs(ms) / 1000)
  if (total === 0) return '0s'
  const units: Array<[number, string]> = [
    [Math.floor(total / 86_400), 'd'],
    [Math.floor((total % 86_400) / 3600), 'h'],
    [Math.floor((total % 3600) / 60), 'm'],
    [total % 60, 's'],
  ]
  const parts = units.filter(([n]) => n > 0).map(([n, u]) => `${n}${u}`)
  return (ms < 0 ? '-' : '') + parts.slice(0, 2).join(' ')
}
