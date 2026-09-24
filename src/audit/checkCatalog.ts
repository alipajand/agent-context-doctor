import type { ValidCheck } from '../config/schema.js'

export type CheckInfo = {
  id: ValidCheck
  severity: string
  appliesTo: string
  description: string
}

/** Every check that `rules.disabledChecks` accepts, for `acd checks` and library users. */
export const CHECKS: readonly CheckInfo[] = [
  {
    id: 'risky-language',
    severity: 'high/medium',
    appliesTo: 'all context files',
    description: 'Permission to skip tests, bypass auth, commit secrets, force push, and similar',
  },
  {
    id: 'hidden-characters',
    severity: 'high/medium',
    appliesTo: 'all context files',
    description: 'Invisible Unicode (tag characters, bidi controls, zero-width) that hides text',
  },
  {
    id: 'secrets',
    severity: 'high/medium',
    appliesTo: 'all context files',
    description: 'Credentials pasted into instructions (evidence is redacted)',
  },
  {
    id: 'placeholder-content',
    severity: 'medium',
    appliesTo: 'all context files',
    description: 'TODO/TBD markers, lorem ipsum, and unfilled template sections',
  },
  {
    id: 'command-alignment',
    severity: 'medium/low',
    appliesTo: 'all context files',
    description: 'Referenced package scripts or make targets that do not exist',
  },
  {
    id: 'broken-references',
    severity: 'medium',
    appliesTo: 'all context files',
    description: 'Links, inline-code paths, and @imports to files that do not exist',
  },
  {
    id: 'safety-boundaries',
    severity: 'medium',
    appliesTo: 'primary files',
    description: 'No ask-before or forbidden-change guidance for auth, billing, data, production',
  },
  {
    id: 'validation-commands',
    severity: 'medium',
    appliesTo: 'primary files',
    description: 'No guidance to run tests, lint, typecheck, or build',
  },
  {
    id: 'final-reporting',
    severity: 'low',
    appliesTo: 'primary files',
    description: 'No guidance on what to include in the final report',
  },
  {
    id: 'file-size',
    severity: 'low',
    appliesTo: 'primary files',
    description: 'Instruction file over the size budget (rules.maxFileBytes)',
  },
  {
    id: 'contradictions',
    severity: 'high/medium',
    appliesTo: 'across files',
    description: 'Directives that contradict each other, such as always/never run tests',
  },
  {
    id: 'agent-config',
    severity: 'high/medium/low',
    appliesTo: 'agent config files',
    description: 'Risky Claude Code permissions and MCP servers (unpinned, plain HTTP, secrets)',
  },
]
