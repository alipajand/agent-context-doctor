import { describe, it, expect } from 'vitest'
import { checkValidationCommands } from '../src/audit/checks/validationCommands.js'
import { AGENTS_TEMPLATE } from '../src/init/template.js'

describe('checkValidationCommands', () => {
  it('passes when content mentions test', () => {
    expect(checkValidationCommands('AGENTS.md', 'Run the test suite.')).toHaveLength(0)
  })

  it('passes when content mentions lint', () => {
    expect(checkValidationCommands('AGENTS.md', 'Make sure to lint your code.')).toHaveLength(0)
  })

  it('passes when content mentions typecheck', () => {
    expect(checkValidationCommands('AGENTS.md', 'Always typecheck before pushing.')).toHaveLength(0)
  })

  it('passes when content mentions build', () => {
    expect(checkValidationCommands('AGENTS.md', 'Verify the build passes.')).toHaveLength(0)
  })

  it('passes when content mentions format', () => {
    expect(checkValidationCommands('AGENTS.md', 'Run format before committing.')).toHaveLength(0)
  })

  it('is case-insensitive', () => {
    expect(checkValidationCommands('AGENTS.md', 'RUN THE TEST SUITE.')).toHaveLength(0)
  })

  it('flags content with no validation guidance', () => {
    const issues = checkValidationCommands('AGENTS.md', 'Be helpful and concise.')
    expect(issues).toHaveLength(1)
    expect(issues[0].category).toBe('validation-commands')
    expect(issues[0].severity).toBe('medium')
  })

  it('returns the correct issue id and file path', () => {
    const issues = checkValidationCommands('CLAUDE.md', 'nothing relevant')
    expect(issues[0].id).toBe('validation-missing-CLAUDE.md')
    expect(issues[0].file).toBe('CLAUDE.md')
    expect(issues[0].message).toBe('No validation commands mentioned')
  })

  it('flags empty content', () => {
    expect(checkValidationCommands('AGENTS.md', '')).toHaveLength(1)
  })

  it('generated acd init template satisfies validation commands', () => {
    expect(checkValidationCommands('AGENTS.md', AGENTS_TEMPLATE)).toHaveLength(0)
  })

  describe('non-Node toolchains (#60)', () => {
    it('passes the issue #60 reproduction: ruff and pytest under a validation heading', () => {
      const content = [
        '# AGENTS',
        '',
        '## Validate before finishing',
        '',
        '```bash',
        'ruff check .',
        'pytest',
        '```',
        '',
        'Never commit or push. Report the files changed and commands run.',
      ].join('\n')
      expect(checkValidationCommands('AGENTS.md', content)).toHaveLength(0)
    })

    it.each([
      ['Python', 'Run `pytest -q` before finishing.'],
      ['Python', 'Run `ruff check .` and fix what it reports.'],
      ['Python', 'Run `mypy src` before finishing.'],
      ['Python', 'Run `pyright` on changed modules.'],
      ['Python', 'Run `python -m unittest discover`.'],
      ['Python', 'Run `tox -e py312`.'],
      ['Python', 'Run `flake8` on changed files.'],
      ['Go', 'Run `go vet ./...` before finishing.'],
      ['Go', 'Run `golangci-lint run`.'],
      ['Rust', 'Run `cargo clippy -- -D warnings`.'],
      ['Rust', 'Run `cargo check` before finishing.'],
      ['Rust', 'Run `cargo fmt --check`.'],
      ['Rust', 'Run `cargo nextest run`.'],
      ['make', 'Run `make check` before finishing.'],
      ['JVM', 'Run `./gradlew check`.'],
      ['JVM', 'Run `mvn verify`.'],
    ])('recognises a %s validation command: %s', (_ecosystem, content) => {
      expect(checkValidationCommands('AGENTS.md', content)).toHaveLength(0)
    })

    it.each([
      'Run `go test ./...`.',
      'Run `cargo test`.',
      'Run `make test`.',
      'Run `npm test`.',
      'Run `pnpm typecheck`.',
      'Run `yarn lint`.',
      'Run `bun run build`.',
    ])('still recognises %s', (content) => {
      expect(checkValidationCommands('AGENTS.md', content)).toHaveLength(0)
    })

    it.each([
      'Use `go run ./cmd/server` to start the app.',
      'Run `cargo run` to try it out.',
      'Run `make install` to set up.',
      'Run `python manage.py runserver`.',
      'Check the README before you start.',
      'Go to the dashboard and check the logs.',
    ])('does not treat an arbitrary command as validation: %s', (content) => {
      expect(checkValidationCommands('AGENTS.md', content)).toHaveLength(1)
    })

    it('names commands from several ecosystems in the recommendation', () => {
      const [issue] = checkValidationCommands('AGENTS.md', 'Be helpful.')
      expect(issue.recommendation).toContain('pytest')
      expect(issue.recommendation).toContain('go test')
      expect(issue.recommendation).toContain('cargo test')
    })
  })
})
