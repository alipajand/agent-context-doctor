import { z } from 'zod'

const VALID_CHECKS = [
  'placeholder-content',
  'safety-boundaries',
  'validation-commands',
  'final-reporting',
  'risky-language',
  'command-alignment',
  'contradictions',
  'hidden-characters',
  'secrets',
] as const

export const OUTPUT_FORMATS = ['terminal', 'json', 'markdown', 'sarif', 'github'] as const
export type OutputFormat = (typeof OUTPUT_FORMATS)[number]

export const AcdRcSchema = z.object({
  audit: z
    .object({
      repoPath: z.string().optional(),
      output: z.string().optional(),
      json: z.boolean().optional(),
      format: z.enum(OUTPUT_FORMATS).optional(),
      failOn: z.enum(['low', 'medium', 'high']).optional(),
      minScore: z.number().int().min(0).max(100).optional(),
      baseline: z.string().optional(),
    })
    .optional(),
  rules: z
    .object({
      ignoreFiles: z.array(z.string()).optional(),
      disabledChecks: z.array(z.enum(VALID_CHECKS)).optional(),
      allowedMissingScripts: z.array(z.string()).optional(),
    })
    .optional(),
})

export type AcdRc = z.infer<typeof AcdRcSchema>
export type ValidCheck = (typeof VALID_CHECKS)[number]
