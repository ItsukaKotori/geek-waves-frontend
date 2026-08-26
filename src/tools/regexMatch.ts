export interface Highlight {
  start: number
  end: number
}

/**
 * 计算正则匹配区间(全局)。flags 可附加非 g 标志(如 i/m/s/u),
 * 内部自动补 g 以保证全局匹配。
 */
export function regexHighlights(pattern: string, text: string, flags = ''): Highlight[] {
  const merged = flags.includes('g') ? flags : `${flags}g`
  const re = new RegExp(pattern, merged)
  const out: Highlight[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m[0] === '') {
      re.lastIndex++
      continue
    }
    out.push({ start: m.index, end: m.index + m[0].length })
  }
  return out
}
