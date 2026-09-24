import type { ContextIssue } from '../../types.js'

/** Default soft budget for a primary instruction file, roughly 10k tokens. */
export const DEFAULT_MAX_FILE_BYTES = 40_000

export function checkFileSize(filePath: string, content: string, maxBytes: number): ContextIssue[] {
  const bytes = Buffer.byteLength(content, 'utf-8')
  if (bytes <= maxBytes) return []

  const kb = (n: number) => `${Math.round(n / 1000)} KB`
  return [
    {
      id: `file-size-budget-${filePath}`,
      severity: 'low',
      category: 'file-size',
      file: filePath,
      message: `Instruction file is ${kb(bytes)}, over the ${kb(maxBytes)} budget`,
      recommendation:
        'Agents load primary instruction files into every session. Move reference material into linked docs and keep standing instructions short.',
    },
  ]
}
