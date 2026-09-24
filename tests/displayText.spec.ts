import { describe, it, expect } from 'vitest'
import { formatCodePoint, toDisplayText } from '../src/text/displayText.js'

// Built from code points so formatters cannot turn them into literal invisible text.
const ZWSP = String.fromCodePoint(0x200b)
const RLO = String.fromCodePoint(0x202e)
const SOFT_HYPHEN = String.fromCodePoint(0x00ad)
const TAG_A = String.fromCodePoint(0xe0041)

describe('toDisplayText', () => {
  it('leaves ordinary text untouched', () => {
    expect(toDisplayText('Run pnpm test — then report.')).toBe('Run pnpm test — then report.')
  })

  it('neutralizes ANSI and OSC escape sequences', () => {
    const out = toDisplayText('ok \u001b[2J\u001b]52;c;ZXZpbA==\u0007 done')
    expect(out).not.toContain('\u001b')
    expect(out).not.toContain('\u0007')
  })

  it('turns newlines and carriage returns into spaces', () => {
    expect(toDisplayText('a\rb\nc')).toBe('a b c')
  })

  it('keeps tabs', () => {
    expect(toDisplayText('a\tb')).toBe('a\tb')
  })

  it('makes zero-width and bidi control characters visible', () => {
    expect(toDisplayText(`a${ZWSP}b`)).toBe('a<U+200B>b')
    expect(toDisplayText(`x${RLO}y`)).toBe('x<U+202E>y')
  })

  it('makes Unicode tag characters visible', () => {
    expect(toDisplayText(`hi${TAG_A}`)).toBe('hi<U+E0041>')
  })
})

describe('formatCodePoint', () => {
  it('pads to four hex digits', () => {
    expect(formatCodePoint(SOFT_HYPHEN)).toBe('<U+00AD>')
  })
})
