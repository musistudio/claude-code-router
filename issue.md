# Local-agent OAuth provider plugin auth override never applies

## Summary

Providers imported from a local CLI login (Claude Code OAuth, Codex OAuth) send
requests upstream with the wrong auth header. Instead of
`Authorization: Bearer <oauth-token>` (plus `anthropic-beta: oauth-2025-04-20`),
the request goes out with `x-api-key: ccr-local-agent-login` (the internal
placeholder credential) or, after a partial fix, `x-api-key: <real oauth token>`
— still the wrong header, since Anthropic's OAuth flow requires `Authorization`,
not `x-api-key`.

## Root cause

Importing a local-agent provider (`packages/core/src/agents/local-providers/claude-code.ts`,
`codex.ts`) creates two things:

1. A `GatewayProviderConfig` entry in `config.Providers`, with `api_key` set to
   the sentinel placeholder `ccr-local-agent-login`
   (`packages/core/src/agents/local-providers/shared.ts:26`).
2. One or more `providerPlugins` entries (`bearerAuthPlugin()` /
   `apiKeyAuthPlugin()` in `shared.ts:78-114`) carrying the real captured OAuth
   token in `auth.headers.authorization`, plus `removeHeaders: ["x-api-key"]`.

The plugin is supposed to be matched to its provider by the internal gateway
process (`@the-next-ai/ai-gateway`, config written by `writeCoreGatewayConfig()`
in `packages/core/src/gateway/service.ts:1151`) via an **exact string match**
between the plugin's `providerName` field and the provider's *runtime* name.

The runtime name is computed by `providerRuntimeId()`
(`gateway/service.ts:6671`):

```ts
function providerRuntimeId(provider) {
  const explicit = sanitizeProviderHeaderId(provider.id);
  if (explicit) return explicit;
  // ...falls back to `provider-<slugified-name>-<sha256-hash-of-name+baseUrl>`
}
```

`provider.id` was **never set** during import
(`packages/ui/src/pages/home/App.tsx`, provider-save handler around line 1434
— no `id` field on the constructed `GatewayProviderConfig`). So the backend
always fell into the hash branch, producing an opaque name like
`provider-claude-code-api-884b99c439::anthropic_messages`.

Meanwhile, the plugin's `providerName` was set (in
`materializeProviderPluginTemplates()`, `App.tsx:60-75`) to the **human-readable
label**: `"Claude Code API::anthropic_messages"`.

These two strings never match. The gateway's plugin-resolution step
(`resolve(n, t)` in the vendor bundle) silently no-ops — no error, no log —
and the provider's raw `api_key` (the sentinel, or later the swapped-in real
token) goes out using the protocol's default header convention. For Anthropic
(`type: "anthropic"`), that default is always `x-api-key`, never `Authorization`,
regardless of `extraHeaders`.

## Fix applied

Two changes, both to make the plugin's `providerName` deterministically equal
to whatever runtime name the provider will actually get — rather than trying
to intercept/patch headers after the fact.

**1. `packages/ui/src/pages/home/App.tsx` (generator/import-time fix, kept):**

- Provider save now sets an explicit `id` on the saved `GatewayProviderConfig`:
  a slug of the provider name (`providerNameSlug(providerName)`), reusing the
  existing edit's `id` if editing rather than importing fresh.
- `materializeProviderPluginTemplates()` now builds the plugin's internal name
  from that same `id` (`${providerId}::${protocol}`) instead of the raw human
  name, so it exactly matches `providerCapabilityInternalName()` on the
  backend (which now takes the explicit `id` path in `providerRuntimeId()`,
  skipping the hash entirely — fully deterministic).

Verified: after wiping `~/.claude-code-router` and re-importing, generated
`gateway.config.json` shows the provider and its paired plugin sharing the
same computed name (`claude-code-api::anthropic_messages`), where previously
they diverged (`Claude Code API` vs `provider-claude-code-api-<hash>::anthropic_messages`).

**2. `packages/core/src/gateway/service.ts` (write-time defense-in-depth,
currently stashed / not applied):**

- `toCoreGatewayProvider()` swaps the sentinel `api_key` for the real resolved
  credential (via `localAgentProviderAccountCredential()`, exported from
  `packages/core/src/providers/account-service.ts`) before handing the
  provider to the gateway.
- `writeCoreGatewayConfig()` also expands each `providerPlugins` entry's
  `providerName` into every actual runtime alias (bare name, `name::protocol`)
  via a new `withProviderPluginRuntimeNames()` alias-map, so plugins still
  match even if a provider was imported before the fix in (1).
- Held back at the user's request in favor of the cleaner root-cause fix in
  (1); re-apply from `git stash@{0}` ("Fixed claude oat") if existing
  pre-fix-1 imports need to keep working without re-import.

## Known follow-up: newer macOS Claude Code CLI stores credentials in Keychain

`~/.claude/.credentials.json` is Claude Code CLI's older on-disk credential
store. Recent macOS builds instead store the OAuth token in the macOS
Keychain under generic-password service name `"Claude Code-credentials"`.
CCR's importer (`claude-code.ts`) only reads the JSON file today — if it's
absent, import silently finds nothing to import.

Fix not yet implemented: in the importer, fall back to
`security find-generic-password -s "Claude Code-credentials" -w` (triggers a
normal macOS keychain-access permission prompt) when the credentials file is
missing, parse stdout as JSON, and feed it through the same
`findOauthTokenSet()` path already used for the file-based case. Needs a
try/catch since `security` exits non-zero if the user denies the prompt or no
such keychain item exists.
