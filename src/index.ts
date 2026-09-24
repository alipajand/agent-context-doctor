export { auditRepo } from './audit/auditRepo.js'
export type { AuditOptions } from './audit/auditRepo.js'
export { detectContextFiles, isPrimaryInstructionFile } from './audit/detectContextFiles.js'
export { applyBaseline, BaselineError, fingerprintIssue, loadBaseline } from './audit/baseline.js'
export { CHECKS } from './audit/checkCatalog.js'
export type { CheckInfo } from './audit/checkCatalog.js'
export { loadConfig } from './config/loadConfig.js'
export type { AcdRc, OutputFormat, ValidCheck } from './config/schema.js'
export { toJsonReport } from './report/jsonReport.js'
export { toMarkdownReport } from './report/markdownReport.js'
export { toSarifReport } from './report/sarifReport.js'
export { toGithubAnnotations } from './report/githubReport.js'
export { VERSION } from './version.js'
export type {
  AuditResult,
  AuditScore,
  ContextFile,
  ContextFileKind,
  ContextFileSkipReason,
  ContextIssue,
  ScoreGrade,
  Severity,
} from './types.js'
