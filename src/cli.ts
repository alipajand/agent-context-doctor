#!/usr/bin/env node
import { Command } from 'commander'
import path from 'node:path'
import { auditRepo } from './audit/auditRepo.js'
import { detectContextFiles } from './audit/detectContextFiles.js'
import { printTerminalReport } from './report/terminalReport.js'
import { toJsonReport } from './report/jsonReport.js'
import { toMarkdownReport } from './report/markdownReport.js'
import { writeReport } from './fs/writeReport.js'
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
  .action(async (repoPath: string | undefined, opts: { json?: boolean; output?: string; failOn?: string }) => {
    const resolvedRepo = path.resolve(repoPath ?? process.cwd())

    if (!opts.json) {
      process.stderr.write(`Auditing ${resolvedRepo}...\n`)
    }

    const result = await auditRepo(resolvedRepo)

    if (opts.output) {
      const mdContent = toMarkdownReport(result)
      const writtenPath = await writeReport(opts.output, mdContent, resolvedRepo)
      if (!opts.json) {
        process.stderr.write(`Markdown report written to ${writtenPath}\n`)
      } else {
        process.stderr.write(`Markdown report written to ${writtenPath}\n`)
      }
    }

    if (opts.json) {
      process.stdout.write(toJsonReport(result) + '\n')
    } else {
      printTerminalReport(result)
    }

    if (opts.failOn) {
      const sev = opts.failOn as Severity
      if (!['low', 'medium', 'high'].includes(sev)) {
        process.stderr.write(`Invalid --fail-on value: "${sev}". Use low, medium, or high.\n`)
        process.exit(1)
      }
      if (shouldFail(result, sev)) {
        process.exit(1)
      }
    }
  })

program
  .command('list [repoPath]')
  .description('List detected agent context files in the repository')
  .action(async (repoPath: string | undefined) => {
    const resolvedRepo = path.resolve(repoPath ?? process.cwd())
    const files = await detectContextFiles(resolvedRepo)

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
