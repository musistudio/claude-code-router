# Gateway fixes for CCR issues #1801, #1806 and #1808

The runtime dependency needs source changes as well as the CCR changes in this branch.

- Base: `@the-next-ai/ai-gateway` source commit `f061ad4` (the `feat/v1.0.22` branch, package version still 1.0.21).
- Fix: `c6cba47` on local gateway branch `codex/ccr-recent-issues`.
- Reviewable patch: `0001-fix-tool-ids-and-fusion-traces.patch`, including regression tests.
- Follow-up after reproducing the original issues: `0002-complete-native-replay-and-response-status.patch`. This repairs old invalid tool IDs on the native Anthropic passthrough path and retains the final upstream HTTP status/headers for ordinary converted responses, including transparent tool turns and parse retries.
- The patch sanitizes Anthropic tool IDs consistently in JSON, SSE and replayed call/result pairs, captures completed optimistic Fusion streams with billing enabled or disabled, and retains real upstream status/headers for buffered Fusion responses.

## Build from source

In a gateway source checkout at the base commit, apply both patches in order, install its dependencies, and build:

```sh
git am /absolute/path/to/0001-fix-tool-ids-and-fusion-traces.patch
git apply /absolute/path/to/0002-complete-native-replay-and-response-status.patch
npm run typecheck
npm run build
```

Then build CCR:

```sh
CCR_GATEWAY_SOURCE_DIR=/absolute/path/to/patched/gateway npm run build:assets
```

The second audit used `/tmp/ccr-audit-gateway` as an isolated source snapshot. Temporary directories are not deliverables; the two patches and the committed regression suites are the reproducible artifacts.

Do not assume a normal dependency install contains these fixes yet. The main dependency constraint remains `^1.0.21`. Release the gateway changes and update the dependency before distributing CCR without an explicit patched source directory.

## Verification

- Gateway TypeScript check and build passed.
- Gateway routes and tool ID suites: 158 tests passed.
- CCR's `packages/core/test/integration/gateway/recent-issues-wire.test.mjs` exercises the built gateway via real loopback HTTP and consumes its spool with `RawTraceSynchronizer` and the real SQLite writer. It covers direct/Fusion × JSON/SSE × billing on/off, usage after `finish_reason`, provider-filtered costs, native tool replay, fallback wire destinations, the original encoded Fusion verification ID, and live OAuth rotation/probes. Set `CCR_TEST_GATEWAY_ENTRY` to the absolute built `dist/index.js` (or CCR's bundled `packages/core/dist/main/next-ai-gateway.js`) when running it.
- No model credentials or real upstream calls were needed.
