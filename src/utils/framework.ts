export function normalizeRepo(input: string): string {
  const s = input.trim().replace(/\/+$/, '')
  for (const p of [
    'https://github.com/',
    'http://github.com/',
    'github.com/',
    'https://www.github.com/',
    'http://www.github.com/',
  ]) {
    if (s.startsWith(p)) return normalizeRepo(s.slice(p.length))
  }
  const noGit = s.endsWith('.git') ? s.slice(0, -4) : s
  const bare = noGit.replace(/\/+$/, '')
  return /^[\w.-]+\/[\w.-]+$/.test(bare) ? bare : input.trim()
}
