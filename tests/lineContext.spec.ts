import { describe, it, expect } from 'vitest'
import { createLineContext } from '../src/audit/lineContext.js'
import { isNegated } from '../src/audit/negation.js'

describe('createLineContext', () => {
  it.each([
    'Never skip tests.',
    'Do not skip tests, but skip lint.',
    "Don't worry about lint, just skip tests.",
    'Avoid it; skip tests',
    'No: skip tests',
    'You must not, under any circumstances, skip tests',
    'Run everything. skip tests',
    'nothing here skip tests',
    'Never thenskip tests',
    'neverskip tests',
    'Never butskip it, notskip that',
    'Do it; nothing else: x',
    "Never don'tskip it, can'tskip that",
    "won'tskip tests and shouldn'tskip them",
  ])('agrees with isNegated at every index of %s', (line) => {
    const context = createLineContext(line)
    for (let i = 0; i <= line.length; i++) {
      expect([i, context.negatedAt(i)]).toEqual([i, isNegated(line, i)])
    }
  })

  it('finds the sentence around an index', () => {
    const line = 'First one. Second one here! Third'
    const context = createLineContext(line)
    const at = (word: string) => {
      const { start, end } = context.sentenceAt(line.indexOf(word))
      return line.slice(start, end).trim()
    }
    expect(at('First')).toBe('First one.')
    expect(at('here')).toBe('Second one here!')
    expect(at('Third')).toBe('Third')
    expect(createLineContext('See docs/a.md now').sentenceAt(10)).toEqual({ start: 0, end: 17 })
  })

  it('detects straight and curly quotes within the sentence only', () => {
    const line = 'Say "skip it" or “skip that”. Then "skip" here'
    const context = createLineContext(line)
    expect(context.quotedAt(line.indexOf('skip it'))).toBe(true)
    expect(context.quotedAt(line.indexOf('skip that'))).toBe(true)
    expect(context.quotedAt(line.indexOf('Then'))).toBe(false)
    expect(context.quotedAt(line.indexOf('here'))).toBe(false)
  })

  it('does not treat an inch mark as a quote', () => {
    const line = 'Use 27" monitors and skip the tests, see "docs".'
    expect(createLineContext(line).quotedAt(line.indexOf('skip'))).toBe(false)
  })

  it('does not treat a sentence quoted from start to end as an example', () => {
    for (const line of [
      'Rule: "Skip the tests when they are slow."',
      '**"Skip the tests when they are slow."**',
      '_"Skip the tests when they are slow."_',
      '\u201cSkip the tests when they are slow.\u201d',
      '- "Skip the tests when they are slow."',
    ]) {
      expect(createLineContext(line).quotedAt(line.indexOf('the tests'))).toBe(false)
    }
  })
})
