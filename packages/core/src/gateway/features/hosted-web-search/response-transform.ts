import { Readable, Transform } from "node:stream";
import type { GatewayProviderProtocol } from "@ccr/core/contracts/app";
import { isRecord, numberValue, stringValue } from "@ccr/core/gateway/internal/value";
import { formatError } from "@ccr/core/gateway/http/io";
import type { BrowserWebSearchMcpIntegration, BrowserWebSearchProtocolRecord, HostedWebSearchProtocolContext } from "@ccr/core/gateway/internal/shared";
import { selectHostedWebSearchProtocolRecords } from "@ccr/core/gateway/features/hosted-web-search/discovery";
import { parseSseEventBlock, parseSseEvents, serializeSseEvent, shiftSseContentBlockIndex, sseEventFromValue } from "@ccr/core/gateway/features/hosted-web-search/sse";
import type { ParsedSseEvent } from "@ccr/core/gateway/features/hosted-web-search/sse";
import { anthropicSseTextBlockStartIndex, anthropicWebSearchProtocolBlocks, anthropicWebSearchSseEventsForBlock, mergeAnthropicWebSearchUsage, responseValueContainsAnthropicClientToolUse, responseValueContainsAnthropicWebSearchBlocks, responseValueContainsVisibleText, sanitizeAnthropicToolUseId, shouldEndAnthropicHostedWebSearchTurn, sseEventContainsAnthropicClientToolUse, sseEventContainsAnthropicWebSearchBlock, sseEventContainsVisibleText, sseEventIsAnthropicMessageEnd, sseEventsContainAnthropicClientToolUse, sseEventsContainAnthropicWebSearchBlocks, sseEventsContainVisibleText, synthesizeWebSearchAnswer, updateAnthropicWebSearchSseUsage, webSearchProtocolInsertIndex } from "@ccr/core/gateway/features/hosted-web-search/evidence";



export function hostedWebSearchProtocolResponseStream(
  input: Readable,
  headers: Headers,
  context: HostedWebSearchProtocolContext,
  integration: BrowserWebSearchMcpIntegration | undefined
): Readable {
  const hasIntegration = integration?.recentBrowserWebSearchResults !== undefined || integration?.runBrowserWebSearch !== undefined;
  if (!hasIntegration && !context.records?.length) {
    return input;
  }
  const contentType = headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.includes("text/event-stream")) {
    if (context.protocol === "anthropic_messages") {
      return anthropicHostedWebSearchProtocolSseStream(input, context, integration);
    }
    return hostedWebSearchProtocolSseStream(input, context, integration);
  }
  if (!contentType.includes("application/json")) {
    return input;
  }

  const chunks: Buffer[] = [];
  return input.pipe(new Transform({
    transform(chunk, _encoding, callback) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      callback();
    },
    flush(callback) {
      const body = Buffer.concat(chunks).toString("utf8");
      void (async () => {
        const records = context.records?.length
          ? context.records
          : await selectHostedWebSearchProtocolRecords(context, integration);
        if (records.length === 0) {
          this.push(body);
          return;
        }

        const parsed = JSON.parse(body) as unknown;
        const transformed = transformHostedWebSearchProtocolResponseValue(parsed, records, context);
        this.push(transformed.changed ? JSON.stringify(transformed.value) : body);
      })().catch((error) => {
        console.warn(`[gateway] Hosted web search protocol bridge failed: ${formatError(error)}`);
        this.push(body);
      }).finally(() => callback());
    }
  }));
}



function hostedWebSearchProtocolSseStream(
  input: Readable,
  context: HostedWebSearchProtocolContext,
  integration: BrowserWebSearchMcpIntegration | undefined
): Readable {
  const recordsPromise = context.records?.length
    ? Promise.resolve(context.records)
    : selectHostedWebSearchProtocolRecords(context, integration);
  let records: BrowserWebSearchProtocolRecord[] | undefined;
  let pending = "";
  let passThrough = false;
  const state: HostedWebSearchSseState = {
    done: false,
    maxOutputIndex: -1,
    visibleText: false
  };

  async function ensureRecords() {
    if (records || passThrough) {
      return;
    }
    records = await recordsPromise;
    passThrough = records.length === 0;
  }

  return input.pipe(new Transform({
    transform(chunk, _encoding, callback) {
      const text = chunk.toString();
      const rawText = pending + text;
      void (async () => {
        await ensureRecords();
        if (passThrough || !records) {
          this.push(text);
          return;
        }
        pending += text;
        drainHostedWebSearchSseBlocks(this, pending, state, records, context, false);
        pending = sseTrailingPartialBlock(pending);
      })().catch((error) => {
        console.warn(`[gateway] Hosted web search protocol bridge failed: ${formatError(error)}`);
        this.push(rawText);
        pending = "";
        passThrough = true;
      }).finally(() => callback());
    },
    flush(callback) {
      void (async () => {
        await ensureRecords();
        if (passThrough || !records) {
          if (pending) {
            this.push(pending);
          }
          return;
        }
        drainHostedWebSearchSseBlocks(this, pending, state, records, context, true);
        pending = "";
      })().catch((error) => {
        console.warn(`[gateway] Hosted web search protocol bridge failed: ${formatError(error)}`);
        if (pending) {
          this.push(pending);
        }
      }).finally(() => callback());
    }
  }));
}



type HostedWebSearchSseState = {
  done: boolean;
  maxOutputIndex: number;
  visibleText: boolean;
};



function drainHostedWebSearchSseBlocks(
  stream: Transform,
  text: string,
  state: HostedWebSearchSseState,
  records: BrowserWebSearchProtocolRecord[],
  context: Pick<HostedWebSearchProtocolContext, "protocol" | "queryHint" | "requestId">,
  flush: boolean
): void {
  let cursor = 0;
  for (const match of text.matchAll(/\r?\n\r?\n/g)) {
    const index = match.index ?? 0;
    const delimiter = match[0];
    const block = text.slice(cursor, index);
    cursor = index + delimiter.length;
    if (!block.trim()) {
      stream.push(delimiter);
      continue;
    }
    writeHostedWebSearchSseEvent(stream, parseSseEventBlock(block), delimiter, state, records, context);
  }
  if (flush) {
    const block = text.slice(cursor);
    if (block.trim()) {
      writeHostedWebSearchSseEvent(stream, parseSseEventBlock(block), "", state, records, context);
    } else if (block) {
      stream.push(block);
    }
    writeHostedWebSearchSseFallback(stream, state, records, context);
  }
}



function writeHostedWebSearchSseEvent(
  stream: Transform,
  event: ParsedSseEvent,
  delimiter: string,
  state: HostedWebSearchSseState,
  records: BrowserWebSearchProtocolRecord[],
  context: Pick<HostedWebSearchProtocolContext, "protocol" | "queryHint" | "requestId">
): void {
  updateHostedWebSearchSseState(event, state, context.protocol);
  const isDone = sseEventIsDone(event);
  const isOpenAiResponsesCompleted = context.protocol === "openai_responses" &&
    isRecord(event.data) &&
    stringValue(event.data.type) === "response.completed";
  if ((isDone || isOpenAiResponsesCompleted) && !state.done) {
    writeHostedWebSearchSseFallback(stream, state, records, context);
  }
  const nextEvent = context.protocol === "openai_chat_completions"
    ? updateOpenAiChatSseFinishReason(event)
    : context.protocol === "openai_responses"
      ? updateOpenAiResponsesCompletedStatus(event)
      : event;
  stream.push(`${serializeSseEvent(nextEvent)}${delimiter}`);
}



function updateHostedWebSearchSseState(
  event: ParsedSseEvent,
  state: HostedWebSearchSseState,
  protocol: GatewayProviderProtocol
): void {
  if (protocol === "openai_chat_completions") {
    state.visibleText ||= openAiChatSseContainsVisibleText([event]);
    return;
  }
  if (protocol === "openai_responses") {
    state.visibleText ||= openAiResponsesSseContainsVisibleText([event]);
    if (isRecord(event.data)) {
      const outputIndex = numberValue(event.data.output_index);
      if (outputIndex !== undefined) {
        state.maxOutputIndex = Math.max(state.maxOutputIndex, outputIndex);
      }
    }
    return;
  }
  if (protocol === "gemini_generate_content") {
    state.visibleText ||= geminiSseContainsVisibleText([event]);
  }
}



function writeHostedWebSearchSseFallback(
  stream: Transform,
  state: HostedWebSearchSseState,
  records: BrowserWebSearchProtocolRecord[],
  context: Pick<HostedWebSearchProtocolContext, "protocol" | "queryHint" | "requestId">
): void {
  if (state.done || state.visibleText) {
    return;
  }
  const answer = synthesizeWebSearchAnswer(records, context.queryHint);
  if (!answer) {
    state.done = true;
    return;
  }
  for (const event of hostedWebSearchSseFallbackEvents(answer, state, context)) {
    stream.push(`${serializeSseEvent(event)}\n\n`);
  }
  state.visibleText = true;
  state.done = true;
}



function hostedWebSearchSseFallbackEvents(
  answer: string,
  state: HostedWebSearchSseState,
  context: Pick<HostedWebSearchProtocolContext, "protocol" | "requestId">
): ParsedSseEvent[] {
  if (context.protocol === "openai_chat_completions") {
    return [sseEventFromValue({
      object: "chat.completion.chunk",
      choices: [
        {
          delta: { content: answer },
          finish_reason: null,
          index: 0
        }
      ]
    })];
  }
  if (context.protocol === "openai_responses") {
    return openAiResponsesSseAnswerEvents(answer, context.requestId, state.maxOutputIndex + 1);
  }
  if (context.protocol === "gemini_generate_content") {
    return [sseEventFromValue(geminiAnswerCandidateChunk(answer))];
  }
  return [];
}



function anthropicHostedWebSearchProtocolSseStream(
  input: Readable,
  context: HostedWebSearchProtocolContext,
  integration: BrowserWebSearchMcpIntegration | undefined
): Readable {
  const recordsPromise = context.records?.length
    ? Promise.resolve(context.records)
    : selectHostedWebSearchProtocolRecords(context, integration);
  let records: BrowserWebSearchProtocolRecord[] | undefined;
  let pending = "";
  let passThrough = false;
  const state: AnthropicHostedWebSearchSseState = {
    answerInjected: false,
    hasClientToolUse: false,
    hasWebSearchBlocks: false,
    injectedBlockCount: 0,
    insertedSearchBlocks: false,
    maxIndex: -1,
    visibleText: false
  };

  async function ensureRecords() {
    if (records || passThrough) {
      return;
    }
    records = await recordsPromise;
    passThrough = records.length === 0;
  }

  return input.pipe(new Transform({
    transform(chunk, _encoding, callback) {
      const text = chunk.toString();
      const rawText = pending + text;
      void (async () => {
        await ensureRecords();
        if (passThrough || !records) {
          this.push(text);
          return;
        }
        pending += text;
        drainAnthropicHostedWebSearchSseBlocks(this, pending, state, records, context, false);
        pending = sseTrailingPartialBlock(pending);
      })().catch((error) => {
        console.warn(`[gateway] Hosted web search protocol bridge failed: ${formatError(error)}`);
        this.push(rawText);
        pending = "";
        passThrough = true;
      }).finally(() => callback());
    },
    flush(callback) {
      void (async () => {
        await ensureRecords();
        if (passThrough || !records) {
          if (pending) {
            this.push(pending);
          }
          return;
        }
        drainAnthropicHostedWebSearchSseBlocks(this, pending, state, records, context, true);
        pending = "";
      })().catch((error) => {
        console.warn(`[gateway] Hosted web search protocol bridge failed: ${formatError(error)}`);
        if (pending) {
          this.push(pending);
        }
      }).finally(() => callback());
    }
  }));
}



type AnthropicHostedWebSearchSseState = {
  answerInjected: boolean;
  hasClientToolUse: boolean;
  hasWebSearchBlocks: boolean;
  injectedBlockCount: number;
  insertedSearchBlocks: boolean;
  insertIndex?: number;
  maxIndex: number;
  visibleText: boolean;
};



function drainAnthropicHostedWebSearchSseBlocks(
  stream: Transform,
  text: string,
  state: AnthropicHostedWebSearchSseState,
  records: BrowserWebSearchProtocolRecord[],
  context: Pick<HostedWebSearchProtocolContext, "queryHint" | "requestId">,
  flush: boolean
): void {
  let cursor = 0;
  for (const match of text.matchAll(/\r?\n\r?\n/g)) {
    const index = match.index ?? 0;
    const delimiter = match[0];
    const block = text.slice(cursor, index);
    cursor = index + delimiter.length;
    if (!block.trim()) {
      stream.push(delimiter);
      continue;
    }
    writeAnthropicHostedWebSearchSseEvent(
      stream,
      parseSseEventBlock(block),
      delimiter,
      state,
      records,
      context
    );
  }
  if (flush) {
    const block = text.slice(cursor);
    if (block.trim()) {
      writeAnthropicHostedWebSearchSseEvent(
        stream,
        parseSseEventBlock(block),
        "",
        state,
        records,
        context
      );
    } else if (block) {
      stream.push(block);
    }
  }
}



function sseTrailingPartialBlock(text: string): string {
  let cursor = 0;
  for (const match of text.matchAll(/\r?\n\r?\n/g)) {
    cursor = (match.index ?? 0) + match[0].length;
  }
  return text.slice(cursor);
}



function writeAnthropicHostedWebSearchSseEvent(
  stream: Transform,
  event: ParsedSseEvent,
  delimiter: string,
  state: AnthropicHostedWebSearchSseState,
  records: BrowserWebSearchProtocolRecord[],
  context: Pick<HostedWebSearchProtocolContext, "queryHint" | "requestId">
): void {
  updateAnthropicHostedWebSearchSseState(event, state);
  const textStartIndex = anthropicSseTextBlockStartIndex(event);
  const isMessageEnd = sseEventIsAnthropicMessageEnd(event);
  const answer = !state.hasClientToolUse && !state.visibleText && !state.answerInjected && isMessageEnd
    ? synthesizeWebSearchAnswer(records, context.queryHint)
    : undefined;

  if (!state.insertedSearchBlocks && (textStartIndex !== undefined || isMessageEnd)) {
    const insertIndex = textStartIndex ?? state.maxIndex + 1;
    insertAnthropicHostedWebSearchSseBlocks(stream, state, records, context.requestId, insertIndex);
  }
  if (answer && isMessageEnd) {
    const answerIndex = state.maxIndex + state.injectedBlockCount + 1;
    insertAnthropicHostedWebSearchSseAnswer(stream, state, answer, answerIndex);
  }

  const nextEvent = updateAnthropicWebSearchSseUsage(
    shiftAnthropicHostedWebSearchSseEvent(event, state),
    records.length,
    Boolean(answer),
    state.hasClientToolUse
  );
  stream.push(`${serializeSseEvent(nextEvent)}${delimiter}`);
}



function updateAnthropicHostedWebSearchSseState(event: ParsedSseEvent, state: AnthropicHostedWebSearchSseState): void {
  if (isRecord(event.data) && Number.isFinite(event.data.index)) {
    state.maxIndex = Math.max(state.maxIndex, Number(event.data.index));
  }
  state.hasWebSearchBlocks ||= sseEventContainsAnthropicWebSearchBlock(event);
  state.hasClientToolUse ||= sseEventContainsAnthropicClientToolUse(event);
  state.visibleText ||= sseEventContainsVisibleText(event);
}



function insertAnthropicHostedWebSearchSseBlocks(
  stream: Transform,
  state: AnthropicHostedWebSearchSseState,
  records: BrowserWebSearchProtocolRecord[],
  requestId: string,
  insertIndex: number
): void {
  state.insertedSearchBlocks = true;
  state.insertIndex = insertIndex;
  if (state.hasWebSearchBlocks) {
    return;
  }
  const blocks = anthropicWebSearchProtocolBlocks(records, requestId);
  for (const event of blocks.flatMap((block, offset) => anthropicWebSearchSseEventsForBlock(block, insertIndex + offset))) {
    stream.push(`${serializeSseEvent(event)}\n\n`);
  }
  state.injectedBlockCount += blocks.length;
}



function insertAnthropicHostedWebSearchSseAnswer(
  stream: Transform,
  state: AnthropicHostedWebSearchSseState,
  answer: string,
  answerIndex: number
): void {
  state.answerInjected = true;
  for (const event of anthropicWebSearchSseEventsForBlock({ text: answer, type: "text" }, answerIndex)) {
    stream.push(`${serializeSseEvent(event)}\n\n`);
  }
}



function shiftAnthropicHostedWebSearchSseEvent(
  event: ParsedSseEvent,
  state: AnthropicHostedWebSearchSseState
): ParsedSseEvent {
  if (!state.insertedSearchBlocks || state.insertIndex === undefined || state.injectedBlockCount === 0) {
    return event;
  }
  return shiftSseContentBlockIndex(event, state.insertIndex, state.injectedBlockCount);
}



function transformHostedWebSearchProtocolResponseValue(
  value: unknown,
  records: BrowserWebSearchProtocolRecord[],
  context: Pick<HostedWebSearchProtocolContext, "protocol" | "queryHint" | "requestId">
): { changed: boolean; value: unknown } {
  if (context.protocol === "anthropic_messages") {
    return transformAnthropicWebSearchProtocolResponseValue(value, records, context.requestId, context.queryHint);
  }
  if (context.protocol === "openai_chat_completions") {
    return transformOpenAiChatHostedWebSearchResponseValue(value, records, context.queryHint);
  }
  if (context.protocol === "openai_responses") {
    return transformOpenAiResponsesHostedWebSearchResponseValue(value, records, context.requestId, context.queryHint);
  }
  if (context.protocol === "gemini_generate_content") {
    return transformGeminiHostedWebSearchResponseValue(value, records, context.queryHint);
  }
  return { changed: false, value };
}



function transformHostedWebSearchProtocolSseText(
  body: string,
  records: BrowserWebSearchProtocolRecord[],
  context: Pick<HostedWebSearchProtocolContext, "protocol" | "queryHint" | "requestId">
): string {
  if (context.protocol === "anthropic_messages") {
    return transformAnthropicWebSearchProtocolSseText(body, records, context.requestId, context.queryHint);
  }
  if (context.protocol === "openai_chat_completions") {
    return transformOpenAiChatHostedWebSearchSseText(body, records, context.queryHint);
  }
  if (context.protocol === "openai_responses") {
    return transformOpenAiResponsesHostedWebSearchSseText(body, records, context.requestId, context.queryHint);
  }
  if (context.protocol === "gemini_generate_content") {
    return transformGeminiHostedWebSearchSseText(body, records, context.queryHint);
  }
  return body;
}



export function transformAnthropicWebSearchProtocolResponseValue(
  value: unknown,
  records: BrowserWebSearchProtocolRecord[],
  requestId: string,
  queryHint?: string
): { changed: boolean; value: unknown } {
  if (!isRecord(value) || !Array.isArray(value.content)) {
    return { changed: false, value };
  }
  const hasWebSearchBlocks = responseValueContainsAnthropicWebSearchBlocks(value);
  const blocks = hasWebSearchBlocks ? [] : anthropicWebSearchProtocolBlocks(records, requestId);
  const hasClientToolUse = responseValueContainsAnthropicClientToolUse(value);
  const answer = hasClientToolUse || responseValueContainsVisibleText(value)
    ? undefined
    : synthesizeWebSearchAnswer(records, queryHint);
  const injectedBlocks = [
    ...blocks,
    ...(answer ? [{ text: answer, type: "text" }] : [])
  ];
  const shouldUpdateUsage = hasWebSearchBlocks || blocks.length > 0;
  if (injectedBlocks.length === 0 && !shouldUpdateUsage) {
    return { changed: false, value };
  }
  const insertAt = webSearchProtocolInsertIndex(value.content, hasWebSearchBlocks);
  const nextValue = {
    ...value,
    ...(shouldUpdateUsage ? { usage: mergeAnthropicWebSearchUsage(value.usage, records.length) } : {}),
    ...(shouldEndAnthropicHostedWebSearchTurn(value.stop_reason, Boolean(answer), hasClientToolUse) ? { stop_reason: "end_turn" } : {}),
    content: injectedBlocks.length > 0
      ? [
          ...value.content.slice(0, insertAt),
          ...injectedBlocks,
          ...value.content.slice(insertAt)
        ]
      : value.content
  };
  return {
    changed: true,
    value: nextValue
  };
}



export function transformAnthropicWebSearchProtocolSseText(
  body: string,
  records: BrowserWebSearchProtocolRecord[],
  requestId: string,
  queryHint?: string
): string {
  const events = parseSseEvents(body);
  if (events.length === 0) {
    return body;
  }
  const hasWebSearchBlocks = sseEventsContainAnthropicWebSearchBlocks(events);
  const blocks = hasWebSearchBlocks ? [] : anthropicWebSearchProtocolBlocks(records, requestId);
  const hasClientToolUse = sseEventsContainAnthropicClientToolUse(events);
  const answer = hasClientToolUse || sseEventsContainVisibleText(events)
    ? undefined
    : synthesizeWebSearchAnswer(records, queryHint);
  const injectedBlocks = [
    ...blocks,
    ...(answer ? [{ text: answer, type: "text" }] : [])
  ];
  const shouldUpdateUsage = hasWebSearchBlocks || blocks.length > 0;
  if (injectedBlocks.length === 0 && !shouldUpdateUsage) {
    return body;
  }

  let maxIndex = -1;
  for (const event of events) {
    if (isRecord(event.data) && Number.isFinite(event.data.index)) {
      maxIndex = Math.max(maxIndex, Number(event.data.index));
    }
  }

  const firstTextIndex = events.findIndex((event) => {
    const data = isRecord(event.data) ? event.data : undefined;
    const contentBlock = isRecord(data?.content_block) ? data.content_block : undefined;
    return data?.type === "content_block_start" && contentBlock?.type === "text";
  });
  const messageEndIndex = events.findIndex((event) => {
    const type = isRecord(event.data) ? stringValue(event.data.type) : undefined;
    return type === "message_delta" || type === "message_stop";
  });
  const insertPosition = firstTextIndex >= 0
    ? firstTextIndex
    : messageEndIndex >= 0
      ? messageEndIndex
      : events.length;
  const insertIndex = firstTextIndex >= 0 && isRecord(events[firstTextIndex].data) && Number.isFinite(events[firstTextIndex].data.index)
      ? Number(events[firstTextIndex].data.index)
      : maxIndex + 1;

  const shiftedEvents = events
    .map((event) => shiftSseContentBlockIndex(event, insertIndex, injectedBlocks.length))
    .map((event) => updateAnthropicWebSearchSseUsage(event, records.length, Boolean(answer), hasClientToolUse));
  const injectedEvents = injectedBlocks.flatMap((block, offset) => anthropicWebSearchSseEventsForBlock(block, insertIndex + offset));
  shiftedEvents.splice(insertPosition, 0, ...injectedEvents);
  return `${shiftedEvents.map(serializeSseEvent).join("\n\n")}\n\n`;
}



export function transformOpenAiChatHostedWebSearchResponseValue(
  value: unknown,
  records: BrowserWebSearchProtocolRecord[],
  queryHint?: string
): { changed: boolean; value: unknown } {
  if (!isRecord(value) || openAiChatResponseContainsVisibleText(value)) {
    return { changed: false, value };
  }
  const answer = synthesizeWebSearchAnswer(records, queryHint);
  if (!answer || !Array.isArray(value.choices) || value.choices.length === 0) {
    return { changed: false, value };
  }
  const choices = value.choices.map((choice, index) => {
    if (!isRecord(choice) || index !== 0) {
      return choice;
    }
    const message = isRecord(choice.message) ? choice.message : {};
    return {
      ...choice,
      finish_reason: stringValue(choice.finish_reason) === "length" ? "stop" : choice.finish_reason,
      message: {
        ...message,
        content: answer,
        role: stringValue(message.role) || "assistant"
      }
    };
  });
  return {
    changed: true,
    value: {
      ...value,
      choices
    }
  };
}



export function transformOpenAiChatHostedWebSearchSseText(
  body: string,
  records: BrowserWebSearchProtocolRecord[],
  queryHint?: string
): string {
  const events = parseSseEvents(body);
  if (events.length === 0 || openAiChatSseContainsVisibleText(events)) {
    return body;
  }
  const answer = synthesizeWebSearchAnswer(records, queryHint);
  if (!answer) {
    return body;
  }
  const template = firstSseDataRecord(events);
  const injected = sseEventFromValue({
    ...(template?.id ? { id: template.id } : {}),
    ...(template?.model ? { model: template.model } : {}),
    object: stringValue(template?.object) || "chat.completion.chunk",
    choices: [
      {
        delta: { content: answer },
        finish_reason: null,
        index: 0
      }
    ]
  });
  const shifted = events.map((event) => updateOpenAiChatSseFinishReason(event));
  const insertAt = doneSseEventIndex(shifted);
  shifted.splice(insertAt >= 0 ? insertAt : shifted.length, 0, injected);
  return `${shifted.map(serializeSseEvent).join("\n\n")}\n\n`;
}



export function transformOpenAiResponsesHostedWebSearchResponseValue(
  value: unknown,
  records: BrowserWebSearchProtocolRecord[],
  requestId: string,
  queryHint?: string
): { changed: boolean; value: unknown } {
  if (!isRecord(value)) {
    return { changed: false, value };
  }
  const output = Array.isArray(value.output) ? value.output : [];
  const hasSearchCall = output.some((item) => isRecord(item) && stringValue(item.type) === "web_search_call");
  const answer = openAiResponsesValueContainsVisibleText(value) ? undefined : synthesizeWebSearchAnswer(records, queryHint);
  const injected = [
    ...(hasSearchCall ? [] : openAiResponsesWebSearchCallItems(records, requestId)),
    ...(answer ? [openAiResponsesMessageItem(answer, requestId)] : [])
  ];
  if (injected.length === 0) {
    return { changed: false, value };
  }
  const next: Record<string, unknown> = {
    ...value,
    output: [...injected, ...output]
  };
  if (answer && stringValue(next.status) === "incomplete") {
    next.status = "completed";
    delete next.incomplete_details;
  }
  return { changed: true, value: next };
}



export function transformOpenAiResponsesHostedWebSearchSseText(
  body: string,
  records: BrowserWebSearchProtocolRecord[],
  requestId: string,
  queryHint?: string
): string {
  const events = parseSseEvents(body);
  if (events.length === 0) {
    return body;
  }
  const visibleText = openAiResponsesSseVisibleText(events);
  if (visibleText) {
    return serializeOpenAiResponsesSseEvents(normalizeOpenAiResponsesSseEvents(events, visibleText));
  }
  const answer = synthesizeWebSearchAnswer(records, queryHint);
  if (!answer) {
    return serializeOpenAiResponsesSseEvents(normalizeOpenAiResponsesSseEvents(events));
  }
  const outputIndex = nextOpenAiResponsesOutputIndex(events);
  const injected = openAiResponsesSseAnswerEvents(answer, requestId, outputIndex);
  const shifted = events.map(updateOpenAiResponsesCompletedStatus);
  const insertAt = shifted.findIndex((event) => isRecord(event.data) && stringValue(event.data.type) === "response.completed");
  shifted.splice(insertAt >= 0 ? insertAt : doneSseEventIndex(shifted) >= 0 ? doneSseEventIndex(shifted) : shifted.length, 0, ...injected);
  return serializeOpenAiResponsesSseEvents(normalizeOpenAiResponsesSseEvents(shifted, answer));
}



export function transformGeminiHostedWebSearchResponseValue(
  value: unknown,
  records: BrowserWebSearchProtocolRecord[],
  queryHint?: string
): { changed: boolean; value: unknown } {
  if (Array.isArray(value)) {
    if (geminiResponseArrayContainsVisibleText(value)) {
      return { changed: false, value };
    }
    const answer = synthesizeWebSearchAnswer(records, queryHint);
    return answer
      ? { changed: true, value: [...value, geminiAnswerCandidateChunk(answer)] }
      : { changed: false, value };
  }
  if (!isRecord(value) || geminiResponseValueContainsVisibleText(value)) {
    return { changed: false, value };
  }
  const answer = synthesizeWebSearchAnswer(records, queryHint);
  if (!answer) {
    return { changed: false, value };
  }
  const candidates = Array.isArray(value.candidates) ? value.candidates : [];
  const nextCandidate = candidates.length > 0 && isRecord(candidates[0])
    ? {
        ...candidates[0],
        content: {
          ...(isRecord(candidates[0].content) ? candidates[0].content : {}),
          parts: [{ text: answer }],
          role: "model"
        },
        finishReason: stringValue(candidates[0].finishReason) === "MAX_TOKENS" ? "STOP" : candidates[0].finishReason
      }
    : geminiAnswerCandidate(answer);
  return {
    changed: true,
    value: {
      ...value,
      candidates: [nextCandidate, ...candidates.slice(1)]
    }
  };
}



export function transformGeminiHostedWebSearchSseText(
  body: string,
  records: BrowserWebSearchProtocolRecord[],
  queryHint?: string
): string {
  const events = parseSseEvents(body);
  if (events.length === 0 || geminiSseContainsVisibleText(events)) {
    return body;
  }
  const answer = synthesizeWebSearchAnswer(records, queryHint);
  if (!answer) {
    return body;
  }
  const injected = sseEventFromValue(geminiAnswerCandidateChunk(answer));
  const insertAt = doneSseEventIndex(events);
  events.splice(insertAt >= 0 ? insertAt : events.length, 0, injected);
  return `${events.map(serializeSseEvent).join("\n\n")}\n\n`;
}



function openAiChatResponseContainsVisibleText(value: Record<string, unknown>): boolean {
  if (!Array.isArray(value.choices)) {
    return false;
  }
  return value.choices.some((choice) => {
    const message = isRecord(choice) && isRecord(choice.message) ? choice.message : undefined;
    return Boolean(stringValue(message?.content)?.trim());
  });
}



function openAiChatSseContainsVisibleText(events: ParsedSseEvent[]): boolean {
  return events.some((event) => {
    const choices = isRecord(event.data) && Array.isArray(event.data.choices) ? event.data.choices : [];
    return choices.some((choice) => {
      const delta = isRecord(choice) && isRecord(choice.delta) ? choice.delta : undefined;
      return Boolean(stringValue(delta?.content)?.trim());
    });
  });
}



function updateOpenAiChatSseFinishReason(event: ParsedSseEvent): ParsedSseEvent {
  if (!isRecord(event.data) || !Array.isArray(event.data.choices)) {
    return event;
  }
  let changed = false;
  const choices = event.data.choices.map((choice) => {
    if (!isRecord(choice) || stringValue(choice.finish_reason) !== "length") {
      return choice;
    }
    changed = true;
    return { ...choice, finish_reason: "stop" };
  });
  return changed ? { ...event, data: { ...event.data, choices } } : event;
}



function openAiResponsesValueContainsVisibleText(value: Record<string, unknown>): boolean {
  return Array.isArray(value.output) && value.output.some(openAiResponsesItemContainsVisibleText);
}



function openAiResponsesItemContainsVisibleText(item: unknown): boolean {
  if (!isRecord(item)) {
    return false;
  }
  if (stringValue(item.type) === "message" && Array.isArray(item.content)) {
    return item.content.some((part) => isRecord(part) && Boolean(stringValue(part.text)?.trim()));
  }
  return Boolean(stringValue(item.text)?.trim());
}



function openAiResponsesSseContainsVisibleText(events: ParsedSseEvent[]): boolean {
  return Boolean(openAiResponsesSseVisibleText(events));
}



function openAiResponsesSseVisibleText(events: ParsedSseEvent[]): string | undefined {
  let deltaText = "";
  let doneText = "";
  let itemText = "";
  for (const event of events) {
    const data = isRecord(event.data) ? event.data : undefined;
    if (!data) {
      continue;
    }
    const type = stringValue(data.type);
    if (type === "response.output_text.delta") {
      deltaText += stringValue(data.delta) ?? "";
      continue;
    }
    if (type === "response.output_text.done") {
      doneText = stringValue(data.text) ?? doneText;
      continue;
    }
    const item = isRecord(data.item) ? data.item : undefined;
    if (item && openAiResponsesItemContainsVisibleText(item)) {
      itemText = openAiResponsesItemText(item) ?? itemText;
    }
  }
  return nonEmptyText(deltaText) ?? nonEmptyText(doneText) ?? nonEmptyText(itemText);
}



function openAiResponsesItemText(item: unknown): string | undefined {
  if (!isRecord(item)) {
    return undefined;
  }
  if (stringValue(item.type) === "message" && Array.isArray(item.content)) {
    const text = item.content
      .flatMap((part) => isRecord(part) ? [stringValue(part.text) ?? ""] : [])
      .join("");
    return text.trim() ? text : undefined;
  }
  return stringValue(item.text);
}



function nonEmptyText(value: string | undefined): string | undefined {
  return value && value.trim() ? value : undefined;
}



function openAiResponsesWebSearchCallItems(records: BrowserWebSearchProtocolRecord[], requestId: string): Record<string, unknown>[] {
  return records.map((record, index) => ({
    action: {
      query: record.query,
      type: "search"
    },
    id: `ws_${sanitizeAnthropicToolUseId(requestId)}_${index + 1}`,
    status: "completed",
    type: "web_search_call"
  }));
}



function openAiResponsesMessageItem(answer: string, requestId: string): Record<string, unknown> {
  return {
    content: [{ annotations: [], text: answer, type: "output_text" }],
    id: `msg_${sanitizeAnthropicToolUseId(requestId)}_web_search_answer`,
    role: "assistant",
    status: "completed",
    type: "message"
  };
}



function nextOpenAiResponsesOutputIndex(events: ParsedSseEvent[]): number {
  const indexes = events.flatMap((event) => {
    const data = isRecord(event.data) ? event.data : undefined;
    const index = numberValue(data?.output_index);
    return index === undefined ? [] : [index];
  });
  return indexes.length === 0 ? 0 : Math.max(...indexes) + 1;
}



function openAiResponsesSseAnswerEvents(answer: string, requestId: string, outputIndex: number): ParsedSseEvent[] {
  const itemId = `msg_${sanitizeAnthropicToolUseId(requestId)}_web_search_answer`;
  const contentIndex = 0;
  return [
    sseEventFromValue({
      item: {
        id: itemId,
        role: "assistant",
        status: "in_progress",
        type: "message"
      },
      output_index: outputIndex,
      type: "response.output_item.added"
    }),
    sseEventFromValue({
      content_index: contentIndex,
      item_id: itemId,
      output_index: outputIndex,
      part: { annotations: [], text: "", type: "output_text" },
      type: "response.content_part.added"
    }),
    sseEventFromValue({
      content_index: contentIndex,
      delta: answer,
      item_id: itemId,
      output_index: outputIndex,
      type: "response.output_text.delta"
    }),
    sseEventFromValue({
      content_index: contentIndex,
      item_id: itemId,
      output_index: outputIndex,
      text: answer,
      type: "response.output_text.done"
    }),
    sseEventFromValue({
      content_index: contentIndex,
      item_id: itemId,
      output_index: outputIndex,
      part: { annotations: [], text: answer, type: "output_text" },
      type: "response.content_part.done"
    }),
    sseEventFromValue({
      item: {
        content: [{ annotations: [], text: answer, type: "output_text" }],
        id: itemId,
        role: "assistant",
        status: "completed",
        type: "message"
      },
      output_index: outputIndex,
      type: "response.output_item.done"
    })
  ];
}



function updateOpenAiResponsesCompletedStatus(event: ParsedSseEvent): ParsedSseEvent {
  if (!isRecord(event.data) || stringValue(event.data.type) !== "response.completed") {
    return event;
  }
  const response = isRecord(event.data.response) ? event.data.response : undefined;
  if (!response || stringValue(response.status) !== "incomplete") {
    return event;
  }
  const nextResponse: Record<string, unknown> = { ...response, status: "completed" };
  delete nextResponse.incomplete_details;
  return {
    ...event,
    data: {
      ...event.data,
      response: nextResponse
    }
  };
}



function normalizeOpenAiResponsesSseEvents(events: ParsedSseEvent[], visibleText?: string): ParsedSseEvent[] {
  const outputIndexMap = openAiResponsesOutputIndexMap(events);
  return events.flatMap((event) => {
    if (isOpenAiResponsesReasoningSseEvent(event)) {
      return [];
    }
    return [updateOpenAiResponsesCompletedOutput(
      remapOpenAiResponsesOutputIndex(event, outputIndexMap),
      visibleText
    )];
  });
}



function serializeOpenAiResponsesSseEvents(events: ParsedSseEvent[]): string {
  return `${events.map(serializeSseEvent).join("\n\n")}\n\n`;
}



function openAiResponsesOutputIndexMap(events: ParsedSseEvent[]): Map<number, number> {
  const indexes: number[] = [];
  for (const event of events) {
    if (isOpenAiResponsesReasoningSseEvent(event)) {
      continue;
    }
    const data = isRecord(event.data) ? event.data : undefined;
    const index = numberValue(data?.output_index);
    if (index !== undefined && !indexes.includes(index)) {
      indexes.push(index);
    }
  }
  return new Map(indexes.sort((left, right) => left - right).map((index, nextIndex) => [index, nextIndex]));
}



function remapOpenAiResponsesOutputIndex(event: ParsedSseEvent, outputIndexMap: Map<number, number>): ParsedSseEvent {
  if (!isRecord(event.data)) {
    return event;
  }
  const index = numberValue(event.data.output_index);
  if (index === undefined || !outputIndexMap.has(index)) {
    return event;
  }
  return {
    ...event,
    data: {
      ...event.data,
      output_index: outputIndexMap.get(index)
    }
  };
}



function updateOpenAiResponsesCompletedOutput(event: ParsedSseEvent, visibleText?: string): ParsedSseEvent {
  if (!isRecord(event.data) || stringValue(event.data.type) !== "response.completed") {
    return event;
  }
  const response = isRecord(event.data.response) ? event.data.response : undefined;
  if (!response) {
    return event;
  }
  const nextResponse: Record<string, unknown> = { ...response };
  if (Array.isArray(response.output)) {
    nextResponse.output = response.output.filter((item) => !(isRecord(item) && stringValue(item.type) === "reasoning"));
  }
  if (visibleText) {
    nextResponse.output_text = visibleText;
  }
  if (visibleText && stringValue(nextResponse.status) === "incomplete") {
    nextResponse.status = "completed";
    delete nextResponse.incomplete_details;
  }
  return {
    ...event,
    data: {
      ...event.data,
      response: nextResponse
    }
  };
}



function isOpenAiResponsesReasoningSseEvent(event: ParsedSseEvent): boolean {
  const data = isRecord(event.data) ? event.data : undefined;
  if (!data) {
    return false;
  }
  const type = stringValue(data.type);
  if (type?.startsWith("response.reasoning")) {
    return true;
  }
  const item = isRecord(data.item) ? data.item : undefined;
  if (stringValue(item?.type) === "reasoning") {
    return true;
  }
  const part = isRecord(data.part) ? data.part : undefined;
  return stringValue(part?.type) === "reasoning_text";
}



function geminiResponseValueContainsVisibleText(value: Record<string, unknown>): boolean {
  return Array.isArray(value.candidates) && value.candidates.some(geminiCandidateContainsVisibleText);
}



function geminiResponseArrayContainsVisibleText(values: unknown[]): boolean {
  return values.some((value) => isRecord(value) && geminiResponseValueContainsVisibleText(value));
}



function geminiCandidateContainsVisibleText(candidate: unknown): boolean {
  const content = isRecord(candidate) && isRecord(candidate.content) ? candidate.content : undefined;
  const parts = Array.isArray(content?.parts) ? content.parts : [];
  return parts.some((part) => isRecord(part) && Boolean(stringValue(part.text)?.trim()));
}



function geminiSseContainsVisibleText(events: ParsedSseEvent[]): boolean {
  return events.some((event) => isRecord(event.data) && geminiResponseValueContainsVisibleText(event.data));
}



function geminiAnswerCandidate(answer: string): Record<string, unknown> {
  return {
    content: {
      parts: [{ text: answer }],
      role: "model"
    },
    finishReason: "STOP",
    index: 0
  };
}



function geminiAnswerCandidateChunk(answer: string): Record<string, unknown> {
  return {
    candidates: [geminiAnswerCandidate(answer)]
  };
}



function firstSseDataRecord(events: ParsedSseEvent[]): Record<string, unknown> | undefined {
  return events.map((event) => isRecord(event.data) ? event.data : undefined).find(Boolean);
}



function doneSseEventIndex(events: ParsedSseEvent[]): number {
  return events.findIndex((event) => event.raw?.includes("[DONE]"));
}



function sseEventIsDone(event: ParsedSseEvent): boolean {
  return Boolean(event.raw?.includes("[DONE]"));
}
