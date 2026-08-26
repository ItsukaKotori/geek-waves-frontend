import { describe, expect, it } from 'vitest'
import { normalizeRepo } from '../framework'

describe('normalizeRepo', () => {
  it('keeps owner/name as-is', () => {
    expect(normalizeRepo('vuejs/core')).toBe('vuejs/core')
  })

  it('strips github URL, git suffix and trailing slash', () => {
    expect(normalizeRepo('https://github.com/vuejs/core.git')).toBe('vuejs/core')
    expect(normalizeRepo('https://github.com/vuejs/core/')).toBe('vuejs/core')
    expect(normalizeRepo('github.com/vuejs/core')).toBe('vuejs/core')
    expect(normalizeRepo('  spring-projects/spring-boot  ')).toBe('spring-projects/spring-boot')
  })

  it('falls back to raw input when not a repo shape', () => {
    expect(normalizeRepo('https://example.com/a/b')).toBe('https://example.com/a/b')
    expect(normalizeRepo('a/b/c')).toBe('a/b/c')
  })
})
