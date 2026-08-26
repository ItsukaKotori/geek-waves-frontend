import { describe, expect, it } from 'vitest'
import { notesToPlain } from '../notes'

describe('notesToPlain', () => {
  it('strips headings, list markers and emphasis', () => {
    const md = "## What's Changed\n- Bump **spring-batch** to `5.1.1`\n* minor fix"
    expect(notesToPlain(md)).toBe(
      "What's Changed\n• Bump spring-batch to 5.1.1\n• minor fix",
    )
  })

  it('keeps url text and blank lines', () => {
    expect(notesToPlain('line one\n\nhttps://x.com/a')).toBe('line one\n\nhttps://x.com/a')
  })
})
