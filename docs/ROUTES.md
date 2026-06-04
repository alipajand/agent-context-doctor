# CLI Command Reference

Binary name: `acd`

---

## `acd audit [repoPath]`

Audit agent context files in a repository for quality, safety, contradictions, placeholder content, and command alignment.

**Arguments**

| Argument | Required | Default | Description |
| --- | --- | --- | --- |
| `repoPath` | no | cwd | Path to the repository to audit |

**Options**

| Flag | Type | Description |
| --- | --- | --- |
| `--json` | boolean | Output the full `AuditResult` as JSON to stdout instead of terminal output |
| `--output <path>` | string | Write a Markdown report to this path (relative to `repoPath`) |
| `--fail-on <severity>` | `low\|medium\|high` | Exit non-zero if any issue at or above this severity is found |

**Config precedence** (highest to lowest): CLI flag → `.acdrc` field → default.

**Exit codes**

| Code | Meaning |
| --- | --- |
| `0` | Audit completed (no issues above `--fail-on` threshold, or `--fail-on` not set) |
| `1` | Config error, invalid `--fail-on` value, or threshold exceeded |

**Examples**

```bash
# Audit current directory
acd audit

# Audit a specific path, output JSON
acd audit /path/to/repo --json

# Write Markdown report
acd audit --output docs/agent-context-report.md

# CI gate: fail if any high-severity issue found
acd audit --fail-on high
```

---

## `acd list [repoPath]`

List all agent context files detected in a repository without running any checks.

**Arguments**

| Argument | Required | Default | Description |
| --- | --- | --- | --- |
| `repoPath` | no | cwd | Path to the repository to inspect |

**Output format** (one file per line):

```
  <relative-path>  [<kind>]  <bytes>B
```

**Examples**

```bash
acd list
acd list /path/to/repo
```

---

## `acd init [repoPath]`

Create a starter `AGENTS.md` in a repository.

**Arguments**

| Argument | Required | Default | Description |
| --- | --- | --- | --- |
| `repoPath` | no | cwd | Path to the repository |

**Options**

| Flag | Description |
| --- | --- |
| `--force` | Overwrite an existing `AGENTS.md` |
| `--print` | Print the template to stdout without writing any files |

**Exit codes**

| Code | Meaning |
| --- | --- |
| `0` | File written (or `--print` used) |
| `1` | File already exists and `--force` not passed |

**Examples**

```bash
# Create AGENTS.md in current repo
acd init

# Preview the template without writing
acd init --print

# Overwrite existing AGENTS.md
acd init --force
```

---

## `.acdrc` Configuration File

A JSON file at the root of the audited repository. All fields are optional.

```jsonc
{
  "audit": {
    "repoPath": ".",          // Override the repo path (relative to .acdrc location)
    "json": true,             // Equivalent to --json
    "output": "report.md",    // Equivalent to --output
    "failOn": "high"          // Equivalent to --fail-on
  },
  "rules": {
    "ignoreFiles": ["docs/examples/**"],     // Glob patterns to exclude from auditing
    "disabledChecks": ["validation-commands"], // Check IDs to skip entirely
    "allowedMissingScripts": ["deploy"]      // Package scripts that are allowed to be missing
  }
}
```

**Known check IDs for `disabledChecks`:**

- `placeholder-content`
- `risky-language`
- `command-alignment`
- `safety-boundaries`
- `validation-commands`
- `final-reporting`
- `contradictions`
