import { describe, it, expect } from 'vitest'
import { VERSION } from '../src/version.js'

describe('VERSION', () => {
  it('is a non-empty string', () => {
    expect(typeof VERSION).toBe('string')
    expect(VERSION.length).toBeGreaterThan(0)
  })

  it('follows semantic-version format', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/)
  })
})
