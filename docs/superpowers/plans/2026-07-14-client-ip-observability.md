# Client IP Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a focused pull request that adds client-IP capture, persistence, usage filtering, and request visibility while leaving CCR's existing model statistics unchanged.

**Architecture:** Normalize the address once at the gateway boundary, pass it to request-log and usage stores, and persist it in backward-compatible SQLite columns. Usage exposes an IP option set that ignores only its own active filter; Overview, Observability, and Logs consume the stored value without reparsing headers.

**Tech Stack:** TypeScript, React, Electron, Node `net.isIP`, better-sqlite3, Node test runner, esbuild.

## Global Constraints

- Preserve CCR's pre-existing model distribution and model filter.
- Remove all in-progress Fusion model, observed-model, and routed-model attribution changes.
- Trust forwarded IP headers only when the immediate socket peer is loopback.
- Store unavailable legacy IP as an empty string and display `—`.
- Do not rewrite historical records.
- Do not commit `.ccb/`, `task_plan.md`, `findings.md`, or `progress.md`.

---

### Task 1: Reduce contracts and stores to IP-only

**Files:**
- Modify: `packages/core/src/contracts/app.ts`
- Modify: `packages/core/src/usage/store.ts`
- Modify: `packages/core/src/observability/request-log-store.ts`
- Modify: `tests/main/usage-store.test.mjs`
- Create: `tests/main/request-log-client-ip.test.mjs`

**Interfaces:**
- Consumes: existing `UsageStatsFilter`, `UsageStatsSnapshot`, and `RequestLogEntry`.
- Produces: `clientIp?: string` capture inputs, `clientIp: string` request logs, `clientIps: string[]` options, and IP-aware SQL filters.

- [ ] **Step 1: Split tests to IP-only behavior**

Keep request-log persistence, empty-value, migration, and backfill assertions for `clientIp`. In usage-store tests keep IP aggregation/filtering and remove `fusionModel`, `fusionModels`, `observedModelNames`, and routed-model cases.

- [ ] **Step 2: Run focused tests before reduction**

```bash
node build/test.mjs main
ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron --test dist/tests/main/usage-store.test.js dist/tests/main/request-log-client-ip.test.js
```

Expected: the retained IP assertions pass.

- [ ] **Step 3: Reduce contracts**

Add `clientIp?: string` to `UsageStatsFilter`, `clientIps: string[]` to
`UsageStatsSnapshot`, and `clientIp: string` to `RequestLogEntry` without
changing any pre-existing members of those types.

Keep optional `clientIp` on comparison and agent-analysis rows. Remove `fusionModel`, `fusionModels`, `observedModelNames`, and `fusion-model-distribution` additions.

- [ ] **Step 4: Reduce usage storage and stabilize IP options**

Keep `client_ip` schema/migration/index, recording, backfill, filter predicate, recent-request mapping, and aggregation. Remove `fusion_model` code and restore original model capture:

```ts
const model = bodyUsage?.model ?? route.model ?? input.fallbackModel;
```

Make IP options ignore only their own filter:

```ts
type UsageStatsQueryOptions = {
  ignoreClientIpFilter?: boolean;
  includeProxy?: boolean;
};
const optionQuery = buildUsageWhereClause(since, filter, { ignoreClientIpFilter: true });
const clientIps = readClientIpRows(database, optionQuery);
```

- [ ] **Step 5: Reduce request-log storage**

Keep the `client_ip` column, migration/indexes, insert/select/mapping, and agent-analysis propagation. Remove `fusion_model` and restore original request-log model attribution.

- [ ] **Step 6: Run focused tests and commit**

Run Step 2, then stage only Task 1 files and commit with `feat: persist and aggregate client IP usage`.

---

### Task 2: Keep secure gateway IP capture only

**Files:**
- Modify: `packages/core/src/gateway/http/io.ts`
- Modify: `packages/core/src/gateway/request/pipeline.ts`
- Create: `tests/main/gateway-client-ip.test.mjs`
- Delete: `tests/main/gateway-fusion-model-and-ip.test.mjs`

**Interfaces:**
- Produces: `resolveClientIp(request: IncomingMessage): string | undefined`.
- Consumes: the `clientIp` capture inputs from Task 1.

- [ ] **Step 1: Create IP-only gateway tests**

Move IPv4, IPv6, IPv4-mapped IPv6, loopback forwarded-header, remote spoof rejection, and invalid-value cases into `gateway-client-ip.test.mjs`. Remove all Fusion tests.

- [ ] **Step 2: Run the gateway test**

```bash
node build/test.mjs main
ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron --test dist/tests/main/gateway-client-ip.test.js
```

Expected: all address and trust-boundary cases pass.

- [ ] **Step 3: Remove Fusion request capture**

Delete `resolveRequestFusionModel` and pipeline `fusionModel` plumbing. Keep one pre-routing capture:

```ts
const clientIp = resolveClientIp(req);
```

Pass it to every request-log and usage-capture completion branch.

- [ ] **Step 4: Re-run tests and commit**

Run Step 2, stage Task 2 files, and commit with `feat: capture trusted client IPs at the gateway`.

---

### Task 3: Reduce UI to IP filtering and visibility

**Files:**
- Modify: `packages/ui/src/pages/home/App.tsx`
- Modify: `packages/ui/src/pages/home/components/dashboard.tsx`
- Modify: `packages/ui/src/pages/home/components/network-logs.tsx`
- Modify: `packages/ui/src/pages/home/shared/common.ts`
- Modify: `packages/ui/src/pages/home/shared/i18n.tsx`
- Modify: `packages/ui/src/pages/home/shared/usage.ts`
- Modify: `packages/ui/src/pages/tray/shared.tsx`
- Modify: `tests/renderer/fixtures.ts`
- Modify: `tests/renderer/overview-components.test.tsx`
- Modify: `tests/renderer/request-ip-display.test.tsx`

**Interfaces:**
- Consumes: `UsageStatsSnapshot.clientIps`, `UsageStatsFilter.clientIp`, and request `clientIp`.
- Produces: Overview IP selector and Observability/Logs IP cells and detail fields.

- [ ] **Step 1: Rewrite renderer tests to IP-only**

Remove Fusion widget and observed-model assertions. Keep original model behavior and add `All IPs` selection assertions. Make the Logs detail test actually expand a row or directly render an exported detail component.

- [ ] **Step 2: Run focused renderer tests**

```bash
node build/test.mjs renderer
ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron --test dist/tests/renderer/overview-components.test.js dist/tests/renderer/request-ip-display.test.js
```

Expected: IP tests pass; mixed-model failures identify removal points.

- [ ] **Step 3: Restore original model UI and keep IP UI**

Remove Fusion widget, `observedModelNames`, and model-reconciliation changes. Preserve `model-distribution` and the original model selector. Replace the ref cache with backend-stable options:

```ts
const usageClientIpOptions = useMemo(() => [
  { label: t("All IPs"), value: "" },
  ...usageStats.clientIps.map((clientIp) => ({ label: clientIp, value: clientIp }))
], [t, usageStats.clientIps]);
```

- [ ] **Step 4: Keep request IP surfaces**

Keep Client IP in Observability session/recent/error tables and Logs list/detail. Retain English/Chinese `All IPs` and `Client IP`; remove Fusion strings. Missing values use:

```tsx
<LogMetric label={t("Client IP")} value={(entry.clientIp ?? "").trim() || "—"} />
```

- [ ] **Step 5: Re-run tests and commit**

Run Step 2, stage Task 3 files, and commit with `feat: expose client IP usage and request details`.

---

### Task 4: Verify and open the PR

**Files:**
- Verify: all files changed from `origin/main`.
- Update: design document only if implementation differs.

**Interfaces:**
- Consumes: Tasks 1-3.
- Produces: an open GitHub PR from `feat/client-ip-observability` to `main`.

- [ ] **Step 1: Prove model-statistics additions are absent**

```bash
git diff origin/main...HEAD -- packages tests | rg "fusionModel|fusionModels|observedModelNames|fusion-model-distribution|resolveRequestFusionModel"
```

Expected: no output; baseline model statistics remain in source.

- [ ] **Step 2: Run full verification**

```bash
npm run test:main
npm run test:renderer
npm run typecheck
git diff --check origin/main...HEAD
```

Expected: all tests pass, except independently reproduced baseline/environment failures documented with exact output.

- [ ] **Step 3: Request independent review**

Review spoofing, migration/backfill compatibility, filter stability, UI coverage, accidental model changes, and test truthfulness. Resolve all Critical and Important findings.

- [ ] **Step 4: Audit and publish**

```bash
git status --short
git diff --name-status origin/main...HEAD
git log --oneline origin/main..HEAD
git push -u origin feat/client-ip-observability
gh pr create --base main --head feat/client-ip-observability --title "feat: add client IP usage observability" --body-file /tmp/ccr-client-ip-pr.md
gh pr view --json number,url,title,baseRefName,headRefName,state,body
```

Expected: an OPEN PR with no CCB or root planning files committed. The body explains trust rules, schema changes, filtering, UI surfaces, compatibility, and test results.
