import { describe, it, expect } from 'vitest';
import { parseLog, detectParallelGroups, groupIntoTurns, generateVisualization } from './CcrVisualizer';

// --- Helpers to build minimal NDJSON lines ---

function makeIncoming(reqId: string, time: number, url = '/v1/messages'): string {
  return JSON.stringify({
    time,
    msg: 'incoming request',
    reqId,
    req: { method: 'POST', url },
  });
}

function makeRequestBody(reqId: string, time: number, overrides: Record<string, any> = {}): string {
  return JSON.stringify({
    time,
    type: 'request body',
    reqId,
    data: {
      model: 'claude-opus-4-6',
      messages: [],
      tools: [],
      ...overrides,
    },
  });
}

function makeCompleted(reqId: string, time: number, statusCode: number, responseTime: number): string {
  return JSON.stringify({
    time,
    msg: 'request completed',
    reqId,
    res: { statusCode },
    responseTime,
  });
}

function makeFinalRequest(reqId: string, time: number, model: string, url = 'https://api.anthropic.com/v1/messages'): string {
  return JSON.stringify({
    time,
    msg: 'final request',
    reqId,
    data: { model, url },
  });
}

function makeFallback(reqId: string, time: number, model: string): string {
  return JSON.stringify({
    time,
    msg: `Trying fallback model: ${model}`,
    reqId,
  });
}

function makeProviderError(reqId: string, time: number, status: number, errorMsg: string): string {
  return JSON.stringify({
    time,
    msg: `[provider_response_error] provider(anthropic,claude-opus-4-6: ${status}): ${JSON.stringify({ error: { message: errorMsg } })}`,
    reqId,
  });
}

function makeSseData(reqId: string, time: number, inputTokens: number, outputTokens: number): string {
  const events = [
    `data: ${JSON.stringify({ type: 'message_start', message: { usage: { input_tokens: inputTokens, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } })}`,
    `data: ${JSON.stringify({ type: 'message_delta', usage: { output_tokens: outputTokens } })}`,
  ].join('\n');
  return JSON.stringify({
    time,
    type: 'send data',
    reqId,
    data: events,
  });
}

// Real CCR log format: "final request" has no request.body, only requestUrl + headers
function makeRealFinalRequest(reqId: string, time: number, url: string): string {
  return JSON.stringify({
    time,
    msg: 'final request',
    reqId,
    requestUrl: url,
    headers: { 'content-type': 'application/json' },
  });
}

// SSE with model field in message_start (what the provider actually returns)
function makeSseDataWithModel(reqId: string, time: number, model: string, inputTokens: number, outputTokens: number): string {
  const events = [
    `data: ${JSON.stringify({ type: 'message_start', message: { model, usage: { input_tokens: inputTokens, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } })}`,
    `data: ${JSON.stringify({ type: 'message_delta', usage: { output_tokens: outputTokens } })}`,
  ].join('\n');
  return JSON.stringify({ time, type: 'send data', reqId, data: events });
}

// Provider error with configurable provider name and model (e.g. openrouter + slash-model names)
function makeProviderErrorWithModel(reqId: string, time: number, providerName: string, model: string, status: number, errorMsg: string): string {
  return JSON.stringify({
    time,
    msg: `[provider_response_error] provider(${providerName},${model}: ${status}): ${JSON.stringify({ error: { message: errorMsg } })}`,
    reqId,
  });
}

// Real CCR log format: error logged via entry.err.code with no [provider_response_error] prefix in msg
// (matches line 40 format from actual CCR logs, paired with a no-reqId line 39 format that is skipped)
function makeRealCcrProviderError(reqId: string, time: number, providerName: string, model: string, status: number, errorMsg: string): string {
  const fullMsg = `Error from provider(${providerName},${model}: ${status}): ${JSON.stringify({ error: { message: errorMsg } })}`;
  return JSON.stringify({
    level: 50,
    time,
    reqId,
    err: { type: 'Error', message: fullMsg, statusCode: status, code: 'provider_response_error' },
    msg: fullMsg,
  });
}

// --- Test 1: parseLog — empty input ---
describe('parseLog', () => {
  it('returns [] for empty input', () => {
    expect(parseLog('')).toEqual([]);
    expect(parseLog('   \n\n  ')).toEqual([]);
  });

  // --- Test 2: parseLog — minimal incoming request line ---
  it('creates one request from a minimal incoming request line', () => {
    const rid = 'req-abc';
    const logText = makeIncoming(rid, 1000000);
    const reqs = parseLog(logText);
    expect(reqs).toHaveLength(1);
    expect(reqs[0].reqId).toBe(rid);
    expect(reqs[0].startTime).toBe(1000000);
    expect(reqs[0].method).toBe('POST');
    expect(reqs[0].url).toBe('/v1/messages');
  });

  // --- Test 3: parseLog — skips count_tokens URLs ---
  it('does not create a request for count_tokens URLs', () => {
    const logText = makeIncoming('req-skip', 1000000, '/v1/messages/count_tokens');
    const reqs = parseLog(logText);
    expect(reqs).toHaveLength(0);
  });

  // --- Test 4: parseLog — request body parsing ---
  it('extracts model, messageCount, toolCount from request body', () => {
    const rid = 'req-body';
    const lines = [
      makeIncoming(rid, 1000),
      makeRequestBody(rid, 1001, {
        model: 'claude-sonnet-4-6',
        messages: [{ role: 'user', content: 'hello' }],
        tools: [{ name: 'bash' }, { name: 'write' }],
        max_tokens: 8192,
        temperature: 0.5,
      }),
    ].join('\n');
    const reqs = parseLog(lines);
    expect(reqs).toHaveLength(1);
    const r = reqs[0];
    expect(r.originalModel).toBe('claude-sonnet-4-6');
    expect(r.messageCount).toBe(1);
    expect(r.toolCount).toBe(2);
    expect(r.maxTokens).toBe(8192);
    expect(r.temperature).toBe(0.5);
  });

  // --- Test 4b: parseLog — reasoning parsed from final request (post-transformer) ---
  it('extracts thinkingBudget from final request post-transformer body', () => {
    const rid = 'req-reasoning';
    const finalBody = JSON.stringify({ model: 'minimax/minimax-m2.5', reasoning: { enabled: true, effort: 'high' } });
    const finalReq = JSON.stringify({ time: 1002, msg: 'final request', reqId: rid, request: { body: finalBody }, requestUrl: 'https://openrouter.ai/api/v1/chat/completions' });
    const lines = [
      makeIncoming(rid, 1000),
      makeRequestBody(rid, 1001, { model: 'claude-sonnet-4-6', messages: [], tools: [] }),
      finalReq,
    ].join('\n');
    const reqs = parseLog(lines);
    expect(reqs[0].thinkingMode).toBe('enabled');
    expect(reqs[0].thinkingBudget).toBe(10000); // 'high' maps to 10000
  });

  // --- Test 5: parseLog — user query extraction strips injected content ---
  it('extracts real user query and skips injected system-reminder blocks', () => {
    const rid = 'req-query';
    const messages = [
      {
        role: 'user',
        content: [
          { type: 'text', text: '<system-reminder>This is injected content</system-reminder>' },
          { type: 'text', text: 'What is the capital of France?' },
        ],
      },
    ];
    const lines = [
      makeIncoming(rid, 1000),
      makeRequestBody(rid, 1001, { messages }),
    ].join('\n');
    const reqs = parseLog(lines);
    expect(reqs[0].userQuery).toBe('What is the capital of France?');
  });

  // --- Test 5b: parseLog — plain-string user content that is only a system-reminder ---
  it('skips plain-string user content that is entirely a system-reminder', () => {
    const rid = 'req-bg';
    // Simulates a background request where both user messages are injected context (no real query)
    const messages = [
      { role: 'user', content: '<system-reminder>\nCalled the Read tool with input: {}\n</system-reminder>' },
      { role: 'user', content: [{ type: 'text', text: '<system-reminder>\nResult of the Read tool: ...\n</system-reminder>' }] },
    ];
    const lines = [
      makeIncoming(rid, 1000),
      makeRequestBody(rid, 1001, { messages }),
    ].join('\n');
    const reqs = parseLog(lines);
    expect(reqs[0].userQuery).toBeNull();
  });

  // --- Test 6: parseLog — SSE token counting ---
  it('parses message_start and message_delta SSE chunks for token counts', () => {
    const rid = 'req-sse';
    const lines = [
      makeIncoming(rid, 1000),
      makeRequestBody(rid, 1001),
      makeSseData(rid, 1002, 1234, 567),
    ].join('\n');
    const reqs = parseLog(lines);
    expect(reqs[0].inputTokens).toBe(1234);
    expect(reqs[0].outputTokens).toBe(567);
  });

  // --- Test 7: parseLog — fallback chain ---
  it('records fallback attempts and marks allFallbacksFailed when all fail', () => {
    const rid = 'req-fb';
    const lines = [
      makeIncoming(rid, 1000),
      makeRequestBody(rid, 1001),
      makeFinalRequest(rid, 1002, 'claude-opus-4-6'),
      makeProviderError(rid, 1003, 503, 'Service unavailable'),
      makeFallback(rid, 1004, 'claude-sonnet-4-6'),
      makeFinalRequest(rid, 1005, 'claude-sonnet-4-6'),
      makeProviderError(rid, 1006, 429, 'Rate limited'),
      makeCompleted(rid, 1007, 503, 5000),
    ].join('\n');
    const reqs = parseLog(lines);
    expect(reqs[0].hasFallback).toBe(true);
    expect(reqs[0].fallbackChain.length).toBeGreaterThan(1);
    expect(reqs[0].allFallbacksFailed).toBe(true);
  });

  // --- Bug 3: originalModel must not be set when request body has provider,model format ---
  // The imageAgent creates sub-requests with model already in "provider,model" format
  // (e.g. "hyperbolic,Qwen/Qwen2.5-VL-7B-Instruct"). These are CCR-internal sub-requests —
  // the original Claude model is not present. originalModel should be null so the card
  // does not show a misleading "hyperbolic,Qwen/... → Qwen/..." arrow.
  it('does not set originalModel when request body model is in provider,model format', () => {
    const rid = 'req-img-agent';
    const lines = [
      makeIncoming(rid, 1000),
      // Simulates imageAgent sub-request: model already contains a comma
      JSON.stringify({ time: 1001, type: 'request body', reqId: rid, data: { model: 'hyperbolic,Qwen/Qwen2.5-VL-7B-Instruct', messages: [], tools: [] } }),
      makeRealFinalRequest(rid, 1002, 'https://api.hyperbolic.xyz/v1/chat/completions'),
      makeSseDataWithModel(rid, 1003, 'Qwen/Qwen2.5-VL-7B-Instruct', 100, 50),
      makeCompleted(rid, 1004, 200, 800),
    ].join('\n');
    const reqs = parseLog(lines);
    expect(reqs[0].originalModel).toBeNull();
    expect(reqs[0].routedModel).toBe('Qwen/Qwen2.5-VL-7B-Instruct');
  });

  // --- Bug 1: routedModel extracted from message_start SSE when "final request" has no body ---
  it('extracts routedModel from message_start SSE when final request has no body', () => {
    const rid = 'req-real-fmt';
    const lines = [
      makeIncoming(rid, 1000),
      makeRequestBody(rid, 1001),
      makeRealFinalRequest(rid, 1002, 'https://openrouter.ai/api/v1/chat/completions'),
      makeSseDataWithModel(rid, 1003, 'arcee-ai/trinity-large-preview:free', 503, 21),
      makeCompleted(rid, 1004, 200, 1500),
    ].join('\n');
    const reqs = parseLog(lines);
    expect(reqs[0].routedModel).toBe('arcee-ai/trinity-large-preview:free');
    expect(reqs[0].fallbackChain).toHaveLength(1);
    expect(reqs[0].fallbackChain[0].model).toBe('arcee-ai/trinity-large-preview:free');
    expect(reqs[0].fallbackChain[0].isPrimary).toBe(true);
  });

  // --- Bug 2: routedModel extracted from provider_response_error when there is no SSE ---
  it('extracts routedModel from provider_response_error when final request has no body and no SSE', () => {
    const rid = 'req-err-fmt';
    const lines = [
      makeIncoming(rid, 1000),
      makeRequestBody(rid, 1001),
      makeRealFinalRequest(rid, 1002, 'https://openrouter.ai/api/v1/chat/completions'),
      makeProviderErrorWithModel(rid, 1003, 'openrouter', 'google/gemini-2.5-flash-lite', 500, 'Internal Server Error'),
      makeCompleted(rid, 1004, 500, 800),
    ].join('\n');
    const reqs = parseLog(lines);
    expect(reqs[0].routedModel).toBe('google/gemini-2.5-flash-lite');
    expect(reqs[0].fallbackChain).toHaveLength(1);
    expect(reqs[0].fallbackChain[0].model).toBe('google/gemini-2.5-flash-lite');
    expect(reqs[0].fallbackChain[0].status).toBe('failed');
  });

  // --- Test 10: mixed valid/invalid lines ---
  it('correctly parses valid CCR entries when log contains invalid JSON lines', () => {
    const rid = 'req-mixed';
    const lines = [
      'not valid json at all',
      '',
      '{"incomplete":',
      makeIncoming(rid, 5000),
      'another bad line',
      makeRequestBody(rid, 5001, { model: 'claude-haiku-4-5-20251001', messages: [{ role: 'user', content: 'test' }] }),
      '   ',
    ].join('\n');
    const reqs = parseLog(lines);
    expect(reqs).toHaveLength(1);
    expect(reqs[0].reqId).toBe(rid);
    expect(reqs[0].originalModel).toBe('claude-haiku-4-5-20251001');
  });
});

// --- Test 8: detectParallelGroups — fork/join detection ---
describe('detectParallelGroups', () => {
  it('marks fork request and join request correctly given shared tool IDs', () => {
    // Create a fork request that emits two Task tool calls
    const forkRid = 'req-fork';
    const joinRid = 'req-join';

    const forkReq = parseLog(
      [
        makeIncoming(forkRid, 1000),
        makeRequestBody(forkRid, 1001),
        makeCompleted(forkRid, 1002, 200, 800),
      ].join('\n')
    )[0];

    // Manually set outgoing tool IDs on fork
    forkReq.outgoingToolIds = [
      { id: 'tool-1', name: 'Task' },
      { id: 'tool-2', name: 'Task' },
    ];
    forkReq.endTime = 1002;

    // Create join request that receives those two tool results
    const joinReq = parseLog(
      [
        makeIncoming(joinRid, 1100),
        makeRequestBody(joinRid, 1101, {
          messages: [
            {
              role: 'user',
              content: [
                { type: 'tool_result', tool_use_id: 'tool-1', content: 'result 1' },
                { type: 'tool_result', tool_use_id: 'tool-2', content: 'result 2' },
              ],
            },
          ],
        }),
        makeCompleted(joinRid, 1200, 200, 500),
      ].join('\n')
    )[0];

    joinReq.incomingToolIds = ['tool-1', 'tool-2'];
    joinReq.startTime = 1100;

    const reqs = [forkReq, joinReq];
    detectParallelGroups(reqs);

    expect(forkReq.parallelGroup).not.toBeNull();
    expect(forkReq.parallelGroup?.role).toBe('fork');
    expect(joinReq.parallelGroup).not.toBeNull();
    expect(joinReq.parallelGroup?.role).toBe('join');
    expect(joinReq.parallelGroup?.forkRid).toBe(forkRid);
  });
});

// --- XSS security tests ---
describe('XSS sanitization', () => {
  it('escapes <script> tags in userQuery', () => {
    const rid = 'req-xss-script';
    const logText = [
      makeIncoming(rid, 3000),
      makeRequestBody(rid, 3001, {
        messages: [{ role: 'user', content: '<script>alert("xss")</script>' }],
      }),
      makeCompleted(rid, 3002, 200, 500),
    ].join('\n');
    const html = generateVisualization(logText);
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes img onerror XSS payload in userQuery', () => {
    const rid = 'req-xss-img';
    const logText = [
      makeIncoming(rid, 3100),
      makeRequestBody(rid, 3101, {
        messages: [{ role: 'user', content: '<img src=x onerror=alert(1)>' }],
      }),
      makeCompleted(rid, 3102, 200, 500),
    ].join('\n');
    const html = generateVisualization(logText);
    expect(html).not.toContain('<img src=x onerror=');
    expect(html).toContain('&lt;img');
    expect(html).toContain('onerror=alert(1)&gt;');
  });

  it('escapes double-quote injection in data attributes', () => {
    const rid = 'req-xss-dquote';
    const malicious = 'foo" onmouseover="alert(1)';
    const logText = [
      makeIncoming(rid, 3200),
      makeRequestBody(rid, 3201, {
        messages: [{ role: 'user', content: malicious }],
      }),
      makeCompleted(rid, 3202, 200, 500),
    ].join('\n');
    const html = generateVisualization(logText);
    // The raw double-quote must not appear unescaped inside any attribute value
    expect(html).not.toContain('foo" onmouseover=');
    expect(html).toContain('&quot;');
  });

  it('escapes single-quote injection in onclick attributes', () => {
    const rid = 'req-xss-squote';
    const malicious = "it's a test');alert('xss";
    const logText = [
      makeIncoming(rid, 3300),
      makeRequestBody(rid, 3301, {
        messages: [{ role: 'user', content: malicious }],
      }),
      makeCompleted(rid, 3302, 200, 500),
    ].join('\n');
    const html = generateVisualization(logText);
    expect(html).not.toContain("');alert('xss");
    expect(html).toContain('&#39;');
  });

  it('escapes XSS payload in system prompt', () => {
    const rid = 'req-xss-sys';
    const logText = [
      makeIncoming(rid, 3400),
      makeRequestBody(rid, 3401, {
        system: '<svg onload=alert(document.cookie)>',
        messages: [{ role: 'user', content: 'hello' }],
      }),
      makeCompleted(rid, 3402, 200, 500),
    ].join('\n');
    const html = generateVisualization(logText);
    expect(html).not.toContain('<svg onload=');
    expect(html).toContain('&lt;svg');
  });
});

// --- Test 9: generateVisualization — returns valid HTML ---
describe('generateVisualization', () => {
  it('returns valid HTML for a log with at least one CCR request', () => {
    const rid = 'req-html';
    const logText = [
      makeIncoming(rid, 2000),
      makeRequestBody(rid, 2001, {
        model: 'claude-opus-4-6',
        messages: [{ role: 'user', content: 'Hello world' }],
      }),
      makeFinalRequest(rid, 2002, 'claude-opus-4-6'),
      makeSseData(rid, 2003, 100, 50),
      makeCompleted(rid, 2004, 200, 1200),
    ].join('\n');

    const html = generateVisualization(logText);
    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect(html).toContain('<html');
    expect(html).toContain('CCR Log Visualizer');
  });

  it('returns empty-state HTML for empty input', () => {
    const html = generateVisualization('');
    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect(html).toContain('No log content');
  });

  it('returns empty-state HTML when no CCR requests are found', () => {
    const html = generateVisualization('{"msg":"some other log","time":1000}');
    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect(html).toContain('No CCR requests found');
  });
});

// --- groupIntoTurns tests ---
describe('groupIntoTurns', () => {
  it('returns [] for empty array', () => {
    expect(groupIntoTurns([])).toEqual([]);
  });

  it('returns one turn for a single request', () => {
    const reqs = parseLog(makeIncoming('r1', 1000));
    const turns = groupIntoTurns(reqs);
    expect(turns).toHaveLength(1);
    expect(turns[0]).toHaveLength(1);
    expect(turns[0][0].reqId).toBe('r1');
  });

  it('groups two requests within 200ms into the same turn', () => {
    const lines = [makeIncoming('r1', 1000), makeIncoming('r2', 1150)].join('\n');
    const reqs = parseLog(lines);
    const turns = groupIntoTurns(reqs);
    expect(turns).toHaveLength(1);
    expect(turns[0]).toHaveLength(2);
  });

  it('splits two requests more than 200ms apart into separate turns', () => {
    const lines = [makeIncoming('r1', 1000), makeIncoming('r2', 1201)].join('\n');
    const reqs = parseLog(lines);
    const turns = groupIntoTurns(reqs);
    expect(turns).toHaveLength(2);
    expect(turns[0]).toHaveLength(1);
    expect(turns[1]).toHaveLength(1);
  });

  it('groups first two close requests together, third far away gets its own turn', () => {
    const lines = [
      makeIncoming('r1', 1000),
      makeIncoming('r2', 1100),
      makeIncoming('r3', 2000),
    ].join('\n');
    const reqs = parseLog(lines);
    const turns = groupIntoTurns(reqs);
    expect(turns).toHaveLength(2);
    expect(turns[0]).toHaveLength(2);
    expect(turns[1]).toHaveLength(1);
  });
});

// --- generateVisualization HTML content assertions ---
describe('generateVisualization — content assertions', () => {
  function buildRichLog(rid: string, model: string, inputTokens: number, outputTokens: number): string {
    return [
      makeIncoming(rid, 2000),
      makeRequestBody(rid, 2001, {
        model: 'claude-opus-4-6',
        messages: [{ role: 'user', content: 'Hello world' }],
      }),
      makeFinalRequest(rid, 2002, model),
      makeSseData(rid, 2003, inputTokens, outputTokens),
      makeCompleted(rid, 2004, 200, 1200),
    ].join('\n');
  }

  it('renders the routed model name in HTML', () => {
    const html = generateVisualization(buildRichLog('r-model', 'claude-sonnet-4-6', 100, 50));
    expect(html).toContain('claude-sonnet-4-6');
  });

  it('renders input/output token counts when SSE data is present', () => {
    const html = generateVisualization(buildRichLog('r-tokens', 'claude-opus-4-6', 1234, 567));
    // fmtNum(1234) = "1,234", fmtNum(567) = "567"
    expect(html).toContain('1,234');
    expect(html).toContain('567');
  });

  it('renders <svg for the timeline when there are requests', () => {
    const html = generateVisualization(buildRichLog('r-svg', 'claude-opus-4-6', 10, 5));
    expect(html).toContain('<svg');
  });

  it('renders fallback chain HTML (fb-chain class) when a fallback occurred', () => {
    const rid = 'r-fb';
    const logText = [
      makeIncoming(rid, 1000),
      makeRequestBody(rid, 1001),
      makeFinalRequest(rid, 1002, 'claude-opus-4-6'),
      makeProviderError(rid, 1003, 503, 'Service unavailable'),
      makeFallback(rid, 1004, 'claude-sonnet-4-6'),
      makeFinalRequest(rid, 1005, 'claude-sonnet-4-6'),
      makeCompleted(rid, 1006, 200, 3000),
    ].join('\n');
    const html = generateVisualization(logText);
    expect(html).toContain('fb-chain');
  });

  it('renders the thinking badge when a request used extended thinking', () => {
    const rid = 'r-think';
    const finalBody = JSON.stringify({ model: 'minimax/minimax-m2.5', reasoning: { enabled: true, effort: 'high' } });
    const finalReq = JSON.stringify({ time: 2002, msg: 'final request', reqId: rid, request: { body: finalBody }, requestUrl: 'https://openrouter.ai/api/v1/chat/completions' });
    const logText = [
      makeIncoming(rid, 2000),
      makeRequestBody(rid, 2001, { model: 'claude-sonnet-4-6', messages: [{ role: 'user', content: 'think hard' }], tools: [] }),
      finalReq,
      makeCompleted(rid, 2003, 200, 5000),
    ].join('\n');
    const html = generateVisualization(logText);
    expect(html).toContain('sc-thinking');
  });

  it('renders the cost table (cost-table class) when there are requests', () => {
    const html = generateVisualization(buildRichLog('r-cost', 'claude-opus-4-6', 100, 50));
    expect(html).toContain('cost-table');
  });

  it('shows error message in response section for a single-attempt failed request', () => {
    const rid = 'r-single-fail';
    const logText = [
      makeIncoming(rid, 1000),
      makeRequestBody(rid, 1001),
      makeRealFinalRequest(rid, 1002, 'https://openrouter.ai/api/v1/chat/completions'),
      makeProviderErrorWithModel(rid, 1003, 'openrouter', 'minimax/minimax-m2.5', 404, 'No endpoints found that support image input'),
      makeCompleted(rid, 1004, 404, 541),
    ].join('\n');
    const html = generateVisualization(logText);
    expect(html).toContain('No endpoints found that support image input');
  });

  it('shows open-in-new-tab button when error message exceeds 500-char threshold', () => {
    const rid = 'r-long-fail';
    const longError = 'x'.repeat(600);
    const logText = [
      makeIncoming(rid, 1000),
      makeRequestBody(rid, 1001),
      makeRealFinalRequest(rid, 1002, 'https://openrouter.ai/api/v1/chat/completions'),
      makeProviderErrorWithModel(rid, 1003, 'openrouter', 'minimax/minimax-m2.5', 500, longError),
      makeCompleted(rid, 1004, 500, 100),
    ].join('\n');
    const html = generateVisualization(logText);
    expect(html).toContain('Open full text in new tab');
  });

  it('shows SSE stream error for HTTP 200 response with type:error in SSE body', () => {
    // Hyperbolic (and other providers) sometimes return HTTP 200 but include an SSE error event
    // in the stream body (e.g. connection failures). The response shows "Stream Error" not "HTTP 200".
    const rid = 'r-sse-error';
    const sseError = JSON.stringify({
      type: 'send data', reqId: rid, time: 1003,
      data: 'event: error\ndata: {"type":"error","message":{"type":"api_error","message":"Stream processing error: Cannot connect to host"}}\n\n',
    });
    const logText = [
      makeIncoming(rid, 1000),
      makeRequestBody(rid, 1001),
      makeRealFinalRequest(rid, 1002, 'https://api.hyperbolic.xyz/v1/chat/completions'),
      sseError,
      makeCompleted(rid, 1004, 200, 1104),
    ].join('\n');
    const html = generateVisualization(logText);
    expect(html).toContain('Stream Error');
    expect(html).toContain('Stream processing error: Cannot connect to host');
    expect(html).toContain('err-block');
  });

  it('shows error message when using real CCR log format (entry.err.code = provider_response_error)', () => {
    // Real CCR logs emit TWO lines for provider errors:
    //   line A: {"msg":"[provider_response_error] ..."} — no reqId, not connected to any request
    //   line B: {"reqId":"req-N","err":{"code":"provider_response_error"},"msg":"Error from provider(...)"} — has reqId
    // Only line B can be matched to a request. The parser must use entry.err.code to detect this.
    const rid = 'r-real-ccr-fail';
    const logText = [
      makeIncoming(rid, 1000),
      makeRequestBody(rid, 1001),
      makeRealFinalRequest(rid, 1002, 'https://openrouter.ai/api/v1/chat/completions'),
      // line A (no reqId) — parser should skip this
      JSON.stringify({ level: 50, time: 1003, msg: '[provider_response_error] Error from provider(openrouter,minimax/minimax-m2.5: 404): {"error":{"message":"No endpoints found that support image input","code":404}}' }),
      // line B (has reqId, err.code) — parser should pick this up
      makeRealCcrProviderError(rid, 1003, 'openrouter', 'minimax/minimax-m2.5', 404, 'No endpoints found that support image input'),
      makeCompleted(rid, 1004, 404, 541),
    ].join('\n');
    const html = generateVisualization(logText);
    expect(html).toContain('No endpoints found that support image input');
    expect(html).toContain('err-block');
  });
});

// --- Snapshot test: regression guard ---
describe('generateVisualization — snapshot', () => {
  it('produces byte-for-byte identical HTML across refactors', () => {
    const rid1 = 'snap-r1';
    const rid2 = 'snap-r2';

    // Request 1: fallback + tokens + thinking
    const finalBody1 = JSON.stringify({ model: 'minimax/minimax-m2.5', reasoning: { enabled: true, effort: 'high' } });
    const finalReq1 = JSON.stringify({ time: 1004, msg: 'final request', reqId: rid1, request: { body: finalBody1 }, requestUrl: 'https://openrouter.ai/api/v1/chat/completions' });
    const req1Lines = [
      makeIncoming(rid1, 1000),
      makeRequestBody(rid1, 1001, { model: 'claude-opus-4-6', messages: [{ role: 'user', content: 'Snapshot test query' }], tools: [{ name: 'bash' }] }),
      makeFinalRequest(rid1, 1002, 'claude-opus-4-6'),
      makeProviderError(rid1, 1003, 503, 'Service unavailable'),
      makeFallback(rid1, 1004, 'minimax/minimax-m2.5'),
      finalReq1,
      makeSseData(rid1, 1005, 500, 200),
      makeCompleted(rid1, 1006, 200, 3000),
    ];

    // Request 2: plain successful request
    const req2Lines = [
      makeIncoming(rid2, 5000),
      makeRequestBody(rid2, 5001, { model: 'claude-sonnet-4-6', messages: [{ role: 'user', content: 'Simple query' }], tools: [] }),
      makeFinalRequest(rid2, 5002, 'claude-sonnet-4-6'),
      makeSseData(rid2, 5003, 100, 50),
      makeCompleted(rid2, 5004, 200, 800),
    ];

    const logText = [...req1Lines, ...req2Lines].join('\n');
    const html = generateVisualization(logText);
    // Replace the dynamic timestamp so the snapshot is stable across runs
    const stableHtml = html.replace(
      /<span style="font-size:11px;color:var\(--text-dim\)">[^<]*<\/span>/,
      '<span style="font-size:11px;color:var(--text-dim)">SNAPSHOT_DATE</span>',
    );
    expect(stableHtml).toMatchSnapshot();
  });
});
