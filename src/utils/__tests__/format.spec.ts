import { describe, expect, it } from 'vitest'
import { fmtBytes, fmtDuration, fmtPercent, fmtSpeed } from '../format'

describe('fmtBytes', () => {
  it('formats common magnitudes with one decimal', () => {
    expect(fmtBytes(0)).toBe('0 B')
    expect(fmtBytes(512)).toBe('512 B')
    expect(fmtBytes(1024)).toBe('1 KB')
    expect(fmtBytes(1536)).toBe('1.5 KB')
    expect(fmtBytes(1_048_576)).toBe('1 MB')
    expect(fmtBytes(1_234_567)).toBe('1.2 MB')
    expect(fmtBytes(1_073_741_824)).toBe('1 GB')
    expect(fmtBytes(1_099_511_627_776)).toBe('1 TB')
  })

  it('returns placeholder for missing values', () => {
    expect(fmtBytes(undefined)).toBe('—')
    expect(fmtBytes(null)).toBe('—')
    expect(fmtBytes(Number.NaN)).toBe('—')
  })
})

describe('fmtSpeed', () => {
  it('appends per-second unit', () => {
    expect(fmtSpeed(1024)).toBe('1 KB/s')
    expect(fmtSpeed(undefined)).toBe('—')
  })
})

describe('fmtPercent', () => {
  it('formats with given digits', () => {
    expect(fmtPercent(12.34)).toBe('12.3%')
    expect(fmtPercent(100)).toBe('100.0%')
    expect(fmtPercent(12.34, 0)).toBe('12%')
  })

  it('returns placeholder for missing values', () => {
    expect(fmtPercent(undefined)).toBe('—')
    expect(fmtPercent(null)).toBe('—')
  })
})

describe('fmtDuration', () => {
  it('shows the two most significant non-zero units', () => {
    expect(fmtDuration(0)).toBe('0s')
    expect(fmtDuration(59_000)).toBe('59s')
    expect(fmtDuration(61_000)).toBe('1m 1s')
    expect(fmtDuration(3_661_000)).toBe('1h 1m')
    expect(fmtDuration(90_061_000)).toBe('1d 1h')
  })

  it('returns placeholder for missing values', () => {
    expect(fmtDuration(undefined)).toBe('—')
    expect(fmtDuration(null)).toBe('—')
  })
})
