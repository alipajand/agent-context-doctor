#!/usr/bin/env node
import { Command } from 'commander'
import path from 'node:path'
import { auditRepo } from './audit/auditRepo.js'
import { detectContextFiles } from './audit/detectContextFiles.js'
import { printTerminalReport } from './report/terminalReport.js'
import { toJsonReport } from './report/jsonReport.js'
import { toMarkdownReport } from './report/markdownReport.js'
import { writeReport } from './fs/writeReport.js'
import { loadConfig } from './config/loadConfig.js'
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

const program = new Command()

program
  .name('acd')
  .description('Audit repository agent context files for quality, safety, and completeness.')
  .version('0.1.0')

program
  .command('audit [repoPath]')
  .description('Audit agent context files in the repository')
  .option('--json', 'Output results as JSON to stdout')
  .option('--output <path>', 'Write Markdown report to a file')
  .option(
    '--fail-on <severity>',
    'Exit non-zero if any issue at or above this severity is found (low|medium|high)',
  )
  .action(
    async (
      cliRepoPath: string | undefined,
      opts: { json?: boolean; output?: string; failOn?: string },
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
      const resolvedRepo = cliRepoPath
        ? path.resolve(cliRepoPath)
        : config?.audit?.repoPath
          ? path.resolve(configSearchDir, config.audit.repoPath)
          : path.resolve(process.cwd())

      // CLI flags override config
      const useJson = opts.json ?? config?.audit?.json ?? false
      const outputPath = opts.output ?? config?.audit?.output
      const failOnRaw = opts.failOn ?? config?.audit?.failOn

      if (!useJson) {
        process.stderr.write(`Auditing ${resolvedRepo}...\n`)
      }

      const result = await auditRepo(resolvedRepo, {
        ignoreFiles: config?.rules?.ignoreFiles,
        disabledChecks: config?.rules?.disabledChecks,
        allowedMissingScripts: config?.rules?.allowedMissingScripts,
      })

      if (outputPath) {
        const mdContent = toMarkdownReport(result)
        const writtenPath = await writeReport(outputPath, mdContent, resolvedRepo)
        process.stderr.write(`Markdown report written to ${writtenPath}\n`)
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
      console.log(`No agent context files found in ${resolvedRepo}`)
    } else {
      console.log(`Agent context files in ${resolvedRepo}:`)
      for (const f of files) {
        console.log(`  ${f.path}  [${f.kind}]  ${f.bytes}B`)
      }
    }
  })

program.parseAsync(process.argv).catch((err: unknown) => {
  process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})
