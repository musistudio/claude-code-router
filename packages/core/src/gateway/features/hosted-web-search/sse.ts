import { isRecord, stringValue } from "@ccr/core/gateway/internal/value";



export type ParsedSseEvent = {
  data?: unknown;
  event?: string;
  raw?: string;
};



export function parseSseEvents(body: string): ParsedSseEvent[] {
  return body
    .split(/\r?\n\r?\n/g)
    .filter((block) => block.trim())
    .map(parseSseEventBlock);
}



export function parseSseEventBlock(raw: string): ParsedSseEvent {
  const lines = raw.split(/\r?\n/g);
  const event = lines
    .filter((line) => line.startsWith("event:"))
    .map((line) => line.slice(6).trim())
    .find(Boolean);
  const data = lines
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).replace(/^ /, ""))
    .join("\n");
  if (!data || data === "[DONE]") {
    return { event, raw };
  }
  try {
    return { data: JSON.parse(data) as unknown, event, raw };
  } catch {
    return { event, raw };
  }
}



export function shiftSseContentBlockIndex(event: ParsedSseEvent, startIndex: number, delta: number): ParsedSseEvent {
  if (!isRecord(event.data) || !Number.isFinite(event.data.index) || Number(event.data.index) < startIndex) {
    return event;
  }
  return {
    ...event,
    data: {
      ...event.data,
      index: Number(event.data.index) + delta
    }
  };
}



export function sseEventFromValue(data: Record<string, unknown>): ParsedSseEvent {
  return {
    data,
    event: stringValue(data.type)
  };
}



export function serializeSseEvent(event: ParsedSseEvent): string {
  if (event.data === undefined) {
    return event.raw ?? "";
  }
  const type = isRecord(event.data) ? stringValue(event.data.type) : undefined;
  return [
    event.event || type ? `event: ${event.event || type}` : undefined,
    `data: ${JSON.stringify(event.data)}`
  ].filter(Boolean).join("\n");
}

