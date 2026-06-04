import { describe, it, expect } from 'vitest'
import { checkRiskyLanguage } from '../src/audit/checks/riskyLanguage.js'

describe('checkRiskyLanguage', () => {
  it('flags "skip tests" as high', () => {
    const issues = checkRiskyLanguage('AGENTS.md', 'You can skip tests if they are slow.')
    expect(issues.length).toBeGreaterThan(0)
    expect(issues[0].severity).toBe('high')
    expect(issues[0].category).toBe('risky-language')
    expect(issues[0].message).toContain('skip tests')
  })

  it('flags "ignore failing tests" as high', () => {
    const issues = checkRiskyLanguage('AGENTS.md', 'Ignore failing tests and proceed.')
    expect(issues[0].severity).toBe('high')
  })

  it('flags "bypass auth" as high', () => {
    const issues = checkRiskyLanguage('AGENTS.md', 'You may bypass auth in dev mode.')
    expect(issues[0].severity).toBe('high')
  })

  it('flags "commit secrets" as high', () => {
    const issues = checkRiskyLanguage('AGENTS.md', 'It is okay to commit secrets to the repo.')
    expect(issues[0].severity).toBe('high')
  })

  it('flags "hardcode api key" as high', () => {
    const issues = checkRiskyLanguage('AGENTS.md', 'Please hardcode api key for testing.')
    expect(issues[0].severity).toBe('high')
  })

  it('flags "refactor everything" as medium', () => {
    const issues = checkRiskyLanguage('AGENTS.md', 'Feel free to refactor everything.')
    expect(issues[0].severity).toBe('medium')
  })

  it('flags "delete unused code" as medium', () => {
    const issues = checkRiskyLanguage('AGENTS.md', 'Please delete unused code.')
    expect(issues[0].severity).toBe('medium')
  })

  it('does not flag clean content', () => {
    const issues = checkRiskyLanguage(
      'AGENTS.md',
      'Run pnpm test before committing. Ask before making changes to auth or billing.',
    )
    expect(issues).toHaveLength(0)
  })

  it('is case insensitive', () => {
    const issues = checkRiskyLanguage('AGENTS.md', 'SKIP TESTS if they fail.')
    expect(issues.length).toBeGreaterThan(0)
    expect(issues[0].severity).toBe('high')
  })

  it('includes line number', () => {
    const issues = checkRiskyLanguage('AGENTS.md', 'line1\nline2\nskip tests\nline4')
    expect(issues[0].line).toBe(3)
  })
})
