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
import type { Severity } from './types.js'

const SEVERITY_ORDER: Record<Severity, number> = {
  low: 0,
  medium: 1,
  high: 2,
}

function shouldFail(result: { issues: Array<{ severity: Severity }> }, failOn: Severity): boolean {
  const threshold = SEVERITY_ORDER[failOn]
  return result.issues.some((i) => SEVERITY_ORDER[i.severity] >= threshold)
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
    '--fail-on <severity>',
    'Exit non-zero if any issue at or above this severity is found (low|medium|high)',
  )
  .action(
    async (
      cliRepoPath: string | undefined,
      opts: { json?: boolean; output?: string; allowOutside?: boolean; failOn?: string },
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
      const useJson = opts.json ?? config?.audit?.json ?? false
      const failOnRaw = opts.failOn ?? config?.audit?.failOn

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

      if (!useJson) {
        process.stderr.write(`Auditing ${toDisplayText(resolvedRepo)}...\n`)
      }

      const result = await auditRepo(resolvedRepo, {
        ignoreFiles: config?.rules?.ignoreFiles,
        disabledChecks: config?.rules?.disabledChecks,
        allowedMissingScripts: config?.rules?.allowedMissingScripts,
      })

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

      if (useJson) {
        process.stdout.write(toJsonReport(result) + '\n')
      } else {
        printTerminalReport(result)
      }

      if (failOnRaw) {
        const sev = failOnRaw as Severity
        if (!['low', 'medium', 'high'].includes(sev)) {
          process.stderr.write(`Invalid fail-on value: "${sev}". Use low, medium, or high.\n`)
          process.exit(1)
        }
        if (shouldFail(result, sev)) {
          process.exit(1)
        }
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

program.parseAsync(process.argv).catch((err: unknown) => {
  process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})
