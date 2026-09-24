import type { ContextIssue, Severity } from '../../types.js'

type Frontmatter = { fields: Map<string, string>; endLine: number }

/**
 * Parse a leading `---` YAML frontmatter block into top-level `key: value`
 * pairs. Only the shape tools rely on is needed, so nested YAML is kept as the
 * raw text after the colon. Returns null when there is no frontmatter, and
 * `endLine: -1` when it is never closed.
 */
export function parseFrontmatter(content: string): Frontmatter | null {
  const text = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content
  const lines = text.split('\n')
  if (lines[0]?.trim() !== '---') return null

  const fields = new Map<string, string>()
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (line.trim() === '---') return { fields, endLine: i + 1 }
    const match = /^([A-Za-z][\w-]*)\s*:\s*(.*)$/.exec(line)
    if (match) fields.set(match[1], match[2].trim())
  }
  return { fields, endLine: -1 }
}

function hasValue(fields: Map<string, string>, key: string): boolean {
  const value = fields.get(key)
  if (value === undefined) return false
  return !/^(?:|""|''|\[\]|null|~)$/.test(value)
}

type Rule = {
  appliesTo: (rel: string) => boolean
  tool: string
  check: (fm: Frontmatter | null) => { severity: Severity; message: string } | null
}

const RULES: Rule[] = [
  {
    tool: 'Cursor rule',
    appliesTo: (rel) => /^\.cursor\/rules\/.+\.mdc$/.test(rel),
    check: (fm) => {
      if (!fm) {
        return {
          severity: 'low',
          message: 'Cursor rule has no frontmatter, so it is only applied when mentioned by name',
        }
      }
      const always = fm.fields.get('alwaysApply')?.toLowerCase() === 'true'
      if (always || hasValue(fm.fields, 'globs') || hasValue(fm.fields, 'description')) return null
      return {
        severity: 'medium',
        message:
          'Cursor rule is never applied: it sets no alwaysApply: true, globs, or description',
      }
    },
  },
  {
    tool: 'Claude subagent',
    appliesTo: (rel) => /^\.claude\/agents\/.+\.md$/.test(rel),
    check: (fm) => {
      const missing = ['name', 'description'].filter((k) => !fm || !hasValue(fm.fields, k))
      if (missing.length === 0) return null
      return {
        severity: 'medium',
        message: `Claude subagent is missing frontmatter ${missing.join(' and ')}, so Claude Code cannot load or route to it`,
      }
    },
  },
  {
    tool: 'Claude skill',
    appliesTo: (rel) => /^\.claude\/skills\/.+\/SKILL\.md$/.test(rel),
    check: (fm) => {
      const missing = ['name', 'description'].filter((k) => !fm || !hasValue(fm.fields, k))
      if (missing.length === 0) return null
      return {
        severity: 'medium',
        message: `Claude skill is missing frontmatter ${missing.join(' and ')}, so it will not be offered`,
      }
    },
  },
  {
    tool: 'Copilot instructions',
    appliesTo: (rel) => /^\.github\/instructions\/.+\.instructions\.md$/.test(rel),
    check: (fm) => {
      if (fm && hasValue(fm.fields, 'applyTo')) return null
      return {
        severity: 'low',
        message:
          'Copilot instructions file has no applyTo pattern, so it is only used when attached by hand',
      }
    },
  },
]

/**
 * Tool-specific files that the tool silently ignores when their frontmatter
 * is missing, unclosed, or incomplete.
 */
export function checkFrontmatter(filePath: string, content: string): ContextIssue[] {
  const rel = filePath.replace(/\\/g, '/')
  const rule = RULES.find((r) => r.appliesTo(rel))
  if (!rule) return []

  const fm = parseFrontmatter(content)
  if (fm && fm.endLine === -1) {
    return [
      {
        id: `frontmatter-unclosed-${filePath}`,
        severity: 'medium',
        category: 'frontmatter',
        file: filePath,
        line: 1,
        message: `${rule.tool} frontmatter is never closed with ---, so the whole file is read as metadata`,
        recommendation: 'Close the frontmatter block with a line containing only ---.',
      },
    ]
  }

  const finding = rule.check(fm)
  if (!finding) return []
  return [
    {
      id: `frontmatter-${filePath}`,
      severity: finding.severity,
      category: 'frontmatter',
      file: filePath,
      line: 1,
      message: finding.message,
      recommendation:
        'Add the frontmatter fields the tool needs so the file is actually loaded; see the tool documentation for the expected keys.',
    },
  ]
}
