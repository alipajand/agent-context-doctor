import { describe, it, expect } from 'vitest'
import { checkFrontmatter, parseFrontmatter } from '../src/audit/checks/frontmatter.js'

const fm = (lines: string[]) => ['---', ...lines, '---', '', '# Body'].join('\n')

describe('parseFrontmatter', () => {
  it('reads top-level keys', () => {
    expect(parseFrontmatter(fm(['name: reviewer', 'description: Reviews code']))?.fields).toEqual(
      new Map([
        ['name', 'reviewer'],
        ['description', 'Reviews code'],
      ]),
    )
  })

  it('returns null without frontmatter and flags an unclosed block', () => {
    expect(parseFrontmatter('# Title')).toBeNull()
    expect(parseFrontmatter('---\nname: x\n# never closed')?.endLine).toBe(-1)
  })

  it('ignores a leading byte-order mark', () => {
    const bom = String.fromCodePoint(0xfeff)
    expect(parseFrontmatter(`${bom}${fm(['name: x'])}`)?.fields.get('name')).toBe('x')
  })
})

describe('checkFrontmatter', () => {
  const cursor = '.cursor/rules/api.mdc'

  it.each([
    [['alwaysApply: true']],
    [['globs: src/**/*.ts']],
    [['description: Use when editing the API']],
  ])('accepts a Cursor rule that can be applied: %j', (lines) => {
    expect(checkFrontmatter(cursor, fm(lines))).toEqual([])
  })

  it('flags a Cursor rule that can never be applied', () => {
    const [issue] = checkFrontmatter(
      cursor,
      fm(['alwaysApply: false', 'globs:', 'description: ""']),
    )
    expect(issue).toMatchObject({ severity: 'medium', category: 'frontmatter' })
    expect(issue.message).toContain('never applied')
  })

  it('flags a Cursor rule without frontmatter as low', () => {
    expect(checkFrontmatter(cursor, '# Rules')[0].severity).toBe('low')
  })

  it.each([
    ['.claude/agents/reviewer.md', 'Claude subagent'],
    ['.claude/skills/deploy/SKILL.md', 'Claude skill'],
  ])('requires name and description for %s', (path, tool) => {
    expect(checkFrontmatter(path, fm(['name: x', 'description: y']))).toEqual([])
    const [issue] = checkFrontmatter(path, fm(['name: x']))
    expect(issue.message).toContain(`${tool} is missing frontmatter description`)
    expect(checkFrontmatter(path, '# no frontmatter')[0].message).toContain('name and description')
  })

  it('requires applyTo for Copilot instruction files', () => {
    const path = '.github/instructions/tests.instructions.md'
    expect(checkFrontmatter(path, fm(["applyTo: '**/*.test.ts'"]))).toEqual([])
    expect(checkFrontmatter(path, '# Tests')[0].severity).toBe('low')
  })

  it('reports unclosed frontmatter', () => {
    const [issue] = checkFrontmatter('.claude/agents/a.md', '---\nname: a\ndescription: b\n')
    expect(issue.message).toContain('never closed')
  })

  it('ignores files it does not know', () => {
    expect(checkFrontmatter('AGENTS.md', '# Agents')).toEqual([])
    expect(checkFrontmatter('.claude/commands/review.md', '# Review')).toEqual([])
  })
})
