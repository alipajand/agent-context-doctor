import { describe, it, expect } from 'vitest'
import { checkPlaceholderContent } from '../src/audit/checks/placeholderContent.js'

describe('checkPlaceholderContent', () => {
  it('flags TODO', () => {
    const issues = checkPlaceholderContent('AGENTS.md', '# Agents\nTODO: fill this in')
    expect(issues.length).toBeGreaterThan(0)
    expect(issues[0].severity).toBe('medium')
    expect(issues[0].category).toBe('placeholder-content')
  })

  it('flags TBD', () => {
    const issues = checkPlaceholderContent('AGENTS.md', 'Status: TBD')
    expect(issues.length).toBeGreaterThan(0)
  })

  it('flags lorem ipsum', () => {
    const issues = checkPlaceholderContent('AGENTS.md', 'Lorem ipsum dolor sit amet')
    expect(issues.length).toBeGreaterThan(0)
  })

  it('flags <!-- describe', () => {
    const issues = checkPlaceholderContent('AGENTS.md', '<!-- describe your project -->')
    expect(issues.length).toBeGreaterThan(0)
  })

  it('flags list paths to read before editing', () => {
    const issues = checkPlaceholderContent('AGENTS.md', 'list paths to read before editing')
    expect(issues.length).toBeGreaterThan(0)
  })

  it('does not flag clean content', () => {
    const clean = `# AGENTS\n\nThis is a real project.\n\nRun \`pnpm test\` to test.`
    const issues = checkPlaceholderContent('AGENTS.md', clean)
    expect(issues).toHaveLength(0)
  })

  it('flags blank In scope: line', () => {
    const issues = checkPlaceholderContent('AGENTS.md', 'In scope:\nOut of scope:')
    expect(issues.some((i) => i.message.includes('In scope:'))).toBe(true)
  })

  it('does not flag In scope: with real content', () => {
    const issues = checkPlaceholderContent(
      'AGENTS.md',
      'In scope: feature A, feature B, all TypeScript changes',
    )
    expect(issues.filter((i) => i.message.includes('In scope:'))).toHaveLength(0)
  })

  it('includes line number in issue', () => {
    const issues = checkPlaceholderContent('AGENTS.md', 'line 1\nTODO: something\nline 3')
    expect(issues[0].line).toBe(2)
  })
})
