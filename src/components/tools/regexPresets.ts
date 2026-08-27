/** 正则常用预设(FE4 要求项 6):一键填入 pattern 与建议 flags */
export interface RegexPreset {
  id: string
  label: string
  pattern: string
  flags: string
}

export const REGEX_PRESETS: RegexPreset[] = [
  { id: 'phone', label: '手机号', pattern: '(?:\\+86[- ]?)?1[3-9]\\d{9}', flags: 'g' },
  { id: 'email', label: '邮箱', pattern: '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}', flags: 'gi' },
  { id: 'url', label: 'URL', pattern: '\\bhttps?://[^\\s<>]+', flags: 'gi' },
  {
    id: 'ipv4',
    label: 'IPv4',
    pattern: '\\b(?:(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)\\.){3}(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)\\b',
    flags: 'g',
  },
  { id: 'ipv6', label: 'IPv6', pattern: '\\b(?:[0-9A-Fa-f]{1,4}:){1,7}[0-9A-Fa-f]{0,4}\\b', flags: 'gi' },
  { id: 'date', label: '日期(YYYY-MM-DD)', pattern: '\\d{4}[-/.](?:0?[1-9]|1[0-2])[-/.](?:0?[1-9]|[12]\\d|3[01])', flags: 'g' },
  {
    id: 'idcard',
    label: '身份证',
    pattern: '\\b[1-9]\\d{5}(?:19|20)\\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\\d|3[01])\\d{3}[\\dXx]\\b',
    flags: 'g',
  },
  { id: 'cjk', label: '中英文段落', pattern: '[\\u4e00-\\u9fa5]+|[A-Za-z]+', flags: 'gu' },
]

export function findPreset(id: string): RegexPreset | undefined {
  return REGEX_PRESETS.find((p) => p.id === id)
}
