import { describe, it, expect } from 'vitest'
import { checkFinalReporting } from '../src/audit/checks/finalReporting.js'
import { AGENTS_TEMPLATE } from '../src/init/template.js'

describe('checkFinalReporting', () => {
  it('passes when content contains a "## Final report" heading', () => {
    const content = '## Final report\n\nAlways include files changed and commands run.'
    expect(checkFinalReporting('AGENTS.md', content)).toHaveLength(0)
  })

  it('passes when content contains a "## Completion report" heading', () => {
    const content = '## Completion report\n\nDescribe what you did.'
    expect(checkFinalReporting('AGENTS.md', content)).toHaveLength(0)
  })

  it('passes when content contains a "## Handoff" heading', () => {
    const content = '## Handoff\n\nNotes for the next agent.'
    expect(checkFinalReporting('AGENTS.md', content)).toHaveLength(0)
  })

  it('passes when content has "Files changed" and "Commands run"', () => {
    const content = 'Always list:\n- Files changed\n- Commands run'
    expect(checkFinalReporting('AGENTS.md', content)).toHaveLength(0)
  })

  it('passes when content has "Files changed" and "Known limitations"', () => {
    const content = 'Report includes:\n- Files changed\n- Known limitations'
    expect(checkFinalReporting('AGENTS.md', content)).toHaveLength(0)
  })

  it('passes when content has "Commands run" and "Known limitations"', () => {
    const content = 'Commands run and Known limitations must be in the final output.'
    expect(checkFinalReporting('AGENTS.md', content)).toHaveLength(0)
  })

  it('passes when content has "Tests added" as a strong field (with one other)', () => {
    const content = 'Include: Files changed\nTests added'
    expect(checkFinalReporting('AGENTS.md', content)).toHaveLength(0)
  })

  it('passes when content has "Recommended next steps"', () => {
    const content = 'Files changed\nRecommended next steps'
    expect(checkFinalReporting('AGENTS.md', content)).toHaveLength(0)
  })

  it('fails when content only contains "tests must pass" — single word tests is not enough', () => {
    const content = 'Make sure all tests must pass before finishing.'
    const issues = checkFinalReporting('AGENTS.md', content)
    expect(issues).toHaveLength(1)
    expect(issues[0].category).toBe('final-reporting')
  })

  it('fails when content only contains "summary" — not a strong pattern', () => {
    const content = 'Provide a brief summary of the work done.'
    const issues = checkFinalReporting('AGENTS.md', content)
    expect(issues).toHaveLength(1)
    expect(issues[0].category).toBe('final-reporting')
  })

  it('fails when only one strong field is present', () => {
    const content = 'Always list Files changed in your output.'
    const issues = checkFinalReporting('AGENTS.md', content)
    expect(issues).toHaveLength(1)
  })

  it('fails when content has no reporting guidance at all', () => {
    const content = 'Keep diffs focused and minimal. Do not skip tests.'
    const issues = checkFinalReporting('AGENTS.md', content)
    expect(issues).toHaveLength(1)
    expect(issues[0].severity).toBe('low')
  })

  it('returns the correct issue id and file path', () => {
    const issues = checkFinalReporting('CLAUDE.md', 'no reporting here')
    expect(issues[0].id).toBe('reporting-missing-CLAUDE.md')
    expect(issues[0].file).toBe('CLAUDE.md')
  })

  it('generated acd init template satisfies final reporting', () => {
    expect(checkFinalReporting('AGENTS.md', AGENTS_TEMPLATE)).toHaveLength(0)
  })

  describe('reporting guidance in ordinary language (#59)', () => {
    it('passes the issue #59 reproduction: a "## Reporting" section in plain words', () => {
      const content = [
        '# AGENTS',
        '',
        'Run `npm test` before you finish. Ask before adding dependencies; never commit to main.',
        '',
        '## Reporting',
        '',
        'When you finish, list the files you changed, the commands you ran and their results, and anything left undone.',
      ].join('\n')
      expect(checkFinalReporting('AGENTS.md', content)).toHaveLength(0)
    })

    it.each([
      'List the files you changed and the commands you ran.',
      'Summarize which files you modified and the tests you ran.',
      'Mention the commands you executed and anything left unfinished.',
      'Report the changed files and any open questions.',
      'Include the test results and any follow-ups.',
    ])('passes two report fields in other words: %s', (content) => {
      expect(checkFinalReporting('AGENTS.md', content)).toHaveLength(0)
    })

    it.each(['## Reporting', '### Report back', '## When you are done', '## Summary of changes'])(
      'passes a "%s" heading whose section names a report field',
      (heading) => {
        const content = `${heading}\n\nList the files you changed.\n\n## Other\n\nBe concise.`
        expect(checkFinalReporting('AGENTS.md', content)).toHaveLength(0)
      },
    )

    it('passes one field when the line asks for it in the final message', () => {
      const content = 'In your final message, list the files you changed.'
      expect(checkFinalReporting('AGENTS.md', content)).toHaveLength(0)
    })

    it('flags an empty "## Reporting" heading', () => {
      const content = '# AGENTS\n\n## Reporting\n\n## Testing\n\nRun the tests.'
      expect(checkFinalReporting('AGENTS.md', content)).toHaveLength(1)
    })

    it('flags a "## Reporting" heading whose section asks for nothing to report', () => {
      const content = '## Reporting\n\nBe brief and friendly.\n'
      expect(checkFinalReporting('AGENTS.md', content)).toHaveLength(1)
    })

    it('does not take a field under a later section for the reporting heading', () => {
      const content = '## Reporting\n\nBe brief.\n\n## Changes\n\nList the files you changed.'
      expect(checkFinalReporting('AGENTS.md', content)).toHaveLength(1)
    })

    it('does not treat a "Reporting bugs" heading as final-report guidance', () => {
      const content = '## Reporting bugs\n\nOpen an issue with the files you changed.'
      expect(checkFinalReporting('AGENTS.md', content)).toHaveLength(1)
    })

    it('flags a single report field without a final-report anchor', () => {
      const content = 'Keep a list of the files you changed.'
      expect(checkFinalReporting('AGENTS.md', content)).toHaveLength(1)
    })
  })
})
