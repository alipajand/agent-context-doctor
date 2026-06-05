import { describe, it, expect } from 'vitest'
import { checkSafetyBoundaries } from '../src/audit/checks/safetyBoundaries.js'
import { AGENTS_TEMPLATE } from '../src/init/template.js'

describe('checkSafetyBoundaries', () => {
  it('passes when content asks to ask before changes', () => {
    expect(checkSafetyBoundaries('AGENTS.md', 'Ask before modifying anything.')).toHaveLength(0)
  })

  it('passes when content mentions auth', () => {
    expect(checkSafetyBoundaries('AGENTS.md', 'Never touch the auth flow.')).toHaveLength(0)
  })

  it('passes when content mentions authentication', () => {
    expect(checkSafetyBoundaries('AGENTS.md', 'Authentication is out of scope.')).toHaveLength(0)
  })

  it('passes when content mentions billing', () => {
    expect(checkSafetyBoundaries('AGENTS.md', 'Do not edit billing code.')).toHaveLength(0)
  })

  it('passes when content mentions database or migration', () => {
    expect(checkSafetyBoundaries('AGENTS.md', 'No database migration changes.')).toHaveLength(0)
  })

  it('passes when content mentions production', () => {
    expect(checkSafetyBoundaries('AGENTS.md', 'Never deploy to production.')).toHaveLength(0)
  })

  it('passes when content mentions secrets', () => {
    expect(checkSafetyBoundaries('AGENTS.md', 'Keep secrets out of the repo.')).toHaveLength(0)
  })

  it('passes when content uses "without approval" or "forbidden"', () => {
    expect(checkSafetyBoundaries('AGENTS.md', 'Forbidden without approval.')).toHaveLength(0)
  })

  it('is case-insensitive', () => {
    expect(checkSafetyBoundaries('AGENTS.md', 'DO NOT CHANGE the SCHEMA.')).toHaveLength(0)
  })

  it('flags content with no safety language', () => {
    const issues = checkSafetyBoundaries('AGENTS.md', 'Write clean code and add comments.')
    expect(issues).toHaveLength(1)
    expect(issues[0].category).toBe('safety-boundaries')
    expect(issues[0].severity).toBe('medium')
  })

  it('returns the correct issue id and file path', () => {
    const issues = checkSafetyBoundaries('CLAUDE.md', 'no boundaries here')
    expect(issues[0].id).toBe('safety-missing-CLAUDE.md')
    expect(issues[0].file).toBe('CLAUDE.md')
    expect(issues[0].message).toBe('No safety-boundary language found')
  })

  it('flags empty content', () => {
    expect(checkSafetyBoundaries('AGENTS.md', '')).toHaveLength(1)
  })

  it('generated acd init template satisfies safety boundaries', () => {
    expect(checkSafetyBoundaries('AGENTS.md', AGENTS_TEMPLATE)).toHaveLength(0)
  })
})
