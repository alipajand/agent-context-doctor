# Release Checklist

Use this document every time you publish a new version of `agent-context-doctor` to npm.

---

## Prerequisites

- npm account with 2FA enabled and publish rights to the `agent-context-doctor` package
- `pnpm` installed globally
- Clean `main` branch with all CI checks green
- No uncommitted local changes

---

## Step-by-step

### 1. Verify clean git status

```bash
git status
```

Expected: `nothing to commit, working tree clean`.  
If not clean, commit or stash all changes before proceeding.

### 2. Pull the latest main

```bash
git checkout main
git pull origin main
```

### 3. Run full quality checks

```bash
pnpm format:check
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

All five must exit 0. Fix any failures before continuing.

### 4. Smoke-test the built binary

```bash
node dist/cli.js --version
node dist/cli.js audit --help
node dist/cli.js audit examples/good-context
```

Confirm:
- `--version` prints the expected semver string.
- `audit --help` shows the help text without errors.
- `audit examples/good-context` exits 0 with a clean result.

### 5. Inspect the pack contents

```bash
pnpm pack --dry-run
```

Verify the tarball only includes:
- `dist/` — compiled JavaScript and type declarations
- `README.md`
- `LICENSE`
- `SECURITY.md`
- `package.json`

If unexpected files appear (source files, test fixtures, node_modules), update the `files` field in `package.json`.

### 6. Bump the version

Choose the appropriate semver bump:

| Change type | Command |
|-------------|---------|
| Bug fix | `npm version patch` |
| New feature (backward-compatible) | `npm version minor` |
| Breaking change | `npm version major` |

`npm version` automatically commits and tags. Do not bump manually.

### 7. Push the version commit and tag

```bash
git push origin main
git push origin --tags
```

Wait for CI to pass on the new commit before publishing.

### 8. Publish to npm

```bash
npm publish --access public
```

npm will prompt for your 2FA code. Enter it to complete the publish.

> **Do not use `--no-verify` or skip 2FA.** If publish fails, debug before retrying.

### 9. Confirm the release

```bash
npm view agent-context-doctor version
npx agent-context-doctor --version
```

Both should show the version you just published.

### 10. Create a GitHub release

- Go to the [releases page](https://github.com/alipajand/agent-context-doctor/releases).
- Draft a new release from the tag created in step 6.
- Copy the relevant section from `CHANGELOG.md` into the release notes.
- Publish the release.

---

## Rollback

If the published version is broken:

```bash
npm deprecate agent-context-doctor@<bad-version> "Broken release, use <previous-version> instead"
```

Do **not** unpublish unless the release contains secrets or malware. Use deprecation instead.

---

## Version policy

This project follows [Semantic Versioning](https://semver.org/).

- **Patch**: bug fixes, documentation updates, new tests.
- **Minor**: new checks, new CLI flags, new optional fields on `AuditResult`.
- **Major**: breaking changes to `AuditResult` JSON shape, renaming commands (`audit`, `list`), removing existing fields, or changing `.acdrc` schema in a backward-incompatible way.
