import { describe, it, expect } from 'vitest'
import { CHECKS } from '../src/audit/checkCatalog.js'
import { VALID_CHECKS } from '../src/config/schema.js'
import { KNOWN_SUPPRESSION_CATEGORIES } from '../src/audit/suppressions.js'
import * as api from '../src/index.js'

describe('check catalog', () => {
  it('lists every check that disabledChecks accepts, once', () => {
    expect(CHECKS.map((c) => c.id).sort()).toEqual([...VALID_CHECKS].sort())
  })

  it('lets every line-oriented check be suppressed inline', () => {
    for (const id of VALID_CHECKS) {
      if (id === 'agent-config') continue
      expect(KNOWN_SUPPRESSION_CATEGORIES.has(id)).toBe(true)
    }
  })
})

describe('library entry point', () => {
  it('exports the audit function, reports, and catalog', () => {
    expect(typeof api.auditRepo).toBe('function')
    expect(typeof api.toSarifReport).toBe('function')
    expect(typeof api.toGithubAnnotations).toBe('function')
    expect(typeof api.loadBaseline).toBe('function')
    expect(api.CHECKS.length).toBeGreaterThan(0)
    expect(api.VERSION).toMatch(/^\d+\.\d+\.\d+/)
  })
})
