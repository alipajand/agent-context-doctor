# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.x     | ✓ Current |

`acd` requires Node.js 22.12 or later.

## Reporting a Vulnerability

**Do not open a public GitHub issue for undisclosed security vulnerabilities.**

Please report vulnerabilities through [GitHub Security Advisories](https://github.com/alipajand/agent-context-doctor/security/advisories/new).

Include:
- A description of the issue
- Steps to reproduce
- Potential impact
- Any suggested mitigations

You will receive a response within 7 days. We will coordinate a fix and disclosure timeline with you.

## Scope

This tool is a local CLI that reads files from disk and writes optional report files. It does not:

- Make any external network requests
- Call any LLM or AI API
- Collect telemetry or usage data
- Require authentication credentials
- Store or transmit data outside the local machine

### File write behavior

`acd audit --output <path>` writes a Markdown report to a path you specify. The path is resolved relative to the audited repo root and must stay inside it, including after following symlinks in the existing part of the path. The report is never written through a symlink. `--allow-outside` lifts the containment rule for a path given on the command line; `audit.output` in `.acdrc` is always confined, because that file comes from the repository being audited.

`acd init` writes `AGENTS.md` into the target directory and refuses to write through an `AGENTS.md` symlink. No other files are written or modified.

### Auditing untrusted repositories

- Symlinked directories are not traversed. Symlinked context files that resolve outside the audited directory are reported but never read, so their contents and sizes cannot leak into reports or CI logs.
- Only regular files up to 1 MiB are read (context files, `package.json`, `.acdrc`), so devices, FIFOs, or huge files cannot hang an audit or exhaust memory.
- Control characters and invisible Unicode in excerpts are neutralized before they reach the terminal or a Markdown report, and Markdown output escapes HTML.

## Safe Usage

- Run `acd` against repos you own or have permission to audit
- Review Markdown reports before sharing — they may contain excerpts from your instruction files
- The tool does not execute any commands found in agent context files; it only reads and pattern-matches them

## No Telemetry Statement

`agent-context-doctor` contains zero telemetry. It makes no outbound network connections of any kind. You can verify this by inspecting `src/` — there are no `fetch`, `http`, `https`, `axios`, or `node:net` calls.
