// Log parsing: parseLog() and its internal helpers

import type { CcrRequest, ConvBlock, ConvMessage } from './types';
import { INJECTED_PREFIXES } from './types';
import { fmtMs } from './utils';

function createRequest(reqId: string, startTime: number, method: string, url: string): CcrRequest {
  return {
    reqId, startTime, endTime: null, method, url,
    messageCount: 0, toolCount: 0, maxTokens: null, temperature: null,
    originalModel: null, thinkingBudget: null, thinkingMode: null, systemPrompt: null, userQuery: null,
    injectedContext: [], toolDefinitions: [], conversationSummary: null, incomingToolIds: [],
    scenario: 'default', routedModel: null, routedUrl: null, provider: null,
    statusCode: null, responseTime: null, inputTokens: 0, outputTokens: 0,
    cacheReadTokens: 0, cacheWriteTokens: 0, thinkingChars: 0,
    responseText: null, thinkingText: null, toolCallDetails: [], outgoingToolIds: [],
    finalToolCount: 0, requestCost: null, fallbackChain: [], hasFallback: false,
    allFallbacksFailed: false, routingError: null, events: [], parallelGroup: null,
    _responseChunks: [], _thinkingChunks: [], _blockMap: new Map(), _toolCallInputChunks: new Map(),
  };
}

function parseScenario(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('background')) return 'background';
  if (m.includes('think')) return 'think';
  if (m.includes('longcontext') || m.includes('long context')) return 'longContext';
  if (m.includes('websearch') || m.includes('web search')) return 'webSearch';
  return 'default';
}

function extractProvider(url: string | null): string | null {
  if (!url) return null;
  try { return new URL(url).hostname; } catch { return null; }
}

function processSseData(req: CcrRequest, rawData: string): void {
  for (const rawLine of rawData.split('\n')) {
    const line = rawLine.trim();
    if (!line.startsWith('data: ') || line.includes('[DONE]')) continue;
    let payload: any;
    try { payload = JSON.parse(line.slice(6)); } catch { continue; }
    const dtype = payload.type;
    if (dtype === 'message_start') {
      const u = payload.message?.usage ?? {};
      req.inputTokens = u.input_tokens ?? req.inputTokens;
      req.cacheReadTokens = u.cache_read_input_tokens ?? req.cacheReadTokens;
      req.cacheWriteTokens = u.cache_creation_input_tokens ?? req.cacheWriteTokens;
      // Real CCR logs omit request.body from "final request", so routedModel may still
      // be null. Extract it from the provider's message_start SSE response instead.
      if (!req.routedModel && payload.message?.model) {
        const model: string = payload.message.model;
        req.routedModel = model;
        if (req.fallbackChain.length === 0)
          req.fallbackChain.push({ model, status: 'pending', httpStatus: null, errorBody: null, isPrimary: true });
      }
    } else if (dtype === 'message_delta') {
      const u = payload.usage ?? {};
      req.outputTokens = u.output_tokens ?? req.outputTokens;
      if (u.input_tokens) req.inputTokens = u.input_tokens;
      if (u.cache_read_input_tokens) req.cacheReadTokens = u.cache_read_input_tokens;
    } else if (dtype === 'content_block_start') {
      const block = payload.content_block;
      if (block?.type === 'tool_use') {
        req._blockMap.set(payload.index, { name: block.name, id: block.id });
        req._toolCallInputChunks.set(payload.index, []);
      }
    } else if (dtype === 'content_block_delta') {
      const delta = payload.delta ?? {};
      if (delta.type === 'text_delta') req._responseChunks.push(delta.text ?? '');
      else if (delta.type === 'thinking_delta') {
        req._thinkingChunks.push(delta.thinking ?? '');
        req.thinkingChars += (delta.thinking ?? '').length;
      } else if (delta.type === 'input_json_delta') {
        const chunks = req._toolCallInputChunks.get(payload.index);
        if (chunks) chunks.push(delta.partial_json ?? '');
      }
    } else if (dtype === 'error') {
      // SSE stream error (e.g. provider connection failure) — can appear even in HTTP 200 responses
      // when CCR passes through the error event from the upstream provider.
      const m = payload.message;
      const errMsg: string = typeof m === 'string' ? m : (m?.message ?? JSON.stringify(m));
      if (!req.routingError) req.routingError = errMsg;
    }
  }
}

function finalizeRequest(req: CcrRequest): void {
  req.responseText = req._responseChunks.join('').slice(0, 100000) || null;
  req.thinkingText = req._thinkingChunks.join('').slice(0, 100000) || null;
  const sortedIdxs = Array.from(req._blockMap.keys()).sort((a, b) => a - b);
  for (const idx of sortedIdxs) {
    const blockInfo = req._blockMap.get(idx)!;
    const inputStr = (req._toolCallInputChunks.get(idx) ?? []).join('');
    req.toolCallDetails.push({ name: blockInfo.name, id: blockInfo.id, input: inputStr });
    if (blockInfo.id) req.outgoingToolIds.push({ id: blockInfo.id, name: blockInfo.name });
  }
  req.finalToolCount = req.toolCallDetails.length;
}

export function parseLog(logText: string): CcrRequest[] {
  const requestMap = new Map<string, CcrRequest>();
  for (const rawLine of logText.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    let entry: any;
    try { entry = JSON.parse(line); } catch { continue; }
    const msg: string = entry.msg ?? '';
    const type: string = entry.type ?? '';
    const rid: string = entry.reqId ?? '';
    const ts: number = entry.time ?? 0;

    if (msg === 'incoming request' && rid) {
      const ri = entry.req ?? {};
      const method: string = ri.method ?? '';
      const url: string = ri.url ?? '';
      if (method !== 'POST' || url.includes('count_tokens') || !url.includes('/v1/messages')) continue;
      const req = createRequest(rid, ts, method, url);
      req.events.push({ time: ts, type: 'incoming', detail: `${method} ${url}` });
      requestMap.set(rid, req);
      continue;
    }

    if (type === 'request body' && rid && requestMap.has(rid)) {
      const req = requestMap.get(rid)!;
      const data = entry.data ?? {};
      const msgs: any[] = data.messages ?? [];
      req.messageCount = msgs.length;
      req.toolCount = (data.tools ?? []).length;
      req.maxTokens = data.max_tokens ?? null;
      req.temperature = data.temperature ?? null;
      // If model is in CCR's "provider,model" format, extract just the model part (after the comma).
      // This happens when Claude Code has been configured via `ccr activate` to use a CCR model
      // string, or for imageAgent sub-requests that CCR creates internally.
      if (data.model && data.model.includes(',')) {
        req.originalModel = data.model.split(',').slice(1).join(',') || null;
      } else {
        req.originalModel = data.model ?? null;
      }

      // Note: thinking/reasoning mode is read from "final request" (post-transformer),
      // not here, because transformers may convert Anthropic thinking format to
      // provider-specific reasoning format before sending.

      const sys = data.system ?? null;
      if (typeof sys === 'string') req.systemPrompt = sys;
      else if (Array.isArray(sys)) {
        req.systemPrompt = sys.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');
      }

      for (let i = msgs.length - 1; i >= 0; i--) {
        const m = msgs[i];
        if (m.role !== 'user') continue;
        let c = m.content;
        let imgCount = 0;
        if (Array.isArray(c)) {
          const texts: string[] = [];
          for (const part of c) {
            if (part.type === 'image') { imgCount++; continue; }
            if (part.type !== 'text') continue;
            const stripped = (part.text ?? '').trim();
            if (INJECTED_PREFIXES.some(p => stripped.startsWith(p))) continue;
            if (stripped) texts.push(part.text);
          }
          if (texts.length === 0) continue;
          c = texts.join('\n');
        }
        if (typeof c === 'string' && c.trim()) {
          if (INJECTED_PREFIXES.some(p => c.trim().startsWith(p))) continue;
          const imgPrefix = imgCount > 0 ? `[+ ${imgCount} image${imgCount > 1 ? 's' : ''}]\n` : '';
          req.userQuery = imgPrefix + c.slice(0, 3000); break;
        }
      }

      for (const m of msgs) {
        if (m.role !== 'user') continue;
        if (!Array.isArray(m.content)) break;
        for (const block of m.content) {
          if (block.type !== 'text') continue;
          const t = (block.text ?? '').trim();
          if (!t.startsWith('<system-reminder>')) continue;
          const inner = t.slice('<system-reminder>'.length);
          const endIdx = inner.indexOf('</system-reminder>');
          const body = (endIdx >= 0 ? inner.slice(0, endIdx) : inner).trim();
          const firstLine = body.split('\n').find((l: string) => l.trim()) ?? '';
          let label: string;
          if (firstLine.includes('claudeMd') || firstLine.includes('following context')) label = 'CLAUDE.md / Memory';
          else if (firstLine.includes('skills are available')) label = 'Skills';
          else if (firstLine.startsWith('PDF file:') || firstLine.toLowerCase().includes('pdf')) label = 'PDF context';
          else if (body.includes('currentDate')) label = 'Date / env';
          else label = firstLine.slice(0, 50) || 'system-reminder';
          req.injectedContext.push({ label, body });
        }
        break;
      }

      req.toolDefinitions = (data.tools ?? []).map((t: any) => ({
        name: t.name, description: t.description ?? '', input_schema: t.input_schema ?? {},
      }));

      const CONV_PREVIEW = 400;
      const CONV_FULL = 5000;
      const convMsgs: ConvMessage[] = [];
      for (const m of msgs) {
        const blocks: ConvBlock[] = [];
        let c = m.content;
        if (typeof c === 'string' && c.trim()) {
          blocks.push({ type: 'text', preview: c.slice(0, CONV_PREVIEW), fullText: c.length > CONV_PREVIEW ? c.slice(0, CONV_FULL) : undefined });
        } else if (Array.isArray(c)) {
          for (const b of c) {
            switch (b.type) {
              case 'text': {
                const stripped = (b.text ?? '').trim();
                if (!stripped || INJECTED_PREFIXES.some(p => stripped.startsWith(p))) continue;
                blocks.push({ type: 'text', preview: b.text.slice(0, CONV_PREVIEW), fullText: b.text.length > CONV_PREVIEW ? b.text.slice(0, CONV_FULL) : undefined });
                break;
              }
              case 'thinking': {
                const th: string = b.thinking ?? '';
                blocks.push({ type: 'thinking', preview: th.slice(0, CONV_PREVIEW), fullText: th.length > CONV_PREVIEW ? th.slice(0, CONV_FULL) : undefined });
                break;
              }
              case 'tool_use': blocks.push({ type: 'tool_use', name: b.name, preview: JSON.stringify(b.input ?? {}).slice(0, 200), id: b.id }); break;
              case 'tool_result': {
                const rc = b.content;
                const nestedImages: Array<{ media_type: string; size_kb: number }> = [];
                let fullText = '';
                if (Array.isArray(rc)) {
                  const textParts: string[] = [];
                  for (const x of rc) {
                    if (x.type === 'text') textParts.push(x.text ?? '');
                    else if (x.type === 'image') {
                      const dataStr: string = x.source?.data ?? '';
                      nestedImages.push({ media_type: x.source?.media_type ?? 'unknown', size_kb: Math.round(dataStr.length * 0.75 / 1024) });
                    }
                  }
                  fullText = textParts.join(' ');
                } else {
                  fullText = String(rc ?? '');
                }
                blocks.push({
                  type: 'tool_result',
                  preview: fullText.slice(0, CONV_PREVIEW),
                  fullText: fullText.length > CONV_PREVIEW ? fullText.slice(0, CONV_FULL) : undefined,
                  tool_use_id: b.tool_use_id,
                  nestedImages: nestedImages.length > 0 ? nestedImages : undefined,
                });
                break;
              }
              case 'image': {
                const src = b.source ?? {};
                const dataStr: string = src.data ?? '';
                blocks.push({ type: 'image', media_type: src.media_type, data: dataStr.slice(0, 100), size_kb: Math.round(dataStr.length * 0.75 / 1024) });
                break;
              }
            }
          }
        }
        if (blocks.length) convMsgs.push({ role: m.role, blocks });
      }
      req.conversationSummary = convMsgs.length ? convMsgs : null;

      for (const m of msgs) {
        if (!Array.isArray(m.content)) continue;
        for (const b of m.content) {
          if (b.type === 'tool_result' && b.tool_use_id) req.incomingToolIds.push(b.tool_use_id);
        }
      }

      req.events.push({ time: ts, type: 'request_body', detail: `Body: ${req.originalModel ?? 'unknown'} · ${req.messageCount} msgs · ${req.toolCount} tools` });
      continue;
    }

    if (msg.startsWith('Using ') && rid && requestMap.has(rid)) {
      const req = requestMap.get(rid)!;
      req.scenario = parseScenario(msg);
      req.events.push({ time: ts, type: 'routing', detail: msg });
      continue;
    }

    if (msg === 'final request' && rid && requestMap.has(rid)) {
      const req = requestMap.get(rid)!;
      // Real CCR log: model is in entry.request.body (JSON string), URL in entry.requestUrl
      let bodyModel: string | null = null;
      try {
        const bodyStr = entry.request?.body ?? entry.data?.body;
        if (bodyStr) {
          const bodyObj = JSON.parse(bodyStr);
          bodyModel = bodyObj.model ?? null;
          // Parse post-transformer reasoning/thinking config
          const effortMap: Record<string, number> = { high: 10000, medium: 5000, low: 1000 };
          const reasoning = bodyObj.reasoning;
          const reasoningEffort = bodyObj.reasoning_effort;
          const thinking = bodyObj.thinking;
          if (reasoning?.effort) {
            // OpenRouter-style: { reasoning: { enabled: true, effort: 'high' } }
            req.thinkingMode = 'enabled';
            req.thinkingBudget = effortMap[reasoning.effort] ?? 1000;
          } else if (reasoningEffort) {
            // OpenAI-style: { reasoning_effort: 'high' }
            req.thinkingMode = 'enabled';
            req.thinkingBudget = effortMap[reasoningEffort] ?? 1000;
          } else if (thinking) {
            // Anthropic-style (direct Anthropic provider): { thinking: { type, budget_tokens } }
            const items = Array.isArray(thinking) ? thinking : [thinking];
            for (const block of items) {
              if (block.type === 'enabled') { req.thinkingMode = 'enabled'; req.thinkingBudget = block.budget_tokens ?? null; }
              else if (block.type === 'adaptive') { req.thinkingMode = 'adaptive'; }
            }
          }
        }
      } catch { /* ignore parse errors */ }
      req.routedModel = bodyModel ?? entry.data?.model ?? null;
      req.routedUrl = entry.requestUrl ?? entry.data?.url ?? null;
      req.provider = entry.data?.provider ?? extractProvider(req.routedUrl);
      if (req.fallbackChain.length === 0 && req.routedModel) {
        req.fallbackChain.push({ model: req.routedModel, status: 'pending', httpStatus: null, errorBody: null, isPrimary: true });
      }
      req.events.push({ time: ts, type: 'final_request', detail: `-> ${req.routedModel} via ${req.routedUrl ?? ''}` });
      continue;
    }

    if (msg === 'request completed' && rid && requestMap.has(rid)) {
      const req = requestMap.get(rid)!;
      req.statusCode = entry.res?.statusCode ?? null;
      req.responseTime = entry.responseTime ?? null;
      req.endTime = ts;
      if (req.fallbackChain.length > 0) {
        const last = req.fallbackChain[req.fallbackChain.length - 1];
        if (req.statusCode !== null && req.statusCode < 400) last.status = 'success';
        else { last.status = 'failed'; last.httpStatus = req.statusCode; }
      }
      req.hasFallback = req.fallbackChain.some(e => !e.isPrimary);
      req.allFallbacksFailed = req.fallbackChain.length > 0 && req.fallbackChain.every(e => e.status === 'failed');
      req.events.push({ time: ts, type: 'completed', detail: `HTTP ${req.statusCode} in ${fmtMs(req.responseTime)}` });
      continue;
    }

    if (msg.startsWith('Trying fallback model:') && rid && requestMap.has(rid)) {
      const req = requestMap.get(rid)!;
      const model = msg.replace('Trying fallback model:', '').trim();
      req.fallbackChain.push({ model, status: 'pending', httpStatus: null, errorBody: null, isPrimary: false });
      req.events.push({ time: ts, type: 'fallback', detail: `Trying ${model}` });
      continue;
    }

    // Two log formats for provider errors:
    // 1. {"msg":"[provider_response_error] Error from provider(...)..."} — no reqId, skipped
    // 2. {"reqId":"req-N","err":{"code":"provider_response_error"},"msg":"Error from provider(...)..."} — has reqId
    const isProviderError = msg.startsWith('[provider_response_error]') || entry.err?.code === 'provider_response_error';
    if (isProviderError && rid && requestMap.has(rid)) {
      const req = requestMap.get(rid)!;
      const match = /provider\((\w+),(.+?):\s+(\d{3})\)/.exec(msg);
      const status = match ? parseInt(match[3], 10) : null;
      const bodyStart = msg.indexOf('): ');
      let errorMsg = '';
      if (bodyStart >= 0) {
        const bodyStr = msg.slice(bodyStart + 3);
        try {
          const parsed = JSON.parse(bodyStr);
          errorMsg = parsed.error?.metadata?.raw ?? parsed.error?.message ?? bodyStr.slice(0, 300);
        } catch { errorMsg = bodyStr.slice(0, 300); }
      }
      // If routedModel is still null (real CCR format with no body in "final request"),
      // extract it from the regex match before looking up the pending chain entry.
      if (!req.routedModel && match?.[2]) {
        const model: string = match[2];
        req.routedModel = model;
        if (req.fallbackChain.length === 0)
          req.fallbackChain.push({ model, status: 'pending', httpStatus: null, errorBody: null, isPrimary: true });
      }
      const pending = req.fallbackChain.find(e => e.status === 'pending');
      if (pending) { pending.status = 'failed'; pending.httpStatus = status; pending.errorBody = errorMsg; }
      if (!req.routingError) req.routingError = errorMsg;
      req.events.push({ time: ts, type: 'error', detail: `HTTP ${status}: ${errorMsg.slice(0, 100)}`, errorBody: errorMsg });
      continue;
    }

    if (type === 'send data' && rid && requestMap.has(rid)) {
      const req = requestMap.get(rid)!;
      if (typeof entry.data === 'string') processSseData(req, entry.data);
      continue;
    }

    if (msg === 'Conversion complete, final Anthropic response' && rid && requestMap.has(rid)) {
      const req = requestMap.get(rid)!;
      const resp = entry.result ?? entry.response ?? {};
      const usage = resp.usage ?? {};
      if (usage.input_tokens && !req.inputTokens) req.inputTokens = usage.input_tokens;
      if (usage.output_tokens && !req.outputTokens) req.outputTokens = usage.output_tokens;
      if (usage.cache_read_input_tokens) req.cacheReadTokens = usage.cache_read_input_tokens;
      for (const block of (resp.content ?? [])) {
        if (block.type === 'text') req.responseText = ((req.responseText ?? '') + block.text).slice(0, 100000);
        if (block.type === 'thinking') req.thinkingText = block.thinking;
        if (block.type === 'tool_use') {
          req.toolCallDetails.push({ name: block.name, id: block.id, input: JSON.stringify(block.input ?? {}) });
          req.outgoingToolIds.push({ id: block.id, name: block.name });
        }
      }
      if (resp.usage?.cost != null) req.requestCost = resp.usage.cost;
      continue;
    }

    if (msg === 'Original OpenAI response' && rid && requestMap.has(rid)) {
      const req = requestMap.get(rid)!;
      const resp = entry.response ?? {};
      const usage = resp.usage ?? {};
      if (usage.cost != null) req.requestCost = usage.cost;
      if (!req.outputTokens) req.outputTokens = usage.completion_tokens ?? 0;
      if (!req.inputTokens) {
        const cached = usage.prompt_tokens_details?.cached_tokens ?? 0;
        const prompt = usage.prompt_tokens ?? 0;
        req.inputTokens = Math.max(prompt - cached, 0) || prompt;
        if (!req.cacheReadTokens) req.cacheReadTokens = cached;
      }
      continue;
    }
  }

  const result = Array.from(requestMap.values());
  for (const req of result) finalizeRequest(req);
  return result.sort((a, b) => a.startTime - b.startTime);
}
