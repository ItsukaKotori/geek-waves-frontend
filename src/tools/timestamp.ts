const pad = (n: number) => String(n).padStart(2, '0')

export function tsToDate(ts: number): string {
  const ms = ts < 1e12 ? ts * 1000 : ts
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export function dateToTs(date: Date): { s: number; ms: number } {
  const ms = date.getTime()
  return { s: Math.floor(ms / 1000), ms }
}
