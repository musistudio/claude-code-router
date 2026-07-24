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

// packages/core/test/unit/providers/credential-pool.test.mjs
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

// packages/core/src/gateway/internal/value.ts
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// packages/core/src/gateway/limits/window-limiter.ts
var apiKeyLimitCounterRetentionWindows = 2;
var apiKeyLimitCounters = /* @__PURE__ */ new Map();
function limitRules(limits, usage) {
  if (!limits) {
    return [];
  }
  const rules = [];
  addLimitRule(rules, "requests", "requests", limits.windowMs ?? 6e4, limits.maxRequests, 1);
  addLimitRule(rules, "rpm", "requests", 6e4, limits.rpm, 1);
  addLimitRule(rules, "rph", "requests", 36e5, limits.rph, 1);
  addLimitRule(rules, "rpd", "requests", 864e5, limits.rpd, 1);
  addLimitRule(rules, "tpm", "tokens", 6e4, limits.tpm, usage.totalTokens);
  addLimitRule(rules, "tph", "tokens", 36e5, limits.tph, usage.totalTokens);
  addLimitRule(rules, "tpd", "tokens", 864e5, limits.tpd, usage.totalTokens);
  addLimitRule(rules, "ipm", "images", 6e4, limits.ipm, usage.imageCount);
  addLimitRule(rules, "iph", "images", 36e5, limits.iph, usage.imageCount);
  addLimitRule(rules, "ipd", "images", 864e5, limits.ipd, usage.imageCount);
  addLimitRule(rules, "quota", "tokens", limits.quotaWindowMs ?? 864e5, limits.maxTokens, usage.totalTokens);
  return rules;
}
function readWindowCounter(key, windowStart, windowMs, now = Date.now()) {
  pruneExpiredCounters(now);
  const existing = apiKeyLimitCounters.get(key);
  if (existing && existing.windowStart === windowStart) {
    return existing;
  }
  const fresh = {
    expiresAt: windowStart + windowMs * apiKeyLimitCounterRetentionWindows,
    value: 0,
    windowStart
  };
  apiKeyLimitCounters.set(key, fresh);
  return fresh;
}
function estimateLimitUsage(method, requestBody) {
  if (method.toUpperCase() !== "POST" || requestBody.byteLength === 0) {
    return { imageCount: 0, totalTokens: 0 };
  }
  const body = parseJsonObjectCached(requestBody);
  const inputCharacters = countUnknownCharacters(body.messages) + countUnknownCharacters(body.system) + countUnknownCharacters(body.tools);
  const inputTokens = Math.ceil(inputCharacters / 4);
  const outputTokens = readPositiveNumber(body.max_tokens) ?? readPositiveNumber(body.max_output_tokens) ?? 1024;
  return {
    imageCount: countImageInputs(body),
    totalTokens: Math.max(1, inputTokens + outputTokens)
  };
}
function addLimitRule(rules, name, metric, windowMs, limit, requested) {
  if (!limit || limit <= 0 || windowMs <= 0) {
    return;
  }
  rules.push({ limit, metric, name, requested, windowMs });
}
function pruneExpiredCounters(now) {
  for (const [key, counter] of apiKeyLimitCounters) {
    if (counter.expiresAt <= now) {
      apiKeyLimitCounters.delete(key);
    }
  }
}
function countUnknownCharacters(value) {
  if (value === void 0 || value === null) return 0;
  if (typeof value === "string") return value.length;
  try {
    return JSON.stringify(value)?.length || 0;
  } catch {
    return String(value).length;
  }
}
function countImageInputs(value) {
  if (Array.isArray(value)) {
    return value.reduce((sum, item) => sum + countImageInputs(item), 0);
  }
  if (!isRecord(value)) return 0;
  const type = typeof value.type === "string" ? value.type.toLowerCase() : "";
  const isImage = type === "image" || type === "image_url" || type === "input_image" || value.image_url !== void 0 || value.input_image !== void 0;
  return (isImage ? 1 : 0) + Object.values(value).reduce((sum, item) => sum + countImageInputs(item), 0);
}
function readPositiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.ceil(number) : void 0;
}

// packages/core/src/routing/model-registry.ts
var import_node_crypto2 = require("node:crypto");

// packages/core/src/contracts/app.ts
var ROUTER_SCRIPT_MAX_SOURCE_BYTES = 64 * 1024;
var CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY_ENV = "CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY";
var CLAUDE_CODE_DEFAULT_ENV = {
  [CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY_ENV]: "1"
};
function availableGatewayModelIds(config) {
  const baseEntries = availableGatewayBaseModelEntries(config.Providers);
  const ids = baseEntries.map((entry) => `${entry.providerName}/${entry.modelName}`);
  for (const profile of config.virtualModelProfiles ?? []) {
    if (!isGatewayModelVisibleVirtualProfile(profile)) {
      continue;
    }
    for (const entry of baseEntries) {
      for (const prefix of profile.match?.prefixes ?? []) {
        const normalizedPrefix = prefix.trim();
        if (normalizedPrefix) {
          ids.push(`${entry.providerName}/${normalizedPrefix}${entry.modelName}`);
        }
      }
      for (const suffix of profile.match?.suffixes ?? []) {
        const normalizedSuffix = suffix.trim();
        if (normalizedSuffix) {
          ids.push(`${entry.providerName}/${entry.modelName}${normalizedSuffix}`);
        }
      }
    }
    for (const alias of profile.match?.exactAliases ?? []) {
      const normalizedAlias = alias.trim();
      if (normalizedAlias && baseEntries.length > 0) {
        ids.push(normalizedAlias.toLowerCase().startsWith("fusion/") ? normalizedAlias : `Fusion/${normalizedAlias}`);
      }
    }
  }
  return uniqueGatewayModelIds(ids);
}
function availableGatewayBaseModelEntries(providers) {
  return providers.flatMap((provider) => {
    const providerName = provider.name?.trim();
    if (!providerName || !Array.isArray(provider.models)) {
      return [];
    }
    return provider.models.flatMap((rawModel) => {
      const modelName = rawModel.trim();
      return modelName ? [{ modelName, providerName }] : [];
    });
  });
}
function isGatewayModelVisibleVirtualProfile(profile) {
  return profile.enabled !== false && profile.materialization?.enabled !== false && profile.materialization?.includeInGatewayModels !== false;
}
function uniqueGatewayModelIds(values) {
  const seen = /* @__PURE__ */ new Set();
  const result = [];
  for (const value of values) {
    const normalized = value.trim();
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(normalized);
  }
  return result;
}
var DEFAULT_TRAY_COMPONENT_VARIANTS = {
  account: "bar",
  modelShare: "bars",
  rings: "rings",
  stats: "cards",
  tokenFlow: "line",
  tokenMix: "bars"
};
var TRAY_WINDOW_MODULE_IDS = [
  "source-tabs",
  "header",
  "account",
  "token-flow",
  "activity",
  "stats",
  "token-mix",
  "rings",
  "model-share",
  "footer"
];
var DEFAULT_TRAY_WINDOW_MODULES = [...TRAY_WINDOW_MODULE_IDS];
var DEFAULT_TRAY_WIDGETS = [
  { id: "source-tabs", type: "source-tabs" },
  { id: "header", type: "header" },
  { id: "account", type: "account", variant: DEFAULT_TRAY_COMPONENT_VARIANTS.account },
  { id: "token-flow", type: "token-flow", variant: DEFAULT_TRAY_COMPONENT_VARIANTS.tokenFlow },
  { id: "activity", type: "activity" },
  { id: "stats", type: "stats", variant: DEFAULT_TRAY_COMPONENT_VARIANTS.stats },
  { id: "token-mix", type: "token-mix", variant: DEFAULT_TRAY_COMPONENT_VARIANTS.tokenMix },
  { id: "rings", type: "rings", variant: DEFAULT_TRAY_COMPONENT_VARIANTS.rings },
  { id: "model-share", type: "model-share", variant: DEFAULT_TRAY_COMPONENT_VARIANTS.modelShare }
];

// packages/core/src/routing/model-registry.ts
var ModelRegistry = class {
  constructor(config) {
    this.config = config;
    this.gatewayModels = new Map(
      availableGatewayModelIds(config).map((model) => [model.toLowerCase(), model])
    );
  }
  config;
  gatewayModels;
  resolve(value, options = {}) {
    const normalized = normalizeRouteSelector(value);
    if (!normalized) {
      return void 0;
    }
    const parsed = parseProviderModelSelector(normalized);
    if (parsed) {
      const provider = this.findProvider(parsed.provider);
      const model = provider ? configuredProviderModel(provider, parsed.model) : void 0;
      if (provider && model) {
        return providerModelRef(provider, model, normalized);
      }
    }
    const gatewayModel = this.gatewayModels.get(normalized.toLowerCase());
    if (gatewayModel) {
      return {
        canonicalSelector: gatewayModel,
        kind: "gateway",
        model: gatewayModel,
        selector: gatewayModel
      };
    }
    if (options.providerName) {
      const provider = this.findProvider(options.providerName);
      const model = provider ? configuredProviderModel(provider, normalized) : void 0;
      if (provider && model) {
        return providerModelRef(provider, model, normalized);
      }
    }
    const exactMatches = this.providerModelMatches(normalized, false);
    if (exactMatches.length === 1) {
      return providerModelRef(exactMatches[0].provider, exactMatches[0].model, normalized);
    }
    if (exactMatches.length > 1) {
      return void 0;
    }
    const caseInsensitiveMatches = this.providerModelMatches(normalized, true);
    return caseInsensitiveMatches.length === 1 ? providerModelRef(caseInsensitiveMatches[0].provider, caseInsensitiveMatches[0].model, normalized) : void 0;
  }
  isConfigured(value, options = {}) {
    return Boolean(this.resolve(value, options));
  }
  findProvider(value) {
    const normalized = providerSelectorBase(value).toLowerCase();
    if (!normalized) {
      return void 0;
    }
    return this.config.Providers.find((provider) => providerAliases(provider).has(normalized));
  }
  resolveProviderModel(value) {
    const resolved = this.resolve(value);
    return resolved?.kind === "provider" ? { model: resolved.model, provider: resolved.provider } : void 0;
  }
  resolveUniqueProviderModel(value) {
    const normalized = normalizeRouteSelector(value);
    if (!normalized || parseProviderModelSelector(normalized)) {
      return void 0;
    }
    const resolved = this.resolve(normalized);
    return resolved?.kind === "provider" ? { model: resolved.model, provider: resolved.provider } : void 0;
  }
  providerModelMatches(model, caseInsensitive) {
    const normalized = caseInsensitive ? model.toLowerCase() : model;
    const matches = [];
    for (const provider of this.config.Providers) {
      for (const candidate of provider.models) {
        const configured = candidate.trim();
        const comparable = caseInsensitive ? configured.toLowerCase() : configured;
        if (configured && comparable === normalized) {
          matches.push({ model: configured, provider });
        }
      }
    }
    return matches;
  }
};
var registryCache = /* @__PURE__ */ new WeakMap();
function modelRegistryForConfig(config) {
  const key = config;
  const cached = registryCache.get(key);
  if (cached) {
    return cached;
  }
  const registry = new ModelRegistry(config);
  registryCache.set(key, registry);
  return registry;
}
function normalizeRouteSelector(value) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return void 0;
  }
  const commaIndex = trimmed.indexOf(",");
  if (commaIndex > 0 && commaIndex < trimmed.length - 1) {
    const provider = trimmed.slice(0, commaIndex).trim();
    const model = trimmed.slice(commaIndex + 1).trim();
    return provider && model ? `${provider}/${model}` : void 0;
  }
  return trimmed;
}
function parseProviderModelSelector(value) {
  const normalized = normalizeRouteSelector(value);
  if (!normalized) {
    return void 0;
  }
  const separator = normalized.indexOf("/");
  if (separator <= 0 || separator >= normalized.length - 1) {
    return void 0;
  }
  const provider = normalized.slice(0, separator).trim();
  const model = normalized.slice(separator + 1).trim();
  return provider && model ? { model, provider } : void 0;
}
function providerRuntimeId(provider) {
  const explicit = sanitizeProviderHeaderId(provider.id);
  if (explicit) {
    return explicit;
  }
  const normalized = provider.name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
  const hash = (0, import_node_crypto2.createHash)("sha256").update(`${provider.name}
${providerBaseUrl(provider) ?? ""}`).digest("hex").slice(0, 10);
  return `provider-${normalized || "provider"}-${hash}`;
}
function providerModelRef(provider, model, selector) {
  return {
    canonicalSelector: `${provider.name}/${model}`,
    kind: "provider",
    model,
    provider,
    selector
  };
}
function configuredProviderModel(provider, model) {
  const normalized = model.trim().toLowerCase();
  return provider.models.find((candidate) => candidate.trim().toLowerCase() === normalized)?.trim();
}
function providerAliases(provider) {
  return new Set(
    [provider.name, provider.id, provider.provider, providerRuntimeId(provider)].map((value) => value?.trim().toLowerCase()).filter((value) => Boolean(value))
  );
}
function providerSelectorBase(value) {
  const normalized = value?.trim() ?? "";
  const separator = normalized.indexOf("::");
  if (separator < 0) {
    return normalized;
  }
  const provider = normalized.slice(0, separator).trim();
  const suffix = normalized.slice(separator + 2).trim();
  return provider && isKnownProviderInternalSuffix(suffix) ? provider : normalized;
}
function providerBaseUrl(provider) {
  return provider.baseurl || provider.baseUrl || provider.api_base_url;
}
function isKnownProviderInternalSuffix(value) {
  const credentialMarker = "::cred:";
  const credentialIndex = value.indexOf(credentialMarker);
  const hasCredential = credentialIndex >= 0;
  if (hasCredential && !value.slice(credentialIndex + credentialMarker.length).trim()) {
    return false;
  }
  const protocol = hasCredential ? value.slice(0, credentialIndex) : value;
  return providerInternalProtocols.has(protocol);
}
var providerInternalProtocols = /* @__PURE__ */ new Set([
  "anthropic_messages",
  "gemini_generate_content",
  "gemini_interactions",
  "openai_chat_completions",
  "openai_image_generations",
  "openai_responses",
  "openai_video_generations",
  "xai_video_generations"
]);
function sanitizeProviderHeaderId(value) {
  const normalized = value?.trim().toLowerCase().replace(/[^a-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || void 0;
}

// packages/core/src/providers/runtime-topology.ts
function findProviderByPublicOrInternalName(config, name) {
  const normalized = name.trim().toLowerCase();
  if (!normalized) {
    return void 0;
  }
  const credentialInternalName = parseProviderCredentialInternalName(name);
  if (credentialInternalName) {
    const internalProviderId = credentialInternalName.providerId.toLowerCase();
    return config.Providers.find(
      (provider) => provider.name.trim().toLowerCase() === internalProviderId || providerRuntimeId(provider).toLowerCase() === internalProviderId
    );
  }
  return modelRegistryForConfig(config).findProvider(normalized);
}
function providerCapabilityInternalName(provider, protocol) {
  return `${providerRuntimeId(provider)}::${protocol}`;
}
function providerCredentialInternalName(provider, protocol, credential) {
  return `${providerCapabilityInternalName(provider, protocol)}::cred:${providerCredentialSlug(providerCredentialRuntimeId(provider, credential))}`;
}
function parseProviderCredentialInternalName(value) {
  const marker = "::cred:";
  const markerIndex = value?.lastIndexOf(marker) ?? -1;
  if (!value || markerIndex <= 0) {
    return void 0;
  }
  const baseName = value.slice(0, markerIndex);
  const credentialSlug = value.slice(markerIndex + marker.length).trim();
  const protocolSeparator = baseName.lastIndexOf("::");
  if (!credentialSlug || protocolSeparator <= 0) {
    return void 0;
  }
  const protocol = normalizeProviderCapabilityProtocol(baseName.slice(protocolSeparator + 2));
  const providerId = baseName.slice(0, protocolSeparator).trim();
  return protocol && providerId ? { credentialSlug, providerId, protocol } : void 0;
}
function providerCredentialSlug(value) {
  return (value ?? "").trim().toLowerCase().replace(/[^a-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "") || "key";
}
function providerCredentialRuntimeId(provider, credential, index = provider.credentials?.indexOf(credential) ?? -1) {
  const explicitId = credential.id?.trim();
  if (explicitId) {
    return explicitId;
  }
  const oneBasedIndex = index >= 0 ? index + 1 : 1;
  const label = credential.name?.trim() || credential.label?.trim();
  return label ? `${providerCredentialSlug(label)}-${oneBasedIndex}` : `key-${oneBasedIndex}`;
}
function findProviderCredentialByRuntimeId(provider, credentialId) {
  const normalizedId = credentialId.trim();
  const normalizedSlug = providerCredentialSlug(normalizedId);
  return (provider.credentials ?? []).find((credential, index) => {
    const runtimeId = providerCredentialRuntimeId(provider, credential, index);
    return runtimeId === normalizedId || providerCredentialSlug(runtimeId) === normalizedSlug || credential.id?.trim() === normalizedId;
  });
}
function findProviderCredentialBySlug(provider, credentialSlug) {
  const normalizedSlug = providerCredentialSlug(credentialSlug);
  return (provider.credentials ?? []).find((credential, index) => providerCredentialSlug(providerCredentialRuntimeId(provider, credential, index)) === normalizedSlug);
}
function normalizeProviderProtocol(value) {
  if (typeof value !== "string") {
    return void 0;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "openai" || normalized === "openai_responses") {
    return "openai_responses";
  }
  if (normalized === "openai_chat" || normalized === "openai_chat_completions") {
    return "openai_chat_completions";
  }
  if (normalized === "anthropic" || normalized === "anthropic_messages") {
    return "anthropic_messages";
  }
  if (normalized === "gemini" || normalized === "gemini_generate_content") {
    return "gemini_generate_content";
  }
  if (normalized === "gemini_interactions" || normalized === "gemini-interactions" || normalized === "google_interactions" || normalized === "google-interactions" || normalized === "interactions" || normalized === "interaction") {
    return "gemini_interactions";
  }
  return void 0;
}
function normalizeProviderCapabilityProtocol(value) {
  const chatProtocol = normalizeProviderProtocol(value);
  if (chatProtocol) {
    return chatProtocol;
  }
  if (typeof value !== "string") {
    return void 0;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "openai_image_generations" || normalized === "openai_images") {
    return "openai_image_generations";
  }
  if (normalized === "openai_video_generations" || normalized === "openai_videos") {
    return "openai_video_generations";
  }
  if (normalized === "xai_video_generations" || normalized === "xai_videos") {
    return "xai_video_generations";
  }
  return void 0;
}

// packages/core/src/providers/credential-pool.ts
var providerCredentialCooldownMs = 6e4;
var providerCredentialCooldowns = /* @__PURE__ */ new Map();
function recordProviderCredentialOutcome(config, method, attempt, statusCode, responseHeaders) {
  if (!attempt.logicalProvider || !attempt.credentialProtocol || !attempt.credentialChain?.length) return;
  const provider = findProviderByPublicOrInternalName(config, attempt.logicalProvider);
  if (!provider) return;
  const responseCredentialId = responseHeaders.get("x-ccr-provider-credential-id")?.trim();
  const responseCredential = responseCredentialId ? findProviderCredentialByRuntimeId(provider, responseCredentialId) : void 0;
  const credential = responseCredential ?? providerCredentialFromInternalName(provider, attempt.credentialChain[0]);
  if (!credential) return;
  if (statusCode >= 200 && statusCode < 500 && statusCode !== 401 && statusCode !== 403 && statusCode !== 429) {
    incrementProviderCredentialCounters(provider, credential, estimateLimitUsage(method, attempt.body ?? Buffer.alloc(0)));
    clearProviderCredentialCooldown(provider, credential);
    return;
  }
  if (statusCode === 401 || statusCode === 403 || statusCode === 429 || statusCode >= 500) {
    setProviderCredentialCooldown(provider, credential, providerCredentialCooldownMs, `HTTP ${statusCode}`);
  }
}
function readProviderCredentialCooldown(provider, credential) {
  const key = providerCredentialStateKey(provider, credential);
  const cooldown = providerCredentialCooldowns.get(key);
  if (!cooldown) return void 0;
  if (cooldown.until > Date.now()) return cooldown;
  providerCredentialCooldowns.delete(key);
  return void 0;
}
function providerCredentialFromInternalName(provider, internalName) {
  const parsed = parseProviderCredentialInternalName(internalName);
  return parsed ? findProviderCredentialBySlug(provider, parsed.credentialSlug) : void 0;
}
function incrementProviderCredentialCounters(provider, credential, usage) {
  const rules = limitRules(credential.limits, usage);
  const now = Date.now();
  for (const rule of rules) {
    const windowStart = Math.floor(now / rule.windowMs) * rule.windowMs;
    readWindowCounter(providerCredentialCounterKey(provider, credential, rule, windowStart), windowStart, rule.windowMs, now).value += rule.requested;
  }
}
function providerCredentialCounterKey(provider, credential, rule, windowStart) {
  return ["provider-credential", provider.name, providerCredentialRuntimeId(provider, credential), rule.name, rule.metric, rule.windowMs, windowStart].join("|");
}
function setProviderCredentialCooldown(provider, credential, cooldownMs, reason) {
  providerCredentialCooldowns.set(providerCredentialStateKey(provider, credential), { reason, until: Date.now() + cooldownMs });
}
function clearProviderCredentialCooldown(provider, credential) {
  providerCredentialCooldowns.delete(providerCredentialStateKey(provider, credential));
}
function providerCredentialStateKey(provider, credential) {
  return `${provider.name}::${providerCredentialRuntimeId(provider, credential)}`;
}

// packages/core/test/unit/providers/credential-pool.test.mjs
var fixtureSequence = 0;
function fixture() {
  fixtureSequence += 1;
  const first = { apiKey: "first-key", id: "first" };
  const second = { apiKey: "second-key", id: "second" };
  const provider = {
    credentials: [first, second],
    models: ["model-a"],
    name: `Credential Test ${fixtureSequence}`
  };
  const protocol = "openai_chat_completions";
  const internalName = providerCredentialInternalName(provider, protocol, first);
  return {
    attempt: {
      credentialChain: [internalName],
      credentialProtocol: protocol,
      logicalProvider: internalName
    },
    config: { Providers: [provider], virtualModelProfiles: [] },
    first,
    provider,
    second
  };
}
(0, import_node_test.default)("provider credential failures cool down the attempted credential and success clears it", () => {
  const { attempt, config, first, provider } = fixture();
  recordProviderCredentialOutcome(config, "POST", attempt, 503, new Headers());
  const cooldown = readProviderCredentialCooldown(provider, first);
  import_strict.default.equal(cooldown?.reason, "HTTP 503");
  import_strict.default.ok((cooldown?.until ?? 0) > Date.now());
  recordProviderCredentialOutcome(config, "POST", attempt, 204, new Headers());
  import_strict.default.equal(readProviderCredentialCooldown(provider, first), void 0);
});
(0, import_node_test.default)("upstream credential response identity takes precedence over the planned chain", () => {
  const { attempt, config, first, provider, second } = fixture();
  const headers = new Headers({
    "x-ccr-provider-credential-id": providerCredentialRuntimeId(provider, second)
  });
  recordProviderCredentialOutcome(config, "POST", attempt, 429, headers);
  import_strict.default.equal(readProviderCredentialCooldown(provider, first), void 0);
  import_strict.default.equal(readProviderCredentialCooldown(provider, second)?.reason, "HTTP 429");
  recordProviderCredentialOutcome(config, "POST", attempt, 200, headers);
  import_strict.default.equal(readProviderCredentialCooldown(provider, second), void 0);
});
