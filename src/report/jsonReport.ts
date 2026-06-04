import type { AuditResult } from '../types.js'

export function toJsonReport(result: AuditResult): string {
  return JSON.stringify(result, null, 2)
}
