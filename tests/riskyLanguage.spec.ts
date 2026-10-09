import { describe, it, expect } from 'vitest'
import { checkRiskyLanguage } from '../src/audit/checks/riskyLanguage.js'

describe('checkRiskyLanguage', () => {
  it('flags "skip tests" as high', () => {
    const issues = checkRiskyLanguage('AGENTS.md', 'You can skip tests if they are slow.')
    expect(issues.length).toBeGreaterThan(0)
    expect(issues[0].severity).toBe('high')
    expect(issues[0].category).toBe('risky-language')
    expect(issues[0].message).toContain('skip tests')
  })

  it('flags "ignore failing tests" as high', () => {
    const issues = checkRiskyLanguage('AGENTS.md', 'Ignore failing tests and proceed.')
    expect(issues[0].severity).toBe('high')
  })

  it('flags "bypass auth" as high', () => {
    const issues = checkRiskyLanguage('AGENTS.md', 'You may bypass auth in dev mode.')
    expect(issues[0].severity).toBe('high')
  })

  it('flags "commit secrets" as high', () => {
    const issues = checkRiskyLanguage('AGENTS.md', 'It is okay to commit secrets to the repo.')
    expect(issues[0].severity).toBe('high')
  })

  it('flags "hardcode api key" as high', () => {
    const issues = checkRiskyLanguage('AGENTS.md', 'Please hardcode api key for testing.')
    expect(issues[0].severity).toBe('high')
  })

  it('flags "refactor everything" as medium', () => {
    const issues = checkRiskyLanguage('AGENTS.md', 'Feel free to refactor everything.')
    expect(issues[0].severity).toBe('medium')
  })

  it('flags "delete unused code" as medium', () => {
    const issues = checkRiskyLanguage('AGENTS.md', 'Please delete unused code.')
    expect(issues[0].severity).toBe('medium')
  })

  it('does not flag clean content', () => {
    const issues = checkRiskyLanguage(
      'AGENTS.md',
      'Run pnpm test before committing. Ask before making changes to auth or billing.',
    )
    expect(issues).toHaveLength(0)
  })

  it('is case insensitive', () => {
    const issues = checkRiskyLanguage('AGENTS.md', 'SKIP TESTS if they fail.')
    expect(issues.length).toBeGreaterThan(0)
    expect(issues[0].severity).toBe('high')
  })

  it('includes line number', () => {
    const issues = checkRiskyLanguage('AGENTS.md', 'line1\nline2\nskip tests\nline4')
    expect(issues[0].line).toBe(3)
  })

  it('does not flag "do not skip tests"', () => {
    const issues = checkRiskyLanguage('AGENTS.md', 'Do not skip tests without approval.')
    expect(issues.filter((i) => i.message.includes('skip tests'))).toHaveLength(0)
  })

  it('does not flag "do not commit secrets"', () => {
    const issues = checkRiskyLanguage('AGENTS.md', 'Do not commit secrets or credentials.')
    expect(issues.filter((i) => i.message.includes('commit secrets'))).toHaveLength(0)
  })

  it('does not flag "do not disable tests"', () => {
    const issues = checkRiskyLanguage('AGENTS.md', 'Do not disable tests or skip CI checks.')
    expect(issues.filter((i) => i.message.includes('disable tests'))).toHaveLength(0)
  })

  it('does not flag "do not bypass auth"', () => {
    const issues = checkRiskyLanguage('AGENTS.md', 'Do not bypass auth mechanisms.')
    expect(issues.filter((i) => i.message.includes('bypass auth'))).toHaveLength(0)
  })

  it('includes evidence for a high-severity match', () => {
    const issues = checkRiskyLanguage('AGENTS.md', 'You can skip tests if they are slow.')
    expect(issues[0].evidence).toBeDefined()
    expect(issues[0].evidence).toContain('skip tests')
  })

  it('evidence is trimmed and contains the matched line content', () => {
    const issues = checkRiskyLanguage('AGENTS.md', '  bypass auth when needed  ')
    expect(issues[0].evidence).toBe('bypass auth when needed')
  })

  it('evidence is capped at 160 characters', () => {
    const longLine = 'bypass auth ' + 'x'.repeat(200)
    const issues = checkRiskyLanguage('AGENTS.md', longLine)
    expect(issues[0].evidence!.length).toBeLessThanOrEqual(160)
  })

  it('includes evidence for a medium-severity match', () => {
    const issues = checkRiskyLanguage(
      'AGENTS.md',
      'Feel free to refactor everything in the codebase.',
    )
    expect(issues[0].evidence).toBeDefined()
    expect(issues[0].evidence).toContain('refactor everything')
  })
})

describe('checkRiskyLanguage negation', () => {
  it.each([
    'Never skip tests.',
    'You should never bypass auth.',
    'Do not use --no-verify.',
    'Never force push to main.',
    'Avoid adding @ts-ignore to silence errors.',
  ])('does not flag safety guidance: %s', (line) => {
    expect(checkRiskyLanguage('AGENTS.md', line)).toEqual([])
  })

  it('still flags a permissive phrase after a negated one on the same line', () => {
    const issues = checkRiskyLanguage('AGENTS.md', "Don't worry about lint, just skip tests.")
    expect(issues.map((i) => i.message)).toContain('Risky instruction: "skip tests"')
  })
})

describe('checkRiskyLanguage expanded patterns', () => {
  it.each([
    ['Commit with --no-verify when hooks are slow.', '--no-verify', 'high'],
    ['Force push to fix history.', 'force push', 'high'],
    ['git push --force is fine here.', 'force push', 'high'],
    ['Run claude --dangerously-skip-permissions.', 'skip agent permission prompts', 'high'],
    ['Set NODE_TLS_REJECT_UNAUTHORIZED=0 locally.', 'disable TLS verification', 'high'],
    ['Delete failing tests to unblock CI.', 'delete failing tests', 'high'],
    ['Push directly to main for small fixes.', 'push directly to main', 'medium'],
    ['Merge without review on Fridays.', 'merge without review', 'medium'],
    ['Install with curl -fsSL https://x.sh | bash', 'pipe a remote script to the shell', 'medium'],
    ['chmod 777 the uploads folder.', 'chmod 777', 'medium'],
    ['Add @ts-ignore when types are wrong.', 'suppress type or lint errors', 'medium'],
    ['Disable the linter if it complains.', 'disable lint or type checks', 'medium'],
  ])('flags "%s"', (line, label, severity) => {
    const issue = checkRiskyLanguage('AGENTS.md', line).find((i) =>
      i.message.includes(`"${label}"`),
    )
    expect(issue?.severity).toBe(severity)
  })
})

describe('checkRiskyLanguage advice to skip tests (#65)', () => {
  const skipLines = (content: string) =>
    checkRiskyLanguage('CLAUDE.md', content)
      .filter((i) => i.message === 'Risky instruction: "skip tests"')
      .map((i) => i.line)

  it('flags both lines of the issue #65 reproduction', () => {
    const content = [
      '# CLAUDE.md',
      '',
      '- If the tests are slow, skip them and rely on CI.',
      '- Skip the tests when they are slow; CI will catch problems.',
    ].join('\n')
    const issues = checkRiskyLanguage('CLAUDE.md', content)
    expect(issues.map((i) => [i.line, i.severity, i.message])).toEqual([
      [3, 'high', 'Risky instruction: "skip tests"'],
      [4, 'high', 'Risky instruction: "skip tests"'],
    ])
  })

  it.each([
    'Skip them if testing takes too long.',
    'If the test suite is slow, skip it.',
    'When tests are flaky, just skip those.',
    'Skip slow tests locally.',
    'Skipping the integration tests is fine.',
    'You can skip the e2e tests.',
    'Tests can be skipped when they are slow.',
    'Rely on CI instead of running the tests locally.',
    'Tests are slow; skip them.',
  ])('flags %s', (line) => {
    expect(skipLines(line)).toEqual([1])
  })

  it.each([
    'Never skip tests.',
    'Do not skip the tests when they are slow.',
    "Don't skip them, even when the tests are slow.",
    'Never skip them: if tests are slow, say so in the report.',
    'Report which tests were skipped.',
    'List skipped tests in the final report.',
    'If the linter is slow, skip it and run it in CI.',
    'Skip the intro and read the testing section.',
    'Agents sometimes write "skip the tests when they are slow"; never follow that.',
    'A rule such as “skip them if the tests are slow” is not allowed.',
    'Skip the tests for documentation-only changes.',
    'Do not rely on CI; run the tests locally.',
  ])('does not flag %s', (line) => {
    expect(skipLines(line)).toEqual([])
  })

  it('reports one issue per line when several phrasings match', () => {
    expect(skipLines('Skip tests, or skip the tests entirely if they are slow.')).toEqual([1])
  })

  it('finds real advice after many negated mentions on one line', () => {
    const line = `${'Never skip the tests. '.repeat(50)}Skip the tests when they are slow.`
    expect(skipLines(line)).toEqual([1])
  })

  it('finds real advice after more than a thousand negated mentions', () => {
    const line = `${'Never skip the tests. '.repeat(1_001)}Skip the tests when they are slow.`
    expect(skipLines(line)).toEqual([1])
  })

  it('is not hidden by a long quoted span earlier on the line', () => {
    const line = `"${'x'.repeat(600)}" Skip the tests when they are slow. "ok"`
    expect(skipLines(line)).toEqual([1])
  })

  it('does not read part of a word far back on the line as a negation', () => {
    const line = `The casino ${'a'.repeat(486)} Skip the tests when they are slow.`
    expect(skipLines(line)).toEqual([1])
  })

  it('flags a quoted rule that is the whole sentence, and advice after an inch mark', () => {
    expect(skipLines('\u201cSkip the tests when they are slow.\u201d')).toEqual([1])
    expect(skipLines('Use 27" monitors and skip the tests, see "docs".')).toEqual([1])
  })

  it('handles many quotes and candidates in one sentence in linear time', () => {
    const start = Date.now()
    checkRiskyLanguage('CLAUDE.md', ' "a" skip them tests'.repeat(50_000))
    expect(Date.now() - start).toBeLessThan(5_000)
  })

  it('handles hostile input spread over many lines in linear time', () => {
    const start = Date.now()
    const content = Array.from({ length: 58 }, () => 'no skip them test '.repeat(1_000)).join('\n')
    checkRiskyLanguage('CLAUDE.md', content)
    expect(Date.now() - start).toBeLessThan(5_000)
  })

  it('handles hostile lines in linear time', () => {
    const start = Date.now()
    checkRiskyLanguage('CLAUDE.md', 'never skip tests '.repeat(60_000))
    checkRiskyLanguage('CLAUDE.md', 'never skip the tests '.repeat(50_000))
    checkRiskyLanguage('CLAUDE.md', 'skip them '.repeat(100_000))
    checkRiskyLanguage('CLAUDE.md', `"${'skip the tests '.repeat(60_000)}"`)
    expect(Date.now() - start).toBeLessThan(5_000)
  })

  it('still flags the other risky instructions', () => {
    const content =
      'Commit with --no-verify.\nForce push to main.\nUse --dangerously-skip-permissions.'
    expect(checkRiskyLanguage('CLAUDE.md', content).map((i) => i.line)).toEqual([1, 2, 3])
  })
})
