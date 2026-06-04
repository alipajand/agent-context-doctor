# Module API

This document describes the public contracts for each module in `src/`. Import paths use the `.js` extension as required by Node.js ESM.

---

## `src/types.ts`

Core shared types. Import from `'./types.js'`.

### `Severity`

```ts
type Severity = 'low' | 'medium' | 'high'
```

### `ContextIssue`

Represents a single problem found in a context file.

```ts
type ContextIssue = {
  id: string           // Unique identifier, e.g. "risky-skip-tests-AGENTS.md:12"
  severity: Severity
  category: string     // Check category, e.g. "risky-language"
  file: string         // Relative path to the file containing the issue
  message: string      // Human-readable description
  recommendation: string
  line?: number        // 1-based line number (when available)
  endLine?: number
  evidence?: string    // Snippet of offending content
  files?: string[]     // For cross-file issues (contradictions)
}
```

### `ContextFile`

A detected agent context file.

```ts
type ContextFileKind = 'agents' | 'claude' | 'cursor' | 'copilot' | 'codex' | 'prompt' | 'unknown'

type ContextFile = {
  path: string           // Relative path from repoRoot
  kind: ContextFileKind
  bytes: number
}
```

### `AuditResult`

Top-level output of `auditRepo`.

```ts
type AuditScore = {
  total: number        // 0–100
  max: 100
  grade: ScoreGrade    // 'excellent' | 'good' | 'needs-work' | 'risky'
}

type AuditResult = {
  repoPath: string
  files: ContextFile[]
  summary: {
    fileCount: number
    issueCount: number
    high: number
    medium: number
    low: number
  }
  score: AuditScore
  issues: ContextIssue[]
}
```

---

## `src/audit/auditRepo.ts`

### `auditRepo(repoPath, opts?)`

Runs all checks on the given repository and returns a full `AuditResult`.

```ts
type AuditOptions = {
  ignoreFiles?: string[]          // Glob patterns to exclude
  disabledChecks?: string[]       // Check IDs to skip
  allowedMissingScripts?: string[] // Scripts allowed to be absent from package.json
}

async function auditRepo(repoPath: string, opts?: AuditOptions): Promise<AuditResult>
```

---

## `src/audit/detectContextFiles.ts`

### `detectContextFiles(repoPath, ignoreFiles?)`

Discovers and classifies all agent context files under `repoPath`.

```ts
async function detectContextFiles(repoPath: string, ignoreFiles?: string[]): Promise<ContextFile[]>
```

### `isPrimaryInstructionFile(filePath)`

Returns `true` for files that should be checked by structural checks (`safety-boundaries`, `validation-commands`, `final-reporting`).

```ts
function isPrimaryInstructionFile(filePath: string): boolean
```

---

## `src/audit/score.ts`

### `computeScore(issues)`

Applies severity deductions to compute the final 0–100 score.

```ts
function computeScore(issues: ContextIssue[]): AuditScore
```

Deductions: `high` −20 · `medium` −8 · `low` −3. Score floored at 0.

---

## `src/audit/suppressions.ts`

### `parseSuppressions(content)`

Reads `<!-- acd-disable <category> -->` comments from file content.

```ts
type SuppressionRule = { kind: 'file'; category: string }

function parseSuppressions(content: string): SuppressionRule[]
```

### `filterSuppressedIssues(filePath, content, issues)`

Removes issues that are suppressed by inline comments in the file.

```ts
function filterSuppressedIssues(
  filePath: string,
  content: string,
  issues: ContextIssue[],
): ContextIssue[]
```

### `KNOWN_SUPPRESSION_CATEGORIES`

```ts
const KNOWN_SUPPRESSION_CATEGORIES: Set<string>
// Contains: 'placeholder-content', 'risky-language', 'command-alignment',
//           'safety-boundaries', 'validation-commands', 'final-reporting', 'contradictions'
```

---

## `src/audit/checks/*`

Each check is a pure function that returns `ContextIssue[]`. An empty array means no issues.

| Export | Signature |
| --- | --- |
| `checkPlaceholderContent` | `(filePath, content) => ContextIssue[]` |
| `checkRiskyLanguage` | `(filePath, content) => ContextIssue[]` |
| `checkCommandAlignment` | `(filePath, content, packageScripts) => ContextIssue[]` |
| `checkCommandsWithoutPackageJson` | `(filePath, content) => ContextIssue[]` |
| `checkSafetyBoundaries` | `(filePath, content) => ContextIssue[]` |
| `checkValidationCommands` | `(filePath, content) => ContextIssue[]` |
| `checkFinalReporting` | `(filePath, content) => ContextIssue[]` |
| `checkContradictions` | `(fileContents: Array<{path, content}>) => ContextIssue[]` |

---

## `src/config/loadConfig.ts`

### `loadConfig(searchDir)`

Reads and validates `.acdrc` in `searchDir`. Returns `null` if no config file exists. Throws on malformed JSON or schema errors.

```ts
async function loadConfig(searchDir: string): Promise<AcdRc | null>
```

---

## `src/report/*`

### `printTerminalReport(result)`

Prints a colored terminal summary to stdout.

```ts
function printTerminalReport(result: AuditResult): void
```

### `toJsonReport(result)`

Serializes `AuditResult` to a JSON string.

```ts
function toJsonReport(result: AuditResult): string
```

### `toMarkdownReport(result)`

Renders `AuditResult` as a Markdown string.

```ts
function toMarkdownReport(result: AuditResult): string
```

---

## `src/fs/*`

### `findContextFiles(repoPath, ignoreFiles?)`

Globs for all known context file patterns under `repoPath`.

```ts
async function findContextFiles(repoPath: string, ignoreFiles?: string[]): Promise<string[]>
```

### `readTextFile(absolutePath)`

Reads a UTF-8 file. Returns empty string on error.

```ts
async function readTextFile(absolutePath: string): Promise<string>
```

### `getFileBytes(absolutePath)`

Returns file size in bytes.

```ts
async function getFileBytes(absolutePath: string): Promise<number>
```

### `readPackageScripts(repoPath)`

Reads `package.json` and returns the `scripts` object. Returns `null` if no `package.json` is found.

```ts
type PackageJsonScripts = Record<string, string>
async function readPackageScripts(repoPath: string): Promise<PackageJsonScripts | null>
```

### `writeReport(outputPath, content, repoPath)`

Writes a text report to `outputPath` (resolved relative to `repoPath`). Returns the absolute path written.

```ts
async function writeReport(outputPath: string, content: string, repoPath: string): Promise<string>
```

---

## `src/init/initRepo.ts`

### `initRepo(repoPath, opts?)`

Creates a starter `AGENTS.md` in the repository. Safe by default — skips if file exists unless `opts.force` is set.

```ts
type InitResult = { status: 'created' | 'overwritten' | 'already-exists'; path: string }

async function initRepo(repoPath: string, opts?: { force?: boolean }): Promise<InitResult>
```
