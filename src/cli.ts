#!/usr/bin/env node
import { Command } from 'commander'
import path from 'node:path'
import { auditRepo } from './audit/auditRepo.js'
import { detectContextFiles } from './audit/detectContextFiles.js'
import { printTerminalReport } from './report/terminalReport.js'
import { toJsonReport } from './report/jsonReport.js'
import { toMarkdownReport } from './report/markdownReport.js'
import { writeReport } from './fs/writeReport.js'
import { OutputPathError, resolveOutputPath } from './fs/resolveOutputPath.js'
import { isWithin } from './fs/safePath.js'
import { toDisplayText } from './text/displayText.js'
import { loadConfig } from './config/loadConfig.js'
import { initRepo } from './init/initRepo.js'
import { AGENTS_TEMPLATE } from './init/template.js'
import { VERSION } from './version.js'
import { applyBaseline, BaselineError, loadBaseline } from './audit/baseline.js'
import { CHECKS } from './audit/checkCatalog.js'
import { OUTPUT_FORMATS } from './config/schema.js'
import type { OutputFormat } from './config/schema.js'
import { toGithubAnnotations } from './report/githubReport.js'
import { toSarifReport } from './report/sarifReport.js'
import type { AuditResult, Severity } from './types.js'

const SEVERITY_ORDER: Record<Severity, number> = {
  low: 0,
  medium: 1,
  high: 2,
}

// Issues already recorded in a baseline never fail the run on their own.
function shouldFail(result: AuditResult, failOn: Severity): boolean {
  const threshold = SEVERITY_ORDER[failOn]
  return result.issues.some((i) => !i.inBaseline && SEVERITY_ORDER[i.severity] >= threshold)
}

function resolveFormat(
  opts: { json?: boolean; format?: string },
  auditConfig: { json?: boolean; format?: OutputFormat } | undefined,
): OutputFormat {
  const requested =
    opts.format ??
    (opts.json ? 'json' : undefined) ??
    auditConfig?.format ??
    (auditConfig?.json ? 'json' : 'terminal')
  if (!(OUTPUT_FORMATS as readonly string[]).includes(requested)) {
    fail(`Invalid format: "${requested}". Use ${OUTPUT_FORMATS.join(', ')}.`)
  }
  return requested as OutputFormat
}

function parseFailOn(value: string | undefined): Severity | undefined {
  if (value === undefined) return undefined
  if (!['low', 'medium', 'high'].includes(value)) {
    fail(`Invalid fail-on value: "${value}". Use low, medium, or high.`)
  }
  return value as Severity
}

function parseMinScore(value: string | number | undefined): number | undefined {
  if (value === undefined) return undefined
  const score = Number(value)
  if (!Number.isInteger(score) || score < 0 || score > 100) {
    fail(`Invalid min-score value: "${value}". Use an integer from 0 to 100.`)
  }
  return score
}

function printResult(result: AuditResult, format: OutputFormat): void {
  switch (format) {
    case 'json':
      process.stdout.write(toJsonReport(result) + '\n')
      return
    case 'markdown':
      process.stdout.write(toMarkdownReport(result) + '\n')
      return
    case 'sarif':
      process.stdout.write(toSarifReport(result) + '\n')
      return
    case 'github':
      process.stdout.write(toGithubAnnotations(result) + '\n')
      return
    case 'terminal':
      printTerminalReport(result)
  }
}

function fail(message: string): never {
  process.stderr.write(`${message}\n`)
  process.exit(1)
}

function resolveOutputOrExit(repoPath: string, output: string, allowOutside: boolean): string {
  try {
    return resolveOutputPath(repoPath, output, { allowOutside })
  } catch (err) {
    if (err instanceof OutputPathError) fail(err.message)
    throw err
  }
}

const program = new Command()

program
  .name('acd')
  .description('Audit repository agent context files for quality, safety, and completeness.')
  .version(VERSION)

program
  .command('audit [repoPath]')
  .description('Audit agent context files in the repository')
  .option('--json', 'Output results as JSON to stdout')
  .option('--output <path>', 'Write Markdown report to a file inside the audited repo')
  .option('--allow-outside', 'Allow --output to write outside the audited repository')
  .option(
    '--format <format>',
    `Output format for stdout (${OUTPUT_FORMATS.join('|')}). --json is shorthand for --format json`,
  )
  .option(
    '--fail-on <severity>',
    'Exit non-zero if any issue at or above this severity is found (low|medium|high)',
  )
  .option('--min-score <score>', 'Exit non-zero if the score is below this value (0-100)')
  .option(
    '--baseline <file>',
    'A previous `acd audit --json` report; issues it already lists do not trigger --fail-on',
  )
  .action(
    async (
      cliRepoPath: string | undefined,
      opts: {
        json?: boolean
        format?: string
        output?: string
        allowOutside?: boolean
        failOn?: string
        minScore?: string
        baseline?: string
      },
    ) => {
      // Determine config search dir: CLI path if given, otherwise cwd
      const configSearchDir = path.resolve(cliRepoPath ?? process.cwd())
      let config = null
      try {
        config = await loadConfig(configSearchDir)
      } catch (err) {
        process.stderr.write(`Config error: ${err instanceof Error ? err.message : String(err)}\n`)
        process.exit(1)
      }

      // Resolve repoPath: CLI arg > config.audit.repoPath > cwd
      let resolvedRepo = path.resolve(cliRepoPath ?? process.cwd())
      if (!cliRepoPath && config?.audit?.repoPath) {
        resolvedRepo = path.resolve(configSearchDir, config.audit.repoPath)
        if (!isWithin(configSearchDir, resolvedRepo)) {
          fail(`Config error: audit.repoPath must stay inside ${configSearchDir}`)
        }
      }

      // CLI flags override config
      const format = resolveFormat(opts, config?.audit)
      const failOn = parseFailOn(opts.failOn ?? config?.audit?.failOn)
      const minScore = parseMinScore(opts.minScore ?? config?.audit?.minScore)

      // --allow-outside only widens a path the user typed; a path from .acdrc
      // comes from the audited repository and is always confined to it.
      const allowOutside = opts.allowOutside === true && opts.output !== undefined
      let outputPath: string | undefined
      if (opts.output) {
        outputPath = resolveOutputOrExit(resolvedRepo, opts.output, allowOutside)
      } else if (config?.audit?.output) {
        try {
          outputPath = resolveOutputPath(resolvedRepo, config.audit.output)
        } catch (err) {
          if (!(err instanceof OutputPathError)) throw err
          fail(`Config error: audit.output must resolve inside ${resolvedRepo}`)
        }
      }

      // A baseline typed on the command line is the user's file; one from
      // .acdrc must live inside the audited repository.
      let baselinePath: string | undefined
      if (opts.baseline) {
        baselinePath = path.resolve(opts.baseline)
      } else if (config?.audit?.baseline) {
        baselinePath = path.resolve(resolvedRepo, config.audit.baseline)
        if (!isWithin(resolvedRepo, baselinePath)) {
          fail(`Config error: audit.baseline must stay inside ${resolvedRepo}`)
        }
      }

      if (format === 'terminal') {
        process.stderr.write(`Auditing ${toDisplayText(resolvedRepo)}...\n`)
      }

      let result = await auditRepo(resolvedRepo, {
        ignoreFiles: config?.rules?.ignoreFiles,
        disabledChecks: config?.rules?.disabledChecks,
        allowedMissingScripts: config?.rules?.allowedMissingScripts,
        maxFileBytes: config?.rules?.maxFileBytes,
      })

      if (baselinePath) {
        try {
          result = applyBaseline(result, await loadBaseline(baselinePath), baselinePath)
        } catch (err) {
          if (err instanceof BaselineError) fail(`Baseline error: ${err.message}`)
          throw err
        }
      }

      if (outputPath) {
        const mdContent = toMarkdownReport(result)
        try {
          const writtenPath = await writeReport(outputPath, mdContent, resolvedRepo, {
            allowOutside,
          })
          process.stderr.write(`Markdown report written to ${writtenPath}\n`)
        } catch (err) {
          if (err instanceof OutputPathError) fail(err.message)
          throw err
        }
      }

      printResult(result, format)

      const failingIssue = failOn && shouldFail(result, failOn)
      const belowMinScore = minScore !== undefined && result.score.total < minScore
      if (belowMinScore) {
        process.stderr.write(`Score ${result.score.total} is below --min-score ${minScore}.\n`)
      }
      if (failingIssue || belowMinScore) {
        process.exit(1)
      }
    },
  )

program
  .command('list [repoPath]')
  .description('List detected agent context files in the repository')
  .action(async (repoPath: string | undefined) => {
    const resolvedRepo = path.resolve(repoPath ?? process.cwd())

    let config = null
    try {
      config = await loadConfig(resolvedRepo)
    } catch (err) {
      process.stderr.write(`Config error: ${err instanceof Error ? err.message : String(err)}\n`)
      process.exit(1)
    }

    const files = await detectContextFiles(resolvedRepo, config?.rules?.ignoreFiles)

    if (files.length === 0) {
      console.log(`No agent context files found in ${toDisplayText(resolvedRepo)}`)
    } else {
      console.log(`Agent context files in ${toDisplayText(resolvedRepo)}:`)
      for (const f of files) {
        const size = f.skipped ? `not read: ${f.skipped}` : `${f.bytes}B`
        console.log(`  ${toDisplayText(f.path)}  [${f.kind}]  ${size}`)
      }
    }
  })

program
  .command('init [repoPath]')
  .description('Create a starter AGENTS.md in the repository')
  .option('--force', 'Overwrite an existing AGENTS.md')
  .option('--print', 'Print the template to stdout without writing any files')
  .action(async (cliRepoPath: string | undefined, opts: { force?: boolean; print?: boolean }) => {
    if (opts.print) {
      process.stdout.write(AGENTS_TEMPLATE)
      return
    }

    const result = await initRepo(cliRepoPath ?? process.cwd(), { force: opts.force })

    if (result.status === 'already-exists') {
      process.stderr.write('AGENTS.md already exists. Use --force to overwrite.\n')
      process.exit(1)
    }

    if (result.status === 'symlink') {
      fail('AGENTS.md is a symbolic link. Refusing to write through it; remove the link first.')
    }

    const verb = result.status === 'created' ? 'Created' : 'Overwrote'
    process.stderr.write(`${verb} ${result.path}\n`)
  })

program
  .command('checks')
  .description('List the checks acd runs and the IDs accepted by rules.disabledChecks')
  .option('--json', 'Output the check catalog as JSON')
  .action((opts: { json?: boolean }) => {
    if (opts.json) {
      process.stdout.write(JSON.stringify(CHECKS, null, 2) + '\n')
      return
    }
    const width = Math.max(...CHECKS.map((c) => c.id.length))
    for (const check of CHECKS) {
      console.log(`${check.id.padEnd(width)}  ${check.severity.padEnd(15)} ${check.appliesTo}`)
      console.log(`${' '.repeat(width)}  ${check.description}`)
    }
  })

program.parseAsync(process.argv).catch((err: unknown) => {
  process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})
