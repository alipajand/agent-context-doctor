import { VERSION } from '../version.js'
import { issueLocations } from './locations.js'
import type { AuditResult, ContextIssue, Severity } from '../types.js'

const LEVEL: Record<Severity, 'error' | 'warning' | 'note'> = {
  high: 'error',
  medium: 'warning',
  low: 'note',
}

const RULE_DESCRIPTIONS: Record<string, string> = {
  presence: 'Repository has no agent context files',
  'placeholder-content': 'Unfilled template or placeholder content',
  'risky-language': 'Instruction permits skipping validation or unsafe actions',
  'hidden-characters': 'Invisible Unicode that can hide instructions from reviewers',
  secrets: 'Credential pasted into an agent instruction file',
  'safety-boundaries': 'No ask-before or forbidden-change guidance',
  'validation-commands': 'No test, lint, or build guidance',
  'final-reporting': 'No final report guidance',
  'command-alignment': 'Referenced command does not exist',
  contradictions: 'Instruction files contradict each other',
  suppressions: 'Unknown acd suppression category',
  'file-access': 'Context file could not be read safely',
  'file-size': 'Context file is too large to audit',
}

function rule(category: string, sample: ContextIssue) {
  return {
    id: category,
    name: category,
    shortDescription: { text: RULE_DESCRIPTIONS[category] ?? category },
    help: { text: sample.recommendation },
    defaultConfiguration: { level: LEVEL[sample.severity] },
    properties: { tags: ['agent-context'] },
  }
}

/**
 * SARIF 2.1.0 for GitHub code scanning and other SARIF consumers. Paths are
 * relative to `baseDir` so they line up with the checkout root when uploaded.
 */
export function toSarifReport(result: AuditResult, baseDir: string = process.cwd()): string {
  const rules = new Map<string, ReturnType<typeof rule>>()
  for (const issue of result.issues) {
    if (!rules.has(issue.category)) rules.set(issue.category, rule(issue.category, issue))
  }

  const results = result.issues.map((issue) => {
    const locations = issueLocations(result, issue, baseDir).map((uri) => ({
      physicalLocation: {
        artifactLocation: { uri },
        ...(issue.line ? { region: { startLine: issue.line } } : {}),
      },
    }))
    return {
      ruleId: issue.category,
      level: LEVEL[issue.severity],
      message: { text: `${issue.message}. ${issue.recommendation}` },
      ...(locations.length > 0 ? { locations } : {}),
      ...(issue.fingerprint ? { partialFingerprints: { 'acdIssue/v1': issue.fingerprint } } : {}),
      ...(result.baseline ? { baselineState: issue.inBaseline ? 'unchanged' : 'new' } : {}),
      properties: { severity: issue.severity },
    }
  })

  return JSON.stringify(
    {
      $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
      version: '2.1.0',
      runs: [
        {
          tool: {
            driver: {
              name: 'agent-context-doctor',
              version: VERSION,
              informationUri: 'https://github.com/alipajand/agent-context-doctor',
              rules: [...rules.values()],
            },
          },
          results,
          properties: { score: result.score.total, grade: result.score.grade },
        },
      ],
    },
    null,
    2,
  )
}
