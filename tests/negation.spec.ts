import { describe, it, expect } from 'vitest'
import { isNegated } from '../src/audit/negation.js'

function negatedAt(line: string, phrase: string): boolean {
  return isNegated(line, line.indexOf(phrase))
}

describe('isNegated', () => {
  it.each([
    ['Never skip tests.', 'skip tests'],
    ['Do not skip tests or disable linting.', 'disable linting'],
    ["Don't bypass auth.", 'bypass auth'],
    ['Under no circumstances should you skip tests.', 'skip tests'],
    ['Avoid force-pushing to shared branches.', 'force-pushing'],
    ['You must never, ever skip tests.', 'skip tests'],
  ])('treats "%s" as negated', (line, phrase) => {
    expect(negatedAt(line, phrase)).toBe(true)
  })

  it.each([
    ['Skip tests if they are slow.', 'skip tests'],
    ["Don't worry about lint, just skip tests.", 'skip tests'],
    ['Tests are not required. Skip tests when in a hurry.', 'Skip tests'],
    ['If CI is red, then skip tests.', 'skip tests'],
  ])('treats "%s" as permissive', (line, phrase) => {
    expect(negatedAt(line, phrase)).toBe(false)
  })
})
