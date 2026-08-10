# Claude Ship Plugin

This directory is installable through CCR Desktop's local extension picker.

1. Open **Extensions**.
2. Click **Install**.
3. Click **Choose folder**.
4. Select this `plugins/claude-ship` directory.
5. Install and keep the extension enabled.

Claude Ship and Claude Design are separate plugins. Install `plugins/claude-design` when you also need the Design app.

By default the Claude Ship window opens `https://claude.ai/claude-ship` so relative runtime requests land on the CCR wrapper backend. The frontend shell and static assets still come from the Cloudflare Pages asset origin embedded in the plugin code. CCR intercepts Ship API paths such as `/v1/code`, `/v1/sessions`, bootstrap, billing promotion, and privacy consent probes. Ship static bundle paths such as `/ship/assets/*` are also proxied through CCR so the local runtime patch can be applied before the browser executes them.

Claude Ship no longer loads from Claude Desktop's local `ion-dist` assets. Keep the Cloudflare Pages frontend available, or use an explicit `assetDir` only for local development fixtures.

When the packaged app owns the `ccr://` protocol handler, the window can also be opened with:

```sh
open 'ccr://plugin/claude-ship/open'
```

The local test is considered healthy when Claude Ship opens, exposes a non-empty agent list, can create a session/project through `/v1/code/sessions`, lists it through `/v1/code/sessions` and `/v1/code/session_groupings`, previews locally, and can publish through `/v1/code/baku/sessions/:id/deploy`.

## Cloudflare Publishing

Claude Ship's Publish button posts to `/v1/code/baku/sessions/:id/deploy`. When `cloudflarePages` is configured, the plugin maps that request to Cloudflare Pages Direct Upload and returns the SSE deployment payload expected by the Claude.app frontend. Without Cloudflare credentials, the endpoint stores a local publish record so the desktop UI can complete the workflow during local testing.

Add this to the plugin config or use the equivalent environment variables:

```jsonc
"cloudflarePages": {
  "enabled": true,
  "accountId": "your-cloudflare-account-id",
  "apiToken": "a-token-with-pages-write",
  "projectName": "my-claude-ship-project",
  "branch": "main",
  "createProject": true
}
```

Supported environment variables:

- `CLOUDFLARE_ACCOUNT_ID` or `CF_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN` or `CF_API_TOKEN`
- `CLOUDFLARE_PAGES_PROJECT_NAME` or `CCR_CLAUDE_SHIP_CLOUDFLARE_PROJECT`
- `CLOUDFLARE_PAGES_PROJECT_NAME_TEMPLATE` or `CCR_CLAUDE_SHIP_CLOUDFLARE_PROJECT_TEMPLATE`
- `CLOUDFLARE_PAGES_BRANCH` or `CCR_CLAUDE_SHIP_CLOUDFLARE_BRANCH`

If `projectName` is omitted, the plugin derives a Pages-safe project name from the session title and id. The published artifact is static HTML plus `_headers`; the local preview debug bridge is not uploaded.
