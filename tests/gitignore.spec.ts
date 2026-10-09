import { describe, it, expect } from 'vitest'
import { parseGitignore } from '../src/audit/gitignore.js'

describe('parseGitignore', () => {
  const ignores = (rules: string, target: string, isDir = false) =>
    parseGitignore(rules).ignores(target, isDir)

  it('matches unanchored names at any depth', () => {
    expect(ignores('.idea/', '.idea', true)).toBe(true)
    expect(ignores('.idea/', 'packages/web/.idea', true)).toBe(true)
    expect(ignores('*.log', 'logs/app.log')).toBe(true)
  })

  it('applies a trailing slash only to directories', () => {
    expect(ignores('build/', 'build', true)).toBe(true)
    expect(ignores('build/', 'build')).toBe(false)
  })

  it('treats files under an ignored directory as ignored', () => {
    expect(ignores('.serena/', '.serena/cache/index.json')).toBe(true)
  })

  it('anchors patterns with a leading or middle slash', () => {
    expect(ignores('/out', 'out', true)).toBe(true)
    expect(ignores('/out', 'pkg/out', true)).toBe(false)
    expect(ignores('docs/tmp', 'docs/tmp', true)).toBe(true)
    expect(ignores('docs/tmp', 'x/docs/tmp', true)).toBe(false)
  })

  it('supports ** and ?', () => {
    expect(ignores('**/cache/', 'a/b/cache', true)).toBe(true)
    expect(ignores('logs/**', 'logs/a/b.txt')).toBe(true)
    expect(ignores('a/**/z', 'a/b/c/z')).toBe(true)
    expect(ignores('file?.md', 'file1.md')).toBe(true)
    expect(ignores('file?.md', 'file10.md')).toBe(false)
  })

  it('supports character classes', () => {
    expect(ignores('*.py[co]', 'mod.pyc')).toBe(true)
    expect(ignores('*.py[co]', 'mod.py')).toBe(false)
    expect(ignores('[!a]x', 'bx')).toBe(true)
    expect(ignores('[!a]x', 'ax')).toBe(false)
  })

  it('lets a later negation re-include a path', () => {
    expect(ignores('*.md\n!KEEP.md', 'KEEP.md')).toBe(false)
    expect(ignores('*.md\n!KEEP.md', 'other.md')).toBe(true)
  })

  it('cannot re-include a file whose parent directory is ignored', () => {
    expect(ignores('gen/\n!gen/keep.md', 'gen/keep.md')).toBe(true)
  })

  it('skips comments, blank lines, and escapes', () => {
    expect(ignores('# .idea/\n\n', '.idea', true)).toBe(false)
    expect(ignores('\\#notes', '#notes')).toBe(true)
    expect(ignores('\\!important', '!important')).toBe(true)
  })

  it('treats regex metacharacters in patterns literally', () => {
    expect(ignores('a+b(c).md', 'a+b(c).md')).toBe(true)
    expect(ignores('a+b(c).md', 'aab(c).md')).toBe(false)
    expect(ignores('[unclosed', '[unclosed')).toBe(true)
  })

  it('bounds the work done on hostile input', () => {
    const rules = Array.from({ length: 5_000 }, (_, i) =>
      i % 2 ? `**/**/**/**/*a*a*a*a*a*a*b${i}` : `*a*a*a*a*a*a*a*a*b${i}`,
    ).join('\n')
    const start = Date.now()
    const matcher = parseGitignore(rules)
    expect(matcher.ignores(`${'a/'.repeat(30)}${'a'.repeat(400)}`)).toBe(false)
    expect(matcher.ignores(`${'a/'.repeat(300)}a`)).toBe(false)
    expect(Date.now() - start).toBeLessThan(5_000)
  })

  it('parses a long run of whitespace in linear time', () => {
    const start = Date.now()
    const matcher = parseGitignore(`${' '.repeat(500_000)}x\n${'\t'.repeat(500_000)}y\n.idea/   \n`)
    expect(matcher.ignores('.idea', true)).toBe(true)
    expect(Date.now() - start).toBeLessThan(5_000)
  })

  it('keeps an escaped trailing space', () => {
    expect(ignores('name\\ ', 'name ')).toBe(true)
    expect(ignores('name   ', 'name')).toBe(true)
  })

  it('stops matching when the step budget runs out and reports paths as not ignored', () => {
    const rules = Array.from({ length: 1_000 }, (_, i) => `*${'a'.repeat(200)}b${i}`).join('\n')
    const matcher = parseGitignore(`${rules}\nkeep/`)
    const start = Date.now()
    for (let i = 0; i < 50; i++) matcher.ignores(`${'a'.repeat(250)}${i}/x`, true)
    expect(matcher.ignores('keep', true)).toBe(false)
    expect(Date.now() - start).toBeLessThan(5_000)
  })

  it('ignores nothing for empty input', () => {
    expect(ignores('', '.idea', true)).toBe(false)
  })
})
