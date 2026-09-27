# Gateway fixes for CCR issues #1801, #1806 and #1808

The runtime dependency needs source changes as well as the CCR changes in this branch.

- Base: `@the-next-ai/ai-gateway` source commit `f061ad4` (the `feat/v1.0.22` branch, package version still 1.0.21).
- Fix: `c6cba47` on local gateway branch `codex/ccr-recent-issues`.
- Reviewable patch: `0001-fix-tool-ids-and-fusion-traces.patch`, including regression tests.
- The patch sanitizes Anthropic tool IDs consistently in JSON, SSE and replayed call/result pairs, captures completed optimistic Fusion streams with billing enabled or disabled, and retains real upstream status/headers for buffered Fusion responses.

## Build from source

In a gateway source checkout at the base commit, apply the patch with `git am /absolute/path/to/0001-fix-tool-ids-and-fusion-traces.patch`, install its dependencies, and run `npm run build`. Then build CCR:

```sh
CCR_GATEWAY_SOURCE_DIR=/absolute/path/to/patched/gateway npm run build:assets
```

This session used `/tmp/ccr-ai-gateway-issues` as the isolated checkout. Its production build was exercised with a loopback mock upstream: Fusion JSON and SSE both returned valid Anthropic tool IDs and created raw traces with status 200 while billing was disabled.

Do not assume a normal dependency install contains these fixes yet. The main dependency constraint remains `^1.0.21`. Release the gateway changes and update the dependency before distributing CCR without an explicit patched source directory.

## Verification

- Gateway TypeScript check and build passed.
- Gateway routes and tool ID suites: 157 tests passed.
- No model credentials or real upstream calls were needed.
