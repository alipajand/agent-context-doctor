import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { VERSION } from '../src/version.js'

describe('VERSION', () => {
  it('is a non-empty string', () => {
    expect(typeof VERSION).toBe('string')
    expect(VERSION.length).toBeGreaterThan(0)
  })

  it('matches package.json', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'))
    expect(VERSION).toBe(pkg.version)
  })

  it('follows semantic-version format', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/)
  })
})
