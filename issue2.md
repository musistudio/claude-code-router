# Claude Code CLI credentials moved to macOS Keychain — local-agent import fails

## Problem

Newer macOS builds of the Claude Code CLI store OAuth credentials in the macOS
Keychain (service name `"Claude Code-credentials"`) instead of
`~/.claude/.credentials.json`. CCR's local-agent provider importer only reads
the file path, so on these installs it finds no credentials and the
"Claude Code API" local login provider cannot be detected/imported.

## Where it's read today

`packages/core/src/agents/local-providers/claude-code.ts` uses
`readJsonRecord()` (from `packages/core/src/agents/local-providers/shared.ts`)
to read `~/.claude/.credentials.json` directly off disk. There is no
Keychain fallback anywhere in `packages/core/src/agents/local-providers/`.

## Fix direction

Add a Keychain fallback when the credentials file is missing/empty:

```bash
security find-generic-password -s "Claude Code-credentials" -w
```

- Triggers a standard macOS permission prompt (Allow / Always Allow) on
  first access — no bypass, same consent flow any app goes through.
- Exits non-zero if the item doesn't exist or the user denies access —
  must be wrapped in try/catch, falling back to "no local credentials
  found" (existing `missingCandidate()` path) rather than throwing.
- Output is JSON on stdout, same shape expected by
  `findOauthTokenSet()` in `shared.ts` — parse and feed through the same
  path used for the file-based case.
- macOS-only path (`process.platform === "darwin"`); other platforms keep
  using the file-based read only.

## Not yet implemented

This is a plan, not a diff — nothing has been changed for this issue yet.
