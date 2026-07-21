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

// packages/core/test/unit/agents/gateway-upstream-error-log.test.mjs
var import_strict = __toESM(require("node:assert/strict"), 1);
var import_node_test = __toESM(require("node:test"), 1);

// packages/core/src/gateway/remote-control-service.ts
var import_node_crypto = require("node:crypto");
var ccrRemoteControlPathPrefix = "/__ccr/remote";
var maxSessions = 100;
var maxEventsPerSession = 2e3;
var maxInboundEventsPerSession = 500;
var sseHeartbeatMs = 15e3;
var CcrRemoteControlService = class {
  sessions = /* @__PURE__ */ new Map();
  async handleRequest(context) {
    const segments = remotePathSegments(context.path);
    const [root, sessionId, resource] = segments;
    if (segments.length === 0 || context.path === ccrRemoteControlPathPrefix) {
      this.sendCapabilities(context);
      return;
    }
    if (root === "capabilities") {
      this.sendCapabilities(context);
      return;
    }
    if (root !== "sessions") {
      context.sendJson(context.response, 404, { error: { message: "Remote control endpoint not found." } });
      return;
    }
    if (!sessionId) {
      await this.handleSessionsRequest(context);
      return;
    }
    if (!resource) {
      await this.handleSessionRequest(context, sessionId);
      return;
    }
    if (resource === "events") {
      await this.handleEventsRequest(context, sessionId);
      return;
    }
    if (resource === "inbound") {
      await this.handleInboundRequest(context, sessionId);
      return;
    }
    if (resource === "presence") {
      await this.handlePresenceRequest(context, sessionId);
      return;
    }
    context.sendJson(context.response, 404, { error: { message: "Remote control session endpoint not found." } });
  }
  sendCapabilities(context) {
    context.sendJson(context.response, 200, {
      endpoints: {
        createSession: `${context.endpoint}${ccrRemoteControlPathPrefix}/sessions`,
        inbound: `${context.endpoint}${ccrRemoteControlPathPrefix}/sessions/{sessionId}/inbound`,
        sessionEvents: `${context.endpoint}${ccrRemoteControlPathPrefix}/sessions/{sessionId}/events`
      },
      name: "ccr-remote-control",
      protocol: "ccr.remote.v1",
      transport: ["json", "sse"],
      capabilities: {
        catchupReplay: true,
        fanout: true,
        inboundQueue: true,
        presence: true
      }
    });
  }
  async handleSessionsRequest(context) {
    if (context.request.method === "GET") {
      context.sendJson(context.response, 200, {
        sessions: [...this.sessions.values()].map((session2) => this.sessionSummary(session2, context.endpoint))
      });
      return;
    }
    if (context.request.method !== "POST") {
      context.sendJson(context.response, 405, { error: { message: "Method not allowed." } });
      return;
    }
    const body = await this.readJsonBody(context);
    if (!body) {
      return;
    }
    const id = sanitizeSessionId(readString(body.id) || readString(body.sessionId)) || (0, import_node_crypto.randomUUID)();
    const title = readString(body.title) || readString(body.name) || `CCR Remote ${id.slice(0, 8)}`;
    const metadata = readRecord(body.metadata) ?? {};
    const session = this.ensureSession(id, title, metadata);
    this.appendEvent(session, {
      direction: "system",
      payload: { title },
      source: "ccr-gateway",
      type: "session.created"
    });
    context.sendJson(context.response, 201, {
      session: this.sessionSnapshot(session, context.endpoint)
    });
  }
  async handleSessionRequest(context, sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      context.sendJson(context.response, 404, { error: { message: "Remote session not found." } });
      return;
    }
    if (context.request.method === "GET") {
      context.sendJson(context.response, 200, { session: this.sessionSnapshot(session, context.endpoint) });
      return;
    }
    if (context.request.method === "PATCH") {
      const body = await this.readJsonBody(context);
      if (!body) {
        return;
      }
      const title = readString(body.title) || readString(body.name);
      if (title) {
        session.title = title;
      }
      const metadata = readRecord(body.metadata);
      if (metadata) {
        session.metadata = { ...session.metadata, ...metadata };
      }
      session.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
      this.appendEvent(session, {
        direction: "system",
        payload: { metadata: metadata ?? {}, title: title ?? session.title },
        source: "ccr-gateway",
        type: "session.updated"
      });
      context.sendJson(context.response, 200, { session: this.sessionSnapshot(session, context.endpoint) });
      return;
    }
    if (context.request.method === "DELETE") {
      session.archivedAt = (/* @__PURE__ */ new Date()).toISOString();
      session.updatedAt = session.archivedAt;
      this.appendEvent(session, {
        direction: "system",
        payload: { archivedAt: session.archivedAt },
        source: "ccr-gateway",
        type: "session.archived"
      });
      context.sendJson(context.response, 200, { archived: true, session: this.sessionSummary(session, context.endpoint) });
      return;
    }
    context.sendJson(context.response, 405, { error: { message: "Method not allowed." } });
  }
  async handleEventsRequest(context, sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      context.sendJson(context.response, 404, { error: { message: "Remote session not found." } });
      return;
    }
    if (context.request.method === "GET") {
      const after = remoteAfterSeq(context.request);
      if (wantsSse(context.request)) {
        this.openSse(context, session, "events", after);
        return;
      }
      context.sendJson(context.response, 200, {
        events: session.events.filter((event) => event.seq > after),
        session: this.sessionSummary(session, context.endpoint)
      });
      return;
    }
    if (context.request.method !== "POST") {
      context.sendJson(context.response, 405, { error: { message: "Method not allowed." } });
      return;
    }
    const body = await this.readJsonBody(context);
    if (!body) {
      return;
    }
    const events = normalizeEventInputs(body).map(
      (event) => this.appendEvent(session, {
        ...event,
        direction: event.direction ?? "local",
        type: event.type || "message"
      })
    );
    context.sendJson(context.response, 202, {
      accepted: events.length,
      events,
      session: this.sessionSummary(session, context.endpoint)
    });
  }
  async handleInboundRequest(context, sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      context.sendJson(context.response, 404, { error: { message: "Remote session not found." } });
      return;
    }
    if (context.request.method === "GET") {
      const after = remoteAfterSeq(context.request);
      if (wantsSse(context.request)) {
        this.openSse(context, session, "inbound", after);
        return;
      }
      context.sendJson(context.response, 200, {
        events: session.inboundEvents.filter((event) => event.seq > after),
        session: this.sessionSummary(session, context.endpoint)
      });
      return;
    }
    if (context.request.method !== "POST") {
      context.sendJson(context.response, 405, { error: { message: "Method not allowed." } });
      return;
    }
    const body = await this.readJsonBody(context);
    if (!body) {
      return;
    }
    const events = normalizeEventInputs(body).map(
      (event) => this.appendEvent(session, {
        ...event,
        direction: "remote",
        type: event.type || "user.message"
      }, true)
    );
    context.sendJson(context.response, 202, {
      accepted: events.length,
      events,
      session: this.sessionSummary(session, context.endpoint)
    });
  }
  async handlePresenceRequest(context, sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      context.sendJson(context.response, 404, { error: { message: "Remote session not found." } });
      return;
    }
    if (context.request.method === "GET") {
      context.sendJson(context.response, 200, { presence: session.presence });
      return;
    }
    if (context.request.method !== "POST") {
      context.sendJson(context.response, 405, { error: { message: "Method not allowed." } });
      return;
    }
    const body = await this.readJsonBody(context);
    if (!body) {
      return;
    }
    const clientId = sanitizeSessionId(readString(body.clientId) || readString(body.id)) || (0, import_node_crypto.randomUUID)();
    const presence = {
      lastSeenAt: (/* @__PURE__ */ new Date()).toISOString(),
      metadata: readRecord(body.metadata) ?? {},
      name: readString(body.name) || clientId,
      role: readString(body.role) || "client"
    };
    session.presence[clientId] = presence;
    const event = this.appendEvent(session, {
      direction: "system",
      payload: { clientId, presence },
      source: "ccr-gateway",
      type: "presence.updated"
    });
    context.sendJson(context.response, 202, { event, presence: session.presence });
  }
  ensureSession(id, title, metadata) {
    const existing = this.sessions.get(id);
    if (existing) {
      existing.metadata = { ...existing.metadata, ...metadata };
      existing.title = title || existing.title;
      existing.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
      return existing;
    }
    this.pruneSessions();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const session = {
      createdAt: now,
      events: [],
      id,
      inboundEvents: [],
      lastSeq: 0,
      metadata,
      presence: {},
      seenDedupeKeys: /* @__PURE__ */ new Map(),
      subscribers: /* @__PURE__ */ new Set(),
      title,
      updatedAt: now
    };
    this.sessions.set(id, session);
    return session;
  }
  appendEvent(session, input, inbound = false) {
    const dedupeKey = input.dedupeKey || input.id;
    if (dedupeKey) {
      const duplicate = session.seenDedupeKeys.get(dedupeKey);
      if (duplicate) {
        return duplicate;
      }
    }
    const event = {
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      ...dedupeKey ? { dedupeKey } : {},
      direction: input.direction ?? "local",
      id: input.id || (0, import_node_crypto.randomUUID)(),
      payload: input.payload ?? {},
      ...input.role ? { role: input.role } : {},
      seq: ++session.lastSeq,
      sessionId: session.id,
      ...input.source ? { source: input.source } : {},
      ...input.text ? { text: input.text } : {},
      type: input.type || "message"
    };
    session.events.push(event);
    trimArray(session.events, maxEventsPerSession);
    if (inbound || event.direction === "remote" || event.direction === "inbound") {
      session.inboundEvents.push(event);
      trimArray(session.inboundEvents, maxInboundEventsPerSession);
    }
    if (dedupeKey) {
      session.seenDedupeKeys.set(dedupeKey, event);
      while (session.seenDedupeKeys.size > maxEventsPerSession) {
        const oldest = session.seenDedupeKeys.keys().next().value;
        if (!oldest) {
          break;
        }
        session.seenDedupeKeys.delete(oldest);
      }
    }
    session.updatedAt = event.createdAt;
    this.broadcast(session, event);
    return event;
  }
  openSse(context, session, kind, after) {
    context.response.writeHead(200, {
      "cache-control": "no-cache, no-transform",
      "connection": "keep-alive",
      "content-type": "text/event-stream; charset=utf-8",
      "x-accel-buffering": "no"
    });
    context.response.write(": connected\n\n");
    const source = kind === "events" ? session.events : session.inboundEvents;
    for (const event of source.filter((item) => item.seq > after)) {
      writeSseEvent(context.response, event);
    }
    const heartbeat = setInterval(() => {
      if (!context.response.destroyed) {
        context.response.write(": keepalive\n\n");
      }
    }, sseHeartbeatMs);
    const subscriber = {
      close: () => clearInterval(heartbeat),
      id: (0, import_node_crypto.randomUUID)(),
      kind,
      response: context.response
    };
    session.subscribers.add(subscriber);
    context.request.once("close", () => {
      subscriber.close();
      session.subscribers.delete(subscriber);
    });
  }
  broadcast(session, event) {
    for (const subscriber of session.subscribers) {
      if (subscriber.kind === "inbound" && !(event.direction === "remote" || event.direction === "inbound")) {
        continue;
      }
      if (subscriber.response.destroyed) {
        subscriber.close();
        session.subscribers.delete(subscriber);
        continue;
      }
      writeSseEvent(subscriber.response, event);
    }
  }
  sessionSnapshot(session, endpoint) {
    return {
      ...this.sessionSummary(session, endpoint),
      events: session.events,
      inboundEvents: session.inboundEvents,
      metadata: session.metadata,
      presence: session.presence
    };
  }
  sessionSummary(session, endpoint) {
    return {
      ...session.archivedAt ? { archivedAt: session.archivedAt } : {},
      createdAt: session.createdAt,
      endpoints: {
        events: `${endpoint}${ccrRemoteControlPathPrefix}/sessions/${encodeURIComponent(session.id)}/events`,
        inbound: `${endpoint}${ccrRemoteControlPathPrefix}/sessions/${encodeURIComponent(session.id)}/inbound`,
        presence: `${endpoint}${ccrRemoteControlPathPrefix}/sessions/${encodeURIComponent(session.id)}/presence`
      },
      eventCount: session.events.length,
      id: session.id,
      inboundCount: session.inboundEvents.length,
      lastSeq: session.lastSeq,
      subscriberCount: session.subscribers.size,
      title: session.title,
      updatedAt: session.updatedAt
    };
  }
  pruneSessions() {
    while (this.sessions.size >= maxSessions) {
      const oldest = [...this.sessions.values()].sort((left, right) => Date.parse(left.updatedAt) - Date.parse(right.updatedAt))[0];
      if (!oldest) {
        return;
      }
      for (const subscriber of oldest.subscribers) {
        subscriber.close();
        subscriber.response.end();
      }
      this.sessions.delete(oldest.id);
    }
  }
  async readJsonBody(context) {
    const body = await context.readBody(context.request);
    if (body.length === 0) {
      return {};
    }
    try {
      const parsed = JSON.parse(body.toString("utf8"));
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        return parsed;
      }
      context.sendJson(context.response, 400, { error: { message: "Request body must be a JSON object." } });
      return void 0;
    } catch {
      context.sendJson(context.response, 400, { error: { message: "Request body must be valid JSON." } });
      return void 0;
    }
  }
};
var ccrRemoteControlService = new CcrRemoteControlService();
function normalizeEventInputs(body) {
  const rawEvents = Array.isArray(body.events) ? body.events : [body];
  return rawEvents.filter((event) => typeof event === "object" && event !== null && !Array.isArray(event)).map((event) => {
    const payload = Object.prototype.hasOwnProperty.call(event, "payload") ? event.payload : Object.prototype.hasOwnProperty.call(event, "message") ? event.message : {};
    return {
      dedupeKey: readString(event.dedupeKey) || readString(event.uuid) || readString(event.requestId),
      direction: readDirection(event.direction),
      id: readString(event.id),
      payload,
      role: readString(event.role),
      source: readString(event.source),
      text: readString(event.text) || readString(event.content),
      type: readString(event.type)
    };
  });
}
function writeSseEvent(response, event) {
  response.write(`id: ${event.seq}
`);
  response.write(`event: ${event.type.replace(/[\r\n]+/g, "") || "message"}
`);
  response.write(`data: ${JSON.stringify(event)}

`);
}
function wantsSse(request) {
  const url = new URL(request.url || "/", "http://127.0.0.1");
  return url.searchParams.get("stream") === "1" || url.searchParams.get("stream") === "true" || readHeader(request.headers.accept)?.toLowerCase().includes("text/event-stream") === true;
}
function remoteAfterSeq(request) {
  const url = new URL(request.url || "/", "http://127.0.0.1");
  const after = Number(url.searchParams.get("after") ?? readHeader(request.headers["last-event-id"]) ?? 0);
  return Number.isFinite(after) && after > 0 ? Math.floor(after) : 0;
}
function remotePathSegments(path) {
  const suffix = path.slice(ccrRemoteControlPathPrefix.length).replace(/^\/+|\/+$/g, "");
  if (!suffix) {
    return [];
  }
  return suffix.split("/").map((segment) => decodeURIComponent(segment)).filter(Boolean);
}
function readDirection(value) {
  return value === "inbound" || value === "local" || value === "remote" || value === "system" ? value : void 0;
}
function readHeader(value) {
  if (Array.isArray(value)) {
    return value[0]?.trim();
  }
  return typeof value === "string" && value.trim() ? value.trim() : void 0;
}
function readRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
}
function readString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : void 0;
}
function sanitizeSessionId(value) {
  const sanitized = value?.trim().replace(/[^a-zA-Z0-9:._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 128);
  return sanitized || void 0;
}
function trimArray(items, maxLength) {
  if (items.length > maxLength) {
    items.splice(0, items.length - maxLength);
  }
}

// packages/core/src/gateway/internal/shared.ts
var import_node_module = require("node:module");
var requireFromHere = (0, import_node_module.createRequire)(__filename);
var maxUsageCaptureBytes = 8 * 1024 * 1024;
var codexPatchBridgeInstructionText = [
  "When modifying files, call virtual_apply_patch.",
  "Do not use exec_command or write_stdin to edit files, including shell redirection, heredocs, cat >, tee, sed -i, perl -i, python, node scripts, or similar shell-based edits.",
  "Use exec_command only for reading files, listing/searching, running builds/tests, starting servers, and other commands that are not manual file edits."
].join(" ");
var codexPatchBridgeShellToolGuidance = [
  "When virtual_apply_patch is available, do not use this tool to edit files.",
  "Do not write files with shell redirection, heredocs, cat >, tee, sed -i, perl -i, python, node scripts, or similar commands.",
  "Use virtual_apply_patch for manual file changes."
].join(" ");
var virtualApplyPatchLarkGrammar = [
  "start: begin_patch hunk+ end_patch",
  'begin_patch: "*** Begin Patch" LF',
  'end_patch: "*** End Patch" LF?',
  "",
  "hunk: add_hunk | delete_hunk | update_hunk",
  'add_hunk: "*** Add File: " filename LF add_line+',
  'delete_hunk: "*** Delete File: " filename LF',
  'update_hunk: "*** Update File: " filename LF change_move? change?',
  "",
  "filename: /(.+)/",
  'add_line: "+" /(.*)/ LF -> line',
  "",
  'change_move: "*** Move to: " filename LF',
  "change: (change_context | change_line)+ eof_line?",
  'change_context: ("@@" | "@@ " /(.+)/) LF',
  'change_line: ("+" | "-" | " ") /(.*)/ LF',
  'eof_line: "*** End of File" LF',
  "",
  "%import common.LF"
].join("\n");

// packages/core/src/gateway/http/io.ts
function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}
function formatUpstreamErrorForLog(error, context) {
  const chain = collectErrorChain(error);
  const outer = chain[0];
  const cause = chain[chain.length - 1] ?? outer;
  const code = firstErrorProperty(chain, "code");
  const errno = firstErrorProperty(chain, "errno");
  const syscall = firstErrorProperty(chain, "syscall");
  const message = redactUpstreamCredentialValues(outer?.message || formatError(error)) || "Unknown upstream error";
  const causeMessage = redactUpstreamCredentialValues(cause?.message || "");
  const phase = inferUpstreamErrorPhase({
    code,
    message: `${message} ${causeMessage}`,
    name: cause?.name,
    responseStarted: context.responseStarted,
    syscall
  });
  const fields = [
    `cause=${normalizeDiagnosticValue(cause?.name || "UnknownError")}`,
    code ? `code=${normalizeDiagnosticValue(code)}` : void 0,
    errno ? `errno=${normalizeDiagnosticValue(errno)}` : void 0,
    syscall ? `syscall=${normalizeDiagnosticValue(syscall)}` : void 0,
    `phase=${phase}`,
    `response_started=${context.responseStarted}`,
    `attempts=${Math.max(1, Math.trunc(context.attempts))}`,
    `fallback_failures=${Math.max(0, Math.trunc(context.fallbackFailures))}`,
    `retry_delay_ms=${Math.max(0, Math.trunc(context.retryDelayMs ?? 0))}`,
    `elapsed_ms=${Math.max(0, Math.trunc(context.elapsedMs))}`,
    !code && causeMessage && causeMessage !== message ? `detail=${JSON.stringify(causeMessage)}` : void 0
  ].filter((field) => Boolean(field));
  return `Upstream ${context.operation} failed: ${message} [${fields.join("; ")}]`;
}
function collectErrorChain(error) {
  const chain = [];
  const seen = /* @__PURE__ */ new Set();
  let current = error;
  for (let depth = 0; depth < 6 && isObject(current) && !seen.has(current); depth += 1) {
    seen.add(current);
    chain.push({
      error: current,
      message: typeof readErrorProperty(current, "message") === "string" ? String(readErrorProperty(current, "message")) : void 0,
      name: typeof readErrorProperty(current, "name") === "string" ? String(readErrorProperty(current, "name")) : void 0
    });
    current = readErrorProperty(current, "cause");
  }
  return chain;
}
function firstErrorProperty(chain, key) {
  for (const item of chain) {
    const value = readErrorProperty(item.error, key);
    if (typeof value === "string" || typeof value === "number") {
      const normalized = String(value).trim();
      if (normalized) {
        return normalized;
      }
    }
  }
  return void 0;
}
function inferUpstreamErrorPhase(input) {
  const signature = `${input.code ?? ""} ${input.name ?? ""} ${input.message} ${input.syscall ?? ""}`.toUpperCase();
  if (/ABORT|CANCEL/.test(signature)) return "aborted";
  if (/ENOTFOUND|EAI_AGAIN|DNS/.test(signature)) return "dns";
  if (/CERT|TLS|SSL|EPROTO/.test(signature)) return "tls";
  if (/HEADERS?_TIMEOUT|RESPONSE_HEADERS|WAITING FOR HEADERS/.test(signature)) return "response_headers";
  if (/BODY_TIMEOUT|RESPONSE_BODY/.test(signature)) return "response_body";
  if (/ECONNRESET|EPIPE|UND_ERR_SOCKET/.test(signature)) {
    return input.responseStarted ? "response_body" : "connect";
  }
  if (/CONNECT|ECONNREFUSED|ETIMEDOUT/.test(signature)) return "connect";
  return input.responseStarted ? "response_body" : "fetch";
}
function redactUpstreamCredentialValues(value) {
  return value.replace(/(\b(?:https?|wss?):\/\/[^/\s:@]+:)[^@\s/]+@/gi, "$1[redacted]@").replace(/([?&](?:api[-_]?key|key|token|access[-_]?token|refresh[-_]?token|client[-_]?secret|auth|authorization|password)=)[^&\s#]*/gi, "$1[redacted]").replace(/"((?:proxy[-_])?authorization|(?:x[-_](?:[a-z0-9]+[-_])*)?api[-_]?key|access[-_]?token|refresh[-_]?token|client[-_]?secret|token|password)"\s*:\s*"(?:\\.|[^"\\])*"/gi, '"$1":"[redacted]"').replace(/\b((?:proxy[-_])?authorization)\s*([:=])\s*(?:(?:Bearer|Basic)\s+)?[^\s,;&#]+/gi, "$1$2[redacted]").replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, "Bearer [redacted]").replace(/\b(?:sk|rk|pk)-[A-Za-z0-9_-]{12,}/gi, "[redacted-secret]").replace(/\b((?:x[-_](?:[a-z0-9]+[-_])*)?api[-_]?key|access[-_]?token|refresh[-_]?token|client[-_]?secret|token|password)\s*([:=])\s*(?:"[^"]*"|'[^']*'|[^\s,;&#"']+)/gi, "$1$2[redacted]").replace(/\s+/g, " ").trim().slice(0, 240);
}
function normalizeDiagnosticValue(value) {
  const normalized = value.replace(/[^A-Za-z0-9_.:-]/g, "_").slice(0, 80);
  return normalized || "unknown";
}
function readErrorProperty(error, key) {
  try {
    return error[key];
  } catch {
    return void 0;
  }
}
function isObject(value) {
  return typeof value === "object" && value !== null || typeof value === "function";
}

// packages/core/test/unit/agents/gateway-upstream-error-log.test.mjs
(0, import_node_test.default)("upstream fetch diagnostics expose timeout phase and fallback counts without secrets", () => {
  const cause = Object.assign(
    new Error("Headers timeout at https://api.example.test/v1/responses?api_key=private-value"),
    {
      code: "UND_ERR_HEADERS_TIMEOUT",
      errno: -110,
      name: "HeadersTimeoutError",
      syscall: "read"
    }
  );
  const error = new TypeError(
    "fetch failed for https://api.example.test/v1/responses?api_key=private-value",
    { cause }
  );
  const message = formatUpstreamErrorForLog(error, {
    attempts: 2,
    elapsedMs: 307655,
    fallbackFailures: 1,
    operation: "fetch",
    responseStarted: false,
    retryDelayMs: 500
  });
  import_strict.default.match(message, /^Upstream fetch failed: fetch failed/);
  import_strict.default.match(message, /https:\/\/api\.example\.test\/v1\/responses\?api_key=\[redacted\]/);
  import_strict.default.match(message, /cause=HeadersTimeoutError/);
  import_strict.default.match(message, /code=UND_ERR_HEADERS_TIMEOUT/);
  import_strict.default.match(message, /errno=-110/);
  import_strict.default.match(message, /syscall=read/);
  import_strict.default.match(message, /phase=response_headers/);
  import_strict.default.match(message, /response_started=false/);
  import_strict.default.match(message, /attempts=2/);
  import_strict.default.match(message, /fallback_failures=1/);
  import_strict.default.match(message, /retry_delay_ms=500/);
  import_strict.default.match(message, /elapsed_ms=307655/);
  import_strict.default.doesNotMatch(message, /private-value/);
});
(0, import_node_test.default)("upstream stream diagnostics redact credentials without hiding the endpoint", () => {
  const error = Object.assign(
    new Error("read ECONNRESET from private.internal:443 using Bearer secret-token-value api_key=another-secret"),
    {
      code: "ECONNRESET",
      name: "SocketError",
      syscall: "read"
    }
  );
  const message = formatUpstreamErrorForLog(error, {
    attempts: 1,
    elapsedMs: 8123,
    fallbackFailures: 0,
    operation: "stream",
    responseStarted: true
  });
  import_strict.default.match(message, /^Upstream stream failed:/);
  import_strict.default.match(message, /code=ECONNRESET/);
  import_strict.default.match(message, /phase=response_body/);
  import_strict.default.match(message, /response_started=true/);
  import_strict.default.match(message, /from private\.internal:443/);
  import_strict.default.match(message, /Bearer \[redacted\]/);
  import_strict.default.match(message, /api_key=\[redacted\]/);
  import_strict.default.doesNotMatch(message, /secret-token-value|another-secret/);
});
(0, import_node_test.default)("upstream diagnostics preserve non-sensitive error details", () => {
  const message = formatUpstreamErrorForLog(
    new Error("failed to parse response from cache at http://10.0.0.5:8080/v1"),
    {
      attempts: 1,
      elapsedMs: 25,
      fallbackFailures: 0,
      operation: "fetch",
      responseStarted: false
    }
  );
  import_strict.default.match(message, /failed to parse response from cache/);
  import_strict.default.match(message, /http:\/\/10\.0\.0\.5:8080\/v1/);
});
(0, import_node_test.default)("upstream diagnostics hide credential values in JSON error text", () => {
  const message = formatUpstreamErrorForLog(
    new Error('{"apiKey":"secret-value","api_key":"other-secret","x-api-key":"third-secret","model":"gpt-5"}'),
    {
      attempts: 1,
      elapsedMs: 25,
      fallbackFailures: 0,
      operation: "fetch",
      responseStarted: false
    }
  );
  import_strict.default.match(message, /"apiKey":"\[redacted\]"/);
  import_strict.default.match(message, /"api_key":"\[redacted\]"/);
  import_strict.default.match(message, /"x-api-key":"\[redacted\]"/);
  import_strict.default.match(message, /"model":"gpt-5"/);
  import_strict.default.doesNotMatch(message, /secret-value|other-secret|third-secret/);
});
