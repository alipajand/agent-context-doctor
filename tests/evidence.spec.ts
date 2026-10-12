import { describe, it, expect } from 'vitest'
import { getLineEvidence } from '../src/audit/evidence.js'

describe('getLineEvidence', () => {
  const content = 'first line\n  second   line  \nthird line'

  it('returns the requested line (1-indexed)', () => {
    expect(getLineEvidence(content, 1)).toBe('first line')
    expect(getLineEvidence(content, 3)).toBe('third line')
  })

  it('collapses repeated whitespace and trims', () => {
    expect(getLineEvidence(content, 2)).toBe('second line')
  })

  it('returns empty string for out-of-range lines', () => {
    expect(getLineEvidence(content, 0)).toBe('')
    expect(getLineEvidence(content, 99)).toBe('')
  })

  it('returns empty string for an empty file', () => {
    expect(getLineEvidence('', 1)).toBe('')
  })

  it('truncates to 160 characters', () => {
    const long = 'x'.repeat(500)
    const result = getLineEvidence(long, 1)
    expect(result).toHaveLength(160)
  })

  it('handles a line that is exactly at the limit', () => {
    const exact = 'y'.repeat(160)
    expect(getLineEvidence(exact, 1)).toHaveLength(160)
  })

  it('normalizes tabs to single spaces', () => {
    expect(getLineEvidence('a\t\tb', 1)).toBe('a b')
  })
})

describe('getLineEvidence — credentials', () => {
  // Assembled at runtime so no credential-shaped literal is committed.
  const token = 'ghp' + '_' + 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8'

  it('masks credentials the secrets check recognizes', () => {
    const result = getLineEvidence(`export GITHUB_TOKEN=${token}`, 1)
    expect(result).not.toContain(token)
    expect(result).toContain('ghp_****')
  })

  it('masks before truncating, so no unmasked prefix survives the cut', () => {
    const line = `${'x '.repeat(70)}${token}`
    const result = getLineEvidence(line, 1)
    expect(result).not.toContain(token.slice(0, 12))
  })

  it('masks extra values passed by the caller', () => {
    expect(getLineEvidence('"API_KEY": "plainvalue"', 1, ['plainvalue'])).not.toContain(
      'plainvalue',
    )
  })
})
