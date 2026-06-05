import { describe, it, expect } from 'vitest'
import { checkValidationCommands } from '../src/audit/checks/validationCommands.js'
import { AGENTS_TEMPLATE } from '../src/init/template.js'

describe('checkValidationCommands', () => {
  it('passes when content mentions test', () => {
    expect(checkValidationCommands('AGENTS.md', 'Run the test suite.')).toHaveLength(0)
  })

  it('passes when content mentions lint', () => {
    expect(checkValidationCommands('AGENTS.md', 'Make sure to lint your code.')).toHaveLength(0)
  })

  it('passes when content mentions typecheck', () => {
    expect(checkValidationCommands('AGENTS.md', 'Always typecheck before pushing.')).toHaveLength(0)
  })

  it('passes when content mentions build', () => {
    expect(checkValidationCommands('AGENTS.md', 'Verify the build passes.')).toHaveLength(0)
  })

  it('passes when content mentions format', () => {
    expect(checkValidationCommands('AGENTS.md', 'Run format before committing.')).toHaveLength(0)
  })

  it('is case-insensitive', () => {
    expect(checkValidationCommands('AGENTS.md', 'RUN THE TEST SUITE.')).toHaveLength(0)
  })

  it('flags content with no validation guidance', () => {
    const issues = checkValidationCommands('AGENTS.md', 'Be helpful and concise.')
    expect(issues).toHaveLength(1)
    expect(issues[0].category).toBe('validation-commands')
    expect(issues[0].severity).toBe('medium')
  })

  it('returns the correct issue id and file path', () => {
    const issues = checkValidationCommands('CLAUDE.md', 'nothing relevant')
    expect(issues[0].id).toBe('validation-missing-CLAUDE.md')
    expect(issues[0].file).toBe('CLAUDE.md')
    expect(issues[0].message).toBe('No validation commands mentioned')
  })

  it('flags empty content', () => {
    expect(checkValidationCommands('AGENTS.md', '')).toHaveLength(1)
  })

  it('generated acd init template satisfies validation commands', () => {
    expect(checkValidationCommands('AGENTS.md', AGENTS_TEMPLATE)).toHaveLength(0)
  })
})
