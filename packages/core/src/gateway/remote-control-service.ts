import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

export const ccrRemoteControlPathPrefix = "/__ccr/remote";

type RemoteDirection = "inbound" | "local" | "remote" | "system";

export type CcrRemoteControlRequestContext = {
  endpoint: string;
  path: string;
  readBody: (request: IncomingMessage) => Promise<Buffer>;
  request: IncomingMessage;
  response: ServerResponse;
  sendJson: (response: ServerResponse, statusCode: number, payload: unknown) => void;
};

type RemoteSession = {
  archivedAt?: string;
  createdAt: string;
  events: RemoteEvent[];
  id: string;
  inboundEvents: RemoteEvent[];
  lastSeq: number;
  metadata: Record<string, unknown>;
  presence: Record<string, RemotePresence>;
  seenDedupeKeys: Map<string, RemoteEvent>;
  subscribers: Set<RemoteSubscriber>;
  title: string;
  updatedAt: string;
};

type RemoteEvent = {
  createdAt: string;
  dedupeKey?: string;
  direction: RemoteDirection;
  id: string;
  payload: unknown;
  role?: string;
  seq: number;
  sessionId: string;
  source?: string;
  text?: string;
  type: string;
};

type RemotePresence = {
  lastSeenAt: string;
  metadata: Record<string, unknown>;
  name: string;
  role: string;
};

type RemoteSubscriber = {
  close: () => void;
  id: string;
  kind: "events" | "inbound";
  response: ServerResponse;
};

const maxSessions = 100;
const maxEventsPerSession = 2_000;
const maxInboundEventsPerSession = 500;
const sseHeartbeatMs = 15_000;

class CcrRemoteControlService {
  private readonly sessions = new Map<string, RemoteSession>();

  async handleRequest(context: CcrRemoteControlRequestContext): Promise<void> {
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

  private sendCapabilities(context: CcrRemoteControlRequestContext): void {
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

  private async handleSessionsRequest(context: CcrRemoteControlRequestContext): Promise<void> {
    if (context.request.method === "GET") {
      context.sendJson(context.response, 200, {
        sessions: [...this.sessions.values()].map((session) => this.sessionSummary(session, context.endpoint))
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
    const id = sanitizeSessionId(readString(body.id) || readString(body.sessionId)) || randomUUID();
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

  private async handleSessionRequest(context: CcrRemoteControlRequestContext, sessionId: string): Promise<void> {
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
      session.updatedAt = new Date().toISOString();
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
      session.archivedAt = new Date().toISOString();
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

  private async handleEventsRequest(context: CcrRemoteControlRequestContext, sessionId: string): Promise<void> {
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
    const events = normalizeEventInputs(body).map((event) =>
      this.appendEvent(session, {
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

  private async handleInboundRequest(context: CcrRemoteControlRequestContext, sessionId: string): Promise<void> {
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
    const events = normalizeEventInputs(body).map((event) =>
      this.appendEvent(session, {
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

  private async handlePresenceRequest(context: CcrRemoteControlRequestContext, sessionId: string): Promise<void> {
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
    const clientId = sanitizeSessionId(readString(body.clientId) || readString(body.id)) || randomUUID();
    const presence: RemotePresence = {
      lastSeenAt: new Date().toISOString(),
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

  private ensureSession(id: string, title: string, metadata: Record<string, unknown>): RemoteSession {
    const existing = this.sessions.get(id);
    if (existing) {
      existing.metadata = { ...existing.metadata, ...metadata };
      existing.title = title || existing.title;
      existing.updatedAt = new Date().toISOString();
      return existing;
    }

    this.pruneSessions();
    const now = new Date().toISOString();
    const session: RemoteSession = {
      createdAt: now,
      events: [],
      id,
      inboundEvents: [],
      lastSeq: 0,
      metadata,
      presence: {},
      seenDedupeKeys: new Map(),
      subscribers: new Set(),
      title,
      updatedAt: now
    };
    this.sessions.set(id, session);
    return session;
  }

  private appendEvent(
    session: RemoteSession,
    input: RemoteEventInput,
    inbound = false
  ): RemoteEvent {
    const dedupeKey = input.dedupeKey || input.id;
    if (dedupeKey) {
      const duplicate = session.seenDedupeKeys.get(dedupeKey);
      if (duplicate) {
        return duplicate;
      }
    }

    const event: RemoteEvent = {
      createdAt: new Date().toISOString(),
      ...(dedupeKey ? { dedupeKey } : {}),
      direction: input.direction ?? "local",
      id: input.id || randomUUID(),
      payload: input.payload ?? {},
      ...(input.role ? { role: input.role } : {}),
      seq: ++session.lastSeq,
      sessionId: session.id,
      ...(input.source ? { source: input.source } : {}),
      ...(input.text ? { text: input.text } : {}),
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

  private openSse(
    context: CcrRemoteControlRequestContext,
    session: RemoteSession,
    kind: RemoteSubscriber["kind"],
    after: number
  ): void {
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
    const subscriber: RemoteSubscriber = {
      close: () => clearInterval(heartbeat),
      id: randomUUID(),
      kind,
      response: context.response
    };
    session.subscribers.add(subscriber);
    context.request.once("close", () => {
      subscriber.close();
      session.subscribers.delete(subscriber);
    });
  }

  private broadcast(session: RemoteSession, event: RemoteEvent): void {
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

  private sessionSnapshot(session: RemoteSession, endpoint: string) {
    return {
      ...this.sessionSummary(session, endpoint),
      events: session.events,
      inboundEvents: session.inboundEvents,
      metadata: session.metadata,
      presence: session.presence
    };
  }

  private sessionSummary(session: RemoteSession, endpoint: string) {
    return {
      ...(session.archivedAt ? { archivedAt: session.archivedAt } : {}),
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

  private pruneSessions(): void {
    while (this.sessions.size >= maxSessions) {
      const oldest = [...this.sessions.values()]
        .sort((left, right) => Date.parse(left.updatedAt) - Date.parse(right.updatedAt))[0];
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

  private async readJsonBody(context: CcrRemoteControlRequestContext): Promise<Record<string, unknown> | undefined> {
    const body = await context.readBody(context.request);
    if (body.length === 0) {
      return {};
    }
    try {
      const parsed = JSON.parse(body.toString("utf8")) as unknown;
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      context.sendJson(context.response, 400, { error: { message: "Request body must be a JSON object." } });
      return undefined;
    } catch {
      context.sendJson(context.response, 400, { error: { message: "Request body must be valid JSON." } });
      return undefined;
    }
  }
}

type RemoteEventInput = {
  dedupeKey?: string;
  direction?: RemoteDirection;
  id?: string;
  payload?: unknown;
  role?: string;
  source?: string;
  text?: string;
  type?: string;
};

export const ccrRemoteControlService = new CcrRemoteControlService();

function normalizeEventInputs(body: Record<string, unknown>): RemoteEventInput[] {
  const rawEvents = Array.isArray(body.events) ? body.events : [body];
  return rawEvents
    .filter((event): event is Record<string, unknown> => typeof event === "object" && event !== null && !Array.isArray(event))
    .map((event) => {
      const payload = Object.prototype.hasOwnProperty.call(event, "payload")
        ? event.payload
        : Object.prototype.hasOwnProperty.call(event, "message")
          ? event.message
          : {};
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

function writeSseEvent(response: ServerResponse, event: RemoteEvent): void {
  response.write(`id: ${event.seq}\n`);
  response.write(`event: ${event.type.replace(/[\r\n]+/g, "") || "message"}\n`);
  response.write(`data: ${JSON.stringify(event)}\n\n`);
}

function wantsSse(request: IncomingMessage): boolean {
  const url = new URL(request.url || "/", "http://127.0.0.1");
  return url.searchParams.get("stream") === "1" ||
    url.searchParams.get("stream") === "true" ||
    readHeader(request.headers.accept)?.toLowerCase().includes("text/event-stream") === true;
}

function remoteAfterSeq(request: IncomingMessage): number {
  const url = new URL(request.url || "/", "http://127.0.0.1");
  const after = Number(url.searchParams.get("after") ?? readHeader(request.headers["last-event-id"]) ?? 0);
  return Number.isFinite(after) && after > 0 ? Math.floor(after) : 0;
}

function remotePathSegments(path: string): string[] {
  const suffix = path.slice(ccrRemoteControlPathPrefix.length).replace(/^\/+|\/+$/g, "");
  if (!suffix) {
    return [];
  }
  return suffix.split("/").map((segment) => decodeURIComponent(segment)).filter(Boolean);
}

function readDirection(value: unknown): RemoteDirection | undefined {
  return value === "inbound" || value === "local" || value === "remote" || value === "system"
    ? value
    : undefined;
}

function readHeader(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0]?.trim();
  }
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function sanitizeSessionId(value: string | undefined): string | undefined {
  const sanitized = value?.trim().replace(/[^a-zA-Z0-9:._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 128);
  return sanitized || undefined;
}

function trimArray<T>(items: T[], maxLength: number): void {
  if (items.length > maxLength) {
    items.splice(0, items.length - maxLength);
  }
}
