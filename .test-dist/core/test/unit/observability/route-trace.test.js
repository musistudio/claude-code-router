"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// packages/core/test/unit/observability/route-trace.test.mjs
var import_strict = __toESM(require("node:assert/strict"), 1);
var import_node_test = __toESM(require("node:test"), 1);

// packages/core/src/observability/sensitive-headers.ts
var sensitiveRequestLogHeaderNames = /* @__PURE__ */ new Set([
  "api-key",
  "authorization",
  "cookie",
  "ocp-apim-subscription-key",
  "proxy-authorization",
  "set-cookie",
  "x-api-key",
  "x-auth-api-key-id",
  "x-auth-sub",
  "x-goog-api-key"
]);
var sensitiveRequestLogHeaderPattern = /(?:^|[-_.])(?:auth(?:orization)?|bearer|cookie|credential|csrf|jwt|key|pass(?:word|wd)?|secret|signature|token)(?:$|[-_.])/i;
function isSensitiveRequestLogHeaderName(value) {
  const normalized = value.trim().toLowerCase();
  return sensitiveRequestLogHeaderNames.has(normalized) || sensitiveRequestLogHeaderPattern.test(normalized);
}

// packages/core/src/observability/route-trace.ts
var maxArrayItems = 16;
var maxChangesPerHop = 64;
var maxDepth = 6;
var maxHops = 64;
var maxObjectEntries = 32;
var maxPreviewBytes = 2 * 1024;
var maxStringChars = 1024;
var maxTraceBytes = 256 * 1024;
var redactedDisplayValue = "[redacted]";
var truncatedDisplayValue = "[truncated]";
var sensitiveNames = /(?:^|[-_.])(authorization|cookie|api[-_]?key|access[-_]?token|refresh[-_]?token|password|secret|proxy[-_]?authorization)(?:$|[-_.])/i;
var RequestRouteTraceRecorder = class {
  constructor(startedAtMs) {
    this.startedAtMs = startedAtMs;
  }
  startedAtMs;
  attempts = /* @__PURE__ */ new Set();
  estimatedBytes = 0;
  finished;
  hops = [];
  sealed = false;
  truncated = false;
  captureIngress() {
    if (this.finished || this.hops.length > 0) {
      return;
    }
    this.pushHop({
      changes: [],
      durationMs: 0,
      kind: "snapshot",
      name: "request.ingress",
      phase: "ingress",
      seq: 0,
      startedOffsetMs: 0,
      status: "ok"
    });
  }
  capture(observation) {
    if (this.finished || this.sealed || this.hops.length >= maxHops) {
      this.truncated = true;
      this.sealed = true;
      return;
    }
    const reportedChanges = observation.changes ?? [];
    const changes = reportedChanges.slice(0, maxChangesPerHop).map(sanitizeReportedChange);
    const changesTruncated = reportedChanges.length > changes.length || changes.some((change) => change.truncated);
    if (observation.attempt !== void 0) {
      this.attempts.add(observation.attempt);
    }
    const observationStartedAtMs = observation.startedAtMs ?? Date.now();
    const hop = {
      ...observation.attempt === void 0 ? {} : { attempt: observation.attempt },
      changes,
      ...observation.decision ? { decision: boundedObservationValue(observation.decision) } : {},
      durationMs: Math.max(0, Math.round(observation.durationMs ?? 0)),
      kind: observation.kind ?? (changes.length > 0 ? "mutation" : "decision"),
      name: observation.name,
      ...observation.outcome ? { outcome: boundedObservationValue(observation.outcome) } : {},
      phase: observation.phase,
      seq: this.hops.length,
      startedOffsetMs: Math.max(0, Math.round(observationStartedAtMs - this.startedAtMs)),
      status: observation.status ?? (changes.length > 0 ? "ok" : "noop"),
      ...observation.target ? { target: boundedObservationValue(observation.target) } : {},
      ...changesTruncated ? { truncated: true } : {}
    };
    if (changesTruncated) {
      this.truncated = true;
    }
    this.pushHop(hop);
  }
  finish(options = {}) {
    if (this.finished) {
      return this.finished;
    }
    const hops = options.captureBodyValues === false ? this.hops.map(suppressRouteTraceHopBodyValues) : this.hops;
    this.finished = {
      attemptCount: this.attempts.size,
      complete: true,
      hopCount: hops.length,
      hops,
      truncated: this.truncated,
      version: 2
    };
    return this.finished;
  }
  pushHop(hop) {
    const remaining = maxTraceBytes - this.estimatedBytes;
    if (remaining <= 0) {
      this.truncated = true;
      this.sealed = true;
      return;
    }
    let nextHop = hop;
    let hopBytes = jsonByteLength(nextHop);
    if (hopBytes > remaining && nextHop.changes.length > 0) {
      const retained = [];
      let retainedBytes = jsonByteLength({ ...nextHop, changes: [] });
      for (const change of nextHop.changes) {
        const changeBytes = jsonByteLength(change) + 1;
        if (retainedBytes + changeBytes > remaining) {
          break;
        }
        retained.push(change);
        retainedBytes += changeBytes;
      }
      nextHop = {
        ...nextHop,
        changes: retained,
        truncated: retained.length < nextHop.changes.length || nextHop.truncated
      };
      hopBytes = retainedBytes;
      if (nextHop.truncated) {
        this.truncated = true;
      }
    }
    if (hopBytes > remaining) {
      this.truncated = true;
      this.sealed = true;
      return;
    }
    this.hops.push(nextHop);
    this.estimatedBytes += hopBytes;
  }
};
function boundedObservationValue(value) {
  return previewValue(value).value;
}
function suppressRouteTraceHopBodyValues(hop) {
  if (!hop.changes.some((change) => change.scope === "body")) {
    return hop;
  }
  return {
    ...hop,
    changes: hop.changes.map((change) => {
      if (change.scope !== "body") return change;
      const { after: _after, before: _before, ...metadata } = change;
      return metadata;
    })
  };
}
function sanitizeReportedChange(change) {
  const path = normalizePath(change.path);
  const redacted = Boolean(change.redacted) || pathContainsSensitiveName(path);
  const before = change.before === void 0 || redacted ? void 0 : previewValue(change.scope === "url" ? sanitizeUrlValue(change.before) : change.before);
  const after = change.after === void 0 || redacted ? void 0 : previewValue(change.scope === "url" ? sanitizeUrlValue(change.after) : change.after);
  return {
    ...change.after === void 0 ? {} : { after: redacted ? redactedDisplayValue : after?.value },
    ...change.before === void 0 ? {} : { before: redacted ? redactedDisplayValue : before?.value },
    operation: change.operation,
    path,
    ...redacted ? { redacted: true } : {},
    scope: change.scope,
    ...change.truncated || before?.truncated || after?.truncated ? { truncated: true } : {}
  };
}
function sanitizeUrlValue(value) {
  if (typeof value !== "string") {
    return value;
  }
  try {
    const url = new URL(value, "http://127.0.0.1");
    for (const key of [...url.searchParams.keys()]) {
      if (isSensitiveName(key) || /^(?:key|token)$/i.test(key)) {
        url.searchParams.set(key, redactedDisplayValue);
      }
    }
    return /^[a-z][a-z\d+.-]*:/i.test(value) ? url.toString() : `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return value;
  }
}
function previewValue(value) {
  const budget = { remaining: maxPreviewBytes, truncated: false };
  const preview = boundedPreview(value, budget, 0, /* @__PURE__ */ new WeakSet());
  return {
    truncated: budget.truncated,
    value: preview ?? truncatedDisplayValue
  };
}
function boundedPreview(value, budget, depth, seen, key) {
  if (budget.remaining <= 0) {
    budget.truncated = true;
    return truncatedDisplayValue;
  }
  if (key && isSensitiveName(key)) {
    budget.remaining -= redactedDisplayValue.length;
    return redactedDisplayValue;
  }
  if (value === null) {
    budget.remaining -= 4;
    return null;
  }
  if (Buffer.isBuffer(value)) {
    budget.remaining -= 32;
    return { sizeBytes: value.byteLength, type: "buffer" };
  }
  if (typeof value === "string") {
    const output = value.length <= maxStringChars ? value : `${value.slice(0, maxStringChars)}\u2026[${value.length - maxStringChars} chars truncated]`;
    budget.remaining -= Math.min(maxStringChars, output.length) * 2;
    if (output.length !== value.length) budget.truncated = true;
    return output;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    budget.remaining -= 16;
    return value;
  }
  if (typeof value === "bigint") {
    budget.remaining -= 32;
    return value.toString();
  }
  if (value === void 0 || typeof value === "function" || typeof value === "symbol") {
    return void 0;
  }
  if (depth >= maxDepth) {
    budget.truncated = true;
    return truncatedDisplayValue;
  }
  if (seen.has(value)) {
    budget.truncated = true;
    return "[circular]";
  }
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      const output2 = value.slice(0, maxArrayItems).map((item) => boundedPreview(item, budget, depth + 1, seen));
      if (value.length > maxArrayItems) {
        output2.push(`[${value.length - maxArrayItems} items omitted]`);
        budget.truncated = true;
      }
      return output2;
    }
    const output = {};
    const record = value;
    let entryCount = 0;
    let omitted = false;
    for (const entryKey in record) {
      if (!Object.prototype.hasOwnProperty.call(record, entryKey)) {
        continue;
      }
      if (entryCount >= maxObjectEntries) {
        omitted = true;
        break;
      }
      output[entryKey] = boundedPreview(record[entryKey], budget, depth + 1, seen, entryKey);
      entryCount += 1;
      if (budget.remaining <= 0) break;
    }
    if (omitted) {
      output[truncatedDisplayValue] = "additional fields omitted";
      budget.truncated = true;
    }
    return output;
  } finally {
    seen.delete(value);
  }
}
function pathContainsSensitiveName(path) {
  return path.split("/").filter(Boolean).map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~")).some(isSensitiveName);
}
function isSensitiveName(value) {
  return sensitiveNames.test(value) || isSensitiveRequestLogHeaderName(value);
}
function normalizePath(value) {
  const path = value.trim();
  if (!path) return "/";
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return normalized.length <= maxStringChars ? normalized : `${normalized.slice(0, maxStringChars)}\u2026`;
}
function jsonByteLength(value) {
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8");
  } catch {
    return maxTraceBytes;
  }
}

// packages/core/test/unit/observability/route-trace.test.mjs
(0, import_node_test.default)("request log header redaction fails closed for custom authentication headers", () => {
  for (const name of [
    "x-auth-token",
    "x-amz-security-token",
    "x-company-client-secret",
    "x-private-key",
    "x-signed-request-signature",
    "x-custom-credential"
  ]) {
    import_strict.default.equal(isSensitiveRequestLogHeaderName(name), true, name);
  }
  for (const name of ["content-type", "user-agent", "x-request-id"]) {
    import_strict.default.equal(isSensitiveRequestLogHeaderName(name), false, name);
  }
});
(0, import_node_test.default)("route trace records actively reported changes and never persists sensitive values", () => {
  const startedAt = Date.now();
  const recorder = new RequestRouteTraceRecorder(startedAt);
  recorder.captureIngress();
  recorder.capture({
    changes: [
      { after: "model-b", before: "model-a", operation: "replace", path: "/body/model", scope: "body" },
      { after: "body-secret-b", before: "body-secret-a", operation: "replace", path: "/body/api_key", scope: "body" },
      { after: "Bearer header-secret-b", before: "Bearer header-secret-a", operation: "replace", path: "/headers/authorization", scope: "headers" },
      { after: "auth-sub-secret-b", before: "auth-sub-secret-a", operation: "replace", path: "/headers/x-auth-sub", scope: "headers" },
      {
        after: "https://upstream.example/v1/messages?access_token=url-secret-b",
        before: "http://127.0.0.1/v1/messages?access_token=url-secret-a",
        operation: "replace",
        path: "/url",
        scope: "url"
      }
    ],
    decision: { policyId: "rule:test", reason: "unit-test", source: "rule" },
    kind: "mutation",
    name: "router.policy",
    phase: "routing",
    target: { model: "model-b", provider: "provider-b" }
  });
  const trace = recorder.finish();
  const serialized = JSON.stringify(trace);
  import_strict.default.equal(trace.hopCount, 2);
  import_strict.default.equal(trace.version, 2);
  import_strict.default.equal(trace.ingressSnapshot, void 0);
  import_strict.default.equal(trace.finalSnapshot, void 0);
  import_strict.default.equal(trace.hops[1].decision.policyId, "rule:test");
  import_strict.default.ok(trace.hops[1].changes.some((change) => change.path === "/body/model"));
  import_strict.default.ok(trace.hops[1].changes.some((change) => change.path === "/headers/authorization" && change.redacted));
  import_strict.default.match(serialized, /\[redacted\]/);
  import_strict.default.ok(trace.hops[1].changes.some((change) => change.path === "/headers/x-auth-sub" && change.redacted));
  import_strict.default.doesNotMatch(serialized, /header-secret|auth-sub-secret|body-secret|url-secret/);
});
(0, import_node_test.default)("route trace omits body values when request body capture is disabled", () => {
  const recorder = new RequestRouteTraceRecorder(Date.now());
  recorder.captureIngress();
  recorder.capture({
    changes: [
      {
        after: [{ role: "user", content: "after-private-message" }],
        before: [{ role: "user", content: "before-private-message" }],
        operation: "replace",
        path: "/body/messages",
        scope: "body"
      },
      {
        after: "diagnostic-value",
        operation: "add",
        path: "/headers/x-ccr-route-source",
        scope: "headers"
      }
    ],
    name: "router.policy",
    phase: "routing"
  });
  const trace = recorder.finish({ captureBodyValues: false });
  const bodyChange = trace.hops[1].changes[0];
  import_strict.default.deepEqual(bodyChange, {
    operation: "replace",
    path: "/body/messages",
    scope: "body"
  });
  import_strict.default.equal(trace.hops[1].changes[1].after, "diagnostic-value");
  import_strict.default.doesNotMatch(JSON.stringify(trace), /private-message/);
});
(0, import_node_test.default)("route trace bounds actively reported values without parsing request bodies", () => {
  const recorder = new RequestRouteTraceRecorder(Date.now());
  const largeBody = Buffer.alloc(512 * 1024, "x");
  recorder.captureIngress();
  for (let index = 0; index < 200; index += 1) {
    recorder.capture({
      changes: [{ after: largeBody, operation: "replace", path: "/body", scope: "body" }],
      name: `hop-${index}`,
      phase: "routing"
    });
  }
  const trace = recorder.finish();
  import_strict.default.ok(trace.hopCount <= 64);
  import_strict.default.equal(trace.truncated, true);
  import_strict.default.deepEqual(trace.hops[1].changes[0].after, { sizeBytes: largeBody.byteLength, type: "buffer" });
  import_strict.default.doesNotMatch(JSON.stringify(trace), /xxxxxxxx/);
  import_strict.default.ok(Buffer.byteLength(JSON.stringify(trace)) <= 256 * 1024 + 4096);
});
