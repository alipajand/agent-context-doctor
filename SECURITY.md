# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.x     | ✓ Current |

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

`acd audit --output <path>` writes a Markdown report to a path you specify. The path is resolved relative to the audited repo root. No other files are written or modified.

## Safe Usage

- Run `acd` against repos you own or have permission to audit
- Review Markdown reports before sharing — they may contain excerpts from your instruction files
- The tool does not execute any commands found in agent context files; it only reads and pattern-matches them

## No Telemetry Statement

`agent-context-doctor` contains zero telemetry. It makes no outbound network connections of any kind. You can verify this by inspecting `src/` — there are no `fetch`, `http`, `https`, `axios`, or `node:net` calls.
