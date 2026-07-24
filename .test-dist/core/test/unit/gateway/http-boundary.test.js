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

// packages/core/test/unit/gateway/http-boundary.test.mjs
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
var coreGatewayAuthHeader = "x-ccr-core-auth";
var localObservabilityHeaderNames = /* @__PURE__ */ new Set([
  "x-ccr-claude-app-model-rewrite",
  "x-ccr-codex-patch-bridge",
  "x-ccr-claude-model-discovery",
  "x-ccr-cursor-openai-compat",
  "x-ccr-logical-provider",
  "x-ccr-provider-credential-chain",
  "x-ccr-provider-credential-saturated"
]);
var proxyHeaderDenyList = /* @__PURE__ */ new Set(["connection", coreGatewayAuthHeader, "host", "upgrade"]);
var responseHeaderDenyList = /* @__PURE__ */ new Set(["connection", "content-encoding", "transfer-encoding"]);
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
function inferGatewayClient(apiKey, headers) {
  const explicit = readHeader2(headers["x-ccr-client"]) ?? readHeader2(headers["x-client-name"]) ?? readHeader2(headers["x-forwarded-client-cert"]);
  if (explicit) {
    return explicit;
  }
  const apiKeyClient = apiKey?.name?.trim() || apiKey?.id?.trim();
  const userAgentClient = inferClientFromUserAgent(headers);
  if (readHeader2(headers["x-ccr-proxy-mode"]) === "gateway") {
    return userAgentClient ?? apiKeyClient;
  }
  return apiKeyClient ?? userAgentClient;
}
function inferClientFromUserAgent(headers) {
  const userAgent = readHeader2(headers["user-agent"]);
  if (!userAgent) {
    return void 0;
  }
  const normalized = userAgent.toLowerCase();
  if (normalized.includes("codex")) {
    return "Codex";
  }
  if (normalized.includes("@anthropic-ai/claude-code") || normalized.includes("claude-code") || normalized.includes("claude code")) {
    return "Claude Code";
  }
  if (normalized.includes("claude")) {
    return "Claude";
  }
  if (normalized.includes("curl")) {
    return "curl";
  }
  if (normalized.includes("python")) {
    return "Python";
  }
  if (normalized.includes("node")) {
    return "Node.js";
  }
  if (normalized.includes("chrome")) {
    return "Google Chrome";
  }
  if (normalized.includes("safari") && !normalized.includes("chrome")) {
    return "Safari";
  }
  return userAgent.split(/[ /]/)[0]?.trim() || void 0;
}
function readAuthToken(headers) {
  const raw = readHeader2(headers.authorization) || readHeader2(headers["x-api-key"]);
  if (!raw) {
    return void 0;
  }
  return raw.toLowerCase().startsWith("bearer ") ? raw.slice(7).trim() : raw;
}
function readRemoteControlQueryAuthToken(request) {
  const url = new URL(request.url || "/", "http://127.0.0.1");
  if (url.pathname !== ccrRemoteControlPathPrefix && !url.pathname.startsWith(`${ccrRemoteControlPathPrefix}/`)) {
    return void 0;
  }
  return url.searchParams.get("api_key")?.trim() || url.searchParams.get("key")?.trim() || void 0;
}
function forwardHeaders(headers) {
  const forwarded = {};
  for (const [key, value] of Object.entries(headers)) {
    const normalized = key.toLowerCase();
    if (proxyHeaderDenyList.has(normalized) || value === void 0) {
      continue;
    }
    forwarded[normalized] = Array.isArray(value) ? value.join(",") : String(value);
  }
  return forwarded;
}
function stripLocalGatewayAuthHeaders(headers) {
  delete headers.authorization;
  delete headers["x-api-key"];
  delete headers["api-key"];
}
function omitLocalObservabilityHeaders(headers) {
  const forwarded = { ...headers };
  for (const name of localObservabilityHeaderNames) {
    delete forwarded[name];
  }
  return forwarded;
}
function withCoreGatewayAuthHeader(headers, token) {
  if (!token) {
    throw new Error("Core gateway auth token is not initialized.");
  }
  return {
    ...headers,
    [coreGatewayAuthHeader]: token
  };
}
function filteredResponseHeaders(headers) {
  const entries = [];
  headers.forEach((value, key) => {
    if (!responseHeaderDenyList.has(key.toLowerCase())) {
      entries.push([key, value]);
    }
  });
  return entries;
}
function abortSignalMessage(signal) {
  const reason = signal.reason;
  if (reason instanceof Error && reason.message) {
    return reason.message;
  }
  if (typeof reason === "string" && reason.trim()) {
    return reason.trim();
  }
  return "Upstream request was aborted.";
}
function parseJsonObject(buffer) {
  if (buffer.length === 0) {
    return {};
  }
  const parsed = JSON.parse(buffer.toString("utf8"));
  if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
    return parsed;
  }
  throw new Error("Request body must be a JSON object.");
}
function readHeader2(value) {
  if (Array.isArray(value)) {
    return value[0]?.trim();
  }
  return typeof value === "string" && value.trim() ? value.trim() : void 0;
}
function shouldSendBody(method) {
  const normalized = method?.toUpperCase();
  return normalized !== "GET" && normalized !== "HEAD";
}
function shouldCaptureGatewayUsage(method, _path) {
  return shouldSendBody(method);
}

// packages/core/src/gateway/http/body.ts
var parsedJsonObjectCache = /* @__PURE__ */ new WeakMap();
function parseJsonObjectCached(buffer) {
  const cached = parsedJsonObjectCache.get(buffer);
  if (cached) {
    if ("error" in cached) {
      throw cached.error;
    }
    return cached.value;
  }
  try {
    const value = parseJsonObject(buffer);
    parsedJsonObjectCache.set(buffer, { value });
    return value;
  } catch (error) {
    parsedJsonObjectCache.set(buffer, { error });
    throw error;
  }
}
function takeJsonObject(buffer) {
  const value = parseJsonObjectCached(buffer);
  parsedJsonObjectCache.delete(buffer);
  return value;
}
function parseJsonObjectSafe(buffer) {
  if (!buffer || buffer.byteLength === 0) {
    return void 0;
  }
  try {
    return parseJsonObjectCached(buffer);
  } catch {
    return void 0;
  }
}
function releaseJsonObject(buffer) {
  if (buffer) {
    parsedJsonObjectCache.delete(buffer);
  }
}
function serializeJsonBody(body) {
  const buffer = Buffer.from(`${JSON.stringify(body)}
`, "utf8");
  parsedJsonObjectCache.set(buffer, { value: body });
  return buffer;
}
function serializeJsonBodyWithModel(body, model) {
  return serializeJsonBody({ ...body, model });
}

// packages/core/test/unit/gateway/http-boundary.test.mjs
(0, import_node_test.default)("gateway client inference honors explicit, proxy, API-key, and user-agent identity", () => {
  import_strict.default.equal(inferGatewayClient(void 0, { "x-ccr-client": "  Desktop App  " }), "Desktop App");
  import_strict.default.equal(inferGatewayClient({ id: "key-id", name: "Team key" }, { "user-agent": "codex-cli/1.0" }), "Team key");
  import_strict.default.equal(
    inferGatewayClient(
      { id: "key-id", name: "Team key" },
      { "user-agent": "codex-cli/1.0", "x-ccr-proxy-mode": "gateway" }
    ),
    "Codex"
  );
  import_strict.default.equal(inferGatewayClient(void 0, { "user-agent": "curl/8.0" }), "curl");
  import_strict.default.equal(inferGatewayClient(void 0, { "user-agent": "custom-client/2.1" }), "custom-client");
});
(0, import_node_test.default)("gateway authentication accepts supported headers and scopes query tokens to remote control", () => {
  import_strict.default.equal(readAuthToken({ authorization: " Bearer secret-token " }), "secret-token");
  import_strict.default.equal(readAuthToken({ "x-api-key": " api-key-token " }), "api-key-token");
  import_strict.default.equal(readAuthToken({}), void 0);
  import_strict.default.equal(readHeader2([" first ", "second"]), "first");
  import_strict.default.equal(
    readRemoteControlQueryAuthToken({ url: "/__ccr/remote/status?api_key=query-token" }),
    "query-token"
  );
  import_strict.default.equal(
    readRemoteControlQueryAuthToken({ url: "/__ccr/remote/session?key=fallback-token" }),
    "fallback-token"
  );
  import_strict.default.equal(readRemoteControlQueryAuthToken({ url: "/v1/messages?api_key=must-not-leak" }), void 0);
});
(0, import_node_test.default)("gateway header forwarding strips hop-by-hop, local auth, and observability headers", () => {
  const forwarded = forwardHeaders({
    connection: "keep-alive",
    host: "127.0.0.1:3456",
    "x-ccr-core-auth": "internal-secret",
    "x-extra": ["one", "two"],
    "x-keep": "yes"
  });
  import_strict.default.deepEqual(forwarded, {
    "x-extra": "one,two",
    "x-keep": "yes"
  });
  const authHeaders = {
    "api-key": "legacy",
    authorization: "Bearer local",
    "x-api-key": "local",
    "x-keep": "yes"
  };
  stripLocalGatewayAuthHeaders(authHeaders);
  import_strict.default.deepEqual(authHeaders, { "x-keep": "yes" });
  import_strict.default.deepEqual(
    omitLocalObservabilityHeaders({
      "x-ccr-logical-provider": "Provider",
      "x-ccr-provider-credential-chain": "credential",
      "x-keep": "yes"
    }),
    { "x-keep": "yes" }
  );
});
(0, import_node_test.default)("core gateway auth and upstream response headers stay on their intended boundary", () => {
  import_strict.default.deepEqual(withCoreGatewayAuthHeader({ accept: "application/json" }, "core-token"), {
    accept: "application/json",
    "x-ccr-core-auth": "core-token"
  });
  import_strict.default.throws(() => withCoreGatewayAuthHeader({}, ""), /not initialized/);
  const headers = new Headers({
    connection: "close",
    "content-encoding": "gzip",
    "content-type": "application/json",
    "x-request-id": "request-1"
  });
  import_strict.default.deepEqual(filteredResponseHeaders(headers), [
    ["content-type", "application/json"],
    ["x-request-id", "request-1"]
  ]);
});
(0, import_node_test.default)("gateway JSON helpers accept only objects and preserve the selected model", () => {
  import_strict.default.deepEqual(parseJsonObject(Buffer.alloc(0)), {});
  import_strict.default.deepEqual(parseJsonObject(Buffer.from('{"model":"old","stream":true}')), {
    model: "old",
    stream: true
  });
  import_strict.default.throws(() => parseJsonObject(Buffer.from("[]")), /must be a JSON object/);
  import_strict.default.throws(() => parseJsonObject(Buffer.from("null")), /must be a JSON object/);
  import_strict.default.equal(parseJsonObjectSafe(void 0), void 0);
  import_strict.default.equal(parseJsonObjectSafe(Buffer.from("not-json")), void 0);
  import_strict.default.deepEqual(parseJsonObjectSafe(Buffer.from('{"ok":true}')), { ok: true });
  import_strict.default.equal(
    serializeJsonBodyWithModel({ model: "old", stream: true }, "Provider/new").toString("utf8"),
    '{"model":"Provider/new","stream":true}\n'
  );
});
(0, import_node_test.default)("gateway JSON helpers reuse immutable parses and release mutable ownership", () => {
  const buffer = Buffer.from('{"model":"old","stream":true}');
  const cached = parseJsonObjectCached(buffer);
  import_strict.default.equal(parseJsonObjectCached(buffer), cached);
  import_strict.default.equal(parseJsonObjectSafe(buffer), cached);
  const owned = takeJsonObject(buffer);
  import_strict.default.equal(owned, cached);
  owned.model = "mutated";
  const reparsed = parseJsonObjectCached(buffer);
  import_strict.default.notEqual(reparsed, owned);
  import_strict.default.equal(reparsed.model, "old");
  const body = { model: "Provider/new", stream: true };
  const serialized = serializeJsonBody(body);
  import_strict.default.equal(parseJsonObjectCached(serialized), body);
  releaseJsonObject(serialized);
  import_strict.default.notEqual(parseJsonObjectCached(serialized), body);
});
(0, import_node_test.default)("gateway method and abort helpers cover body and cancellation edge cases", () => {
  import_strict.default.equal(shouldSendBody("GET"), false);
  import_strict.default.equal(shouldSendBody("head"), false);
  import_strict.default.equal(shouldSendBody("POST"), true);
  import_strict.default.equal(shouldSendBody(void 0), true);
  import_strict.default.equal(shouldCaptureGatewayUsage("PATCH", "/v1/messages"), true);
  import_strict.default.equal(shouldCaptureGatewayUsage("GET", "/v1/messages"), false);
  const errorController = new AbortController();
  errorController.abort(new Error("client disconnected"));
  import_strict.default.equal(abortSignalMessage(errorController.signal), "client disconnected");
  const textController = new AbortController();
  textController.abort("  timed out  ");
  import_strict.default.equal(abortSignalMessage(textController.signal), "timed out");
});
