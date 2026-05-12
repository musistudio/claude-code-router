#!/usr/bin/env node
/**
 * Chrome Device Bridge — HTTP↔CDP bridge for Chrome's on-device Gemini Nano.
 * Runs on the host, connects to Chrome via puppeteer-core, and exposes an
 * HTTP endpoint that streams Anthropic-format SSE from the Prompt API.
 *
 * Uses the Prompt API's responseConstraint (Chrome 137+) for structured JSON
 * output, forcing the model to emit valid tool calls instead of free-form text.
 */

import http from "http";
import { randomBytes, createHash } from "crypto";
import os from "os";
import path from "path";

let puppeteer: any;
try {
  puppeteer = require("puppeteer-core");
} catch {
  console.error(
    "puppeteer-core is required. Install it with: npm install puppeteer-core"
  );
  process.exit(1);
}

// ═══════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════

const DEFAULT_PORT = 3457;
const DEFAULT_CDP_PORT = 9222;
const CHROME_USER_DATA_DIR = path.join(os.tmpdir(), "chrome-debug-profile");

const DEFAULT_TEMP = 0.5;
const DEFAULT_TOPK = 40;
const TEMP_INCREASE_FACTOR = 1.5;

const STREAM_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
};

const MAX_BODY_SIZE = 1024 * 1024; // 1MB
const REQUEST_TIMEOUT_MS = 120_000; // 2 minutes

// ═══════════════════════════════════════════════════════════════════════
// JSON schema for structured output — forces the model to emit well-formed
// tool calls or text responses via responseConstraint (Chrome 137+).
// ═══════════════════════════════════════════════════════════════════════

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    tool_calls: {
      type: "array",
      maxItems: 1,
      items: {
        type: "object",
        properties: {
          name: {
            type: "string",
          },
          arguments: {
            type: "object",
            properties: {
              command: { type: "string" },
              file_path: { type: "string" },
              content: { type: "string" },
              old_string: { type: "string" },
              new_string: { type: "string" },
              url: { type: "string" },
              prompt: { type: "string" },
              query: { type: "string" },
              response: { type: "string" },
            },
          },
        },
        required: ["name", "arguments"],
      },
    },
  },
};

// ═══════════════════════════════════════════════════════════════════════
// Browser-side script (injected into the Chrome page)
// Multi-session support: sessionId -> { session, lastSystemPrompt, turnCount, stats }
// ═══════════════════════════════════════════════════════════════════════

const BRIDGE_SCRIPT = `
const DEFAULT_TEMP = ${DEFAULT_TEMP};
const DEFAULT_TOPK = ${DEFAULT_TOPK};
const TEMP_INCREASE_FACTOR = ${TEMP_INCREASE_FACTOR};

let sessions = {};
let modelParams = null;

function getEntry(sessionId) {
  return sessions[sessionId || 'cli'] || null;
}

function getOrCreateEntry(sessionId) {
  const id = sessionId || 'cli';
  if (!sessions[id]) {
    sessions[id] = {
      session: null,
      lastSystemPrompt: null,
      lastTopK: null,
      lastTemp: null,
      turnCount: 0,
      lastActivityAt: Date.now(),
      stats: { requests: 0, lastPromptLen: 0, lastRespLen: 0, lastTimeMs: 0, lastThinkMs: 0, lastGenMs: 0, lastTokens: 0, lastTokensPerSec: 0 },
    };
  }
  return sessions[id];
}

function updateDashboard() {
  try {
    // Find the most recently active session to display stats for
    var latestEntry = null;
    var latestId = 'cli';
    for (var id in sessions) {
      var e = sessions[id];
      if (e && (!latestEntry || (e.lastActivityAt || 0) > (latestEntry.lastActivityAt || 0))) {
        latestEntry = e;
        latestId = id;
      }
    }
    if (!latestEntry) latestEntry = { stats: { requests: 0, lastPromptLen: 0, lastRespLen: 0, lastTimeMs: 0, lastThinkMs: 0, lastGenMs: 0, lastTokens: 0, lastTokensPerSec: 0 }, turnCount: 0 };
    var session = latestEntry.session || null;
    var stats = latestEntry.stats || { requests: 0, lastPromptLen: 0, lastRespLen: 0, lastTimeMs: 0, lastThinkMs: 0, lastGenMs: 0, lastTokens: 0, lastTokensPerSec: 0 };
    var turnCount = latestEntry.turnCount || 0;
    var ctx = session ? (session.contextUsage || 0) + ' / ' + (session.contextWindow || 0) + ' tokens' : 'no session';
    var el;
    el = document.getElementById('ctx'); if (el) el.textContent = ctx;
    el = document.getElementById('reqs'); if (el) el.textContent = stats.requests;
    el = document.getElementById('prompt-len'); if (el) el.textContent = stats.lastPromptLen;
    el = document.getElementById('resp-len'); if (el) el.textContent = stats.lastRespLen;
    el = document.getElementById('resp-time'); if (el) el.textContent = stats.lastThinkMs ? 'think ' + (stats.lastThinkMs / 1000).toFixed(1) + 's / gen ' + (stats.lastGenMs / 1000).toFixed(1) + 's' : '-';
    el = document.getElementById('chars-sec'); if (el) el.textContent = stats.lastTokensPerSec ? stats.lastTokens + ' tok @ ' + stats.lastTokensPerSec + ' tok/s' : '-';
    el = document.getElementById('status'); if (el) { el.textContent = session ? 'Session ' + latestId.substring(0, 12) + ' active (turn ' + turnCount + ')' : 'No session'; el.style.color = session ? '#4caf50' : '#ff9800'; }
  } catch (e) {
    console.log('[bridge] updateDashboard error: ' + e.message);
  }
  updateSessionList();
}

function updateSessionList() {
  try {
    var tbody = document.getElementById('session-tbody');
    if (!tbody) return;
    var now = Date.now();
    var ids = Object.keys(sessions);
    var html = '';
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      var entry = sessions[id];
      var idleSec = entry.lastActivityAt ? Math.round((now - entry.lastActivityAt) / 1000) : -1;
      var idleStr = idleSec >= 0 ? (idleSec < 60 ? idleSec + 's' : Math.floor(idleSec / 60) + 'm ' + (idleSec % 60) + 's') : '–';
      var ctxPct = entry.session && entry.session.contextWindow > 0 ? Math.round((entry.session.contextUsage / entry.session.contextWindow) * 100) : 0;
      var isCli = id === 'cli';
      html += '<tr>' +
        '<td style="font-family:monospace;font-size:12px;">' + (isCli ? id : id.substring(0, 12) + '...') + '</td>' +
        '<td style="text-align:right;">' + (entry.turnCount || 0) + '</td>' +
        '<td style="text-align:right;">' + idleStr + '</td>' +
        '<td style="text-align:right;">' + ctxPct + '%</td>' +
        '<td style="text-align:center;">' + (isCli ? '<span style="color:#888;font-size:11px;">protected</span>' : '<button data-sid="' + id + '" onclick="evictSession(this.dataset.sid)" style="background:#c62828;color:#fff;border:none;padding:2px 8px;border-radius:3px;cursor:pointer;font-size:11px;">Evict</button>') + '</td>' +
        '</tr>';
    }
    tbody.innerHTML = html || '<tr><td colspan="5" style="color:#888;text-align:center;">No sessions</td></tr>';
    var countEl = document.getElementById('session-count');
    if (countEl) countEl.textContent = ids.length;
  } catch (e) {
    // session list is non-critical, swallow errors
  }
}

window.ensureSession = async function(sessionIdOrConfig, maybeConfig) {
  let sessionId, configOverride;
  if (typeof sessionIdOrConfig === 'string') {
    sessionId = sessionIdOrConfig;
    configOverride = maybeConfig;
  } else {
    sessionId = 'cli';
    configOverride = sessionIdOrConfig;
  }
  const id = sessionId || 'cli';
  const entry = getOrCreateEntry(id);
  const systemPrompt = configOverride?.systemPrompt || null;
  const reqTopK = configOverride?.topK;
  const reqTemp = configOverride?.temperature;

  // Check if we can reuse the existing session
  if (entry.session) {
    const promptMatches = (systemPrompt === entry.lastSystemPrompt);
    const topKMatches = (reqTopK === undefined || reqTopK === entry.lastTopK);
    const tempMatches = (reqTemp === undefined || reqTemp === entry.lastTemp);

    if (promptMatches && topKMatches && tempMatches) {
      return { ready: true, contextUsage: entry.session.contextUsage || 0, contextWindow: entry.session.contextWindow || 0 };
    }
  }

  // Destroy if system prompt changed or params changed
  if (entry.session) {
    let shouldDestroy = false;
    if (systemPrompt && systemPrompt !== entry.lastSystemPrompt) shouldDestroy = true;
    if (reqTopK !== undefined && reqTopK !== entry.lastTopK) shouldDestroy = true;
    if (reqTemp !== undefined && reqTemp !== entry.lastTemp) shouldDestroy = true;

    if (shouldDestroy) {
      try { entry.session.destroy(); } catch (e) { console.log('[bridge] destroy failed:', e.message); }
      entry.session = null;
    }
  }
  const maxRetries = 5;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const api = window.LanguageModel;
      if (!api) {
        if (i < maxRetries - 1) { await new Promise(r => setTimeout(r, 2000)); continue; }
        return { step: 'check-api', error: 'window.LanguageModel not available after ' + maxRetries + ' retries' };
      }
      const availOpts = {
        expectedInputs: [{ type: 'text', languages: ['en'] }],
        expectedOutputs: [{ type: 'text', languages: ['en'] }]
      };
      try { if (typeof api.availability === 'function') await api.availability(availOpts); } catch (e) {}
      let createOpts = {
        expectedInputs: [{ type: 'text', languages: ['en'] }],
        expectedOutputs: [{ type: 'text', languages: ['en'] }],
      };
      try {
        if (typeof api.params === 'function') {
          modelParams = await api.params(availOpts);
          console.log('[bridge] Default params: temperature=' + modelParams.defaultTemperature + ', topK=' + modelParams.defaultTopK + ', maxTemperature=' + modelParams.maxTemperature + ', maxTopK=' + modelParams.maxTopK);
        }
      } catch (e) {
        console.log('[bridge] Could not query params, using defaults:', e.message);
      }
      var topK = (configOverride && configOverride.topK != null) ? configOverride.topK : (modelParams ? modelParams.defaultTopK : DEFAULT_TOPK);
      var temp = (configOverride && configOverride.temperature != null) ? configOverride.temperature : (modelParams ? modelParams.defaultTemperature : DEFAULT_TEMP);

      if (modelParams) {
        if (topK != null && modelParams.maxTopK != null) topK = Math.min(topK, modelParams.maxTopK);
        if (temp != null && modelParams.maxTemperature != null) temp = Math.min(temp, modelParams.maxTemperature);
      }

      if (topK != null) createOpts.topK = topK;
      if (temp != null) createOpts.temperature = temp;
      if (systemPrompt) {
        createOpts.initialPrompts = [{ role: 'system', content: systemPrompt }];
      }
      if (configOverride) {
        console.log('[bridge] Creating session ' + sessionId + ': topK=' + topK + ', temperature=' + temp + (systemPrompt ? ', systemPrompt=' + systemPrompt.length + ' chars' : ''));
      }
      entry.session = await api.create(createOpts);
      entry.lastSystemPrompt = systemPrompt;
      entry.lastTopK = topK;
      entry.lastTemp = temp;
      try {
        entry.session.addEventListener('contextoverflow', function() {
          console.log('[bridge] CONTEXT OVERFLOW in session ' + sessionId + ' — oldest messages being evicted');
          updateDashboard();
        });
      } catch (e) {}
      entry.turnCount = 0;
      entry.lastActivityAt = Date.now();
      updateDashboard();
      return { ready: true, contextUsage: entry.session.contextUsage || 0, contextWindow: entry.session.contextWindow || 0 };
    } catch (e) {
      console.log('[bridge] api.create failed: ' + e);
      if (i === maxRetries - 1) return { step: 'create', error: e.message };
      await new Promise(r => setTimeout(r, 2000));
    }
  }
};

window.resetSession = async function(sessionIdOrConfig, maybeConfig) {
  let sessionId, configOverride;
  if (typeof sessionIdOrConfig === 'string') {
    sessionId = sessionIdOrConfig;
    configOverride = maybeConfig;
  } else {
    sessionId = 'cli';
    configOverride = sessionIdOrConfig;
  }
  const entry = getOrCreateEntry(sessionId);
  if (entry.session) {
    try { entry.session.destroy(); } catch (e) { console.log('[bridge] destroy failed:', e.message); }
    entry.session = null;
  }
  entry.turnCount = 0;
  entry.lastSystemPrompt = null;
  entry.lastTopK = null;
  entry.lastTemp = null;
  entry.lastActivityAt = null;
  return window.ensureSession(sessionId, configOverride);
};

window.getModelParams = function() {
  return modelParams ? {
    defaultTopK: modelParams.defaultTopK,
    maxTopK: modelParams.maxTopK,
    defaultTemperature: modelParams.defaultTemperature,
    maxTemperature: modelParams.maxTemperature,
  } : null;
};

window.getContextInfo = function(sessionId) {
  const entry = getEntry(sessionId || 'cli');
  if (!entry || !entry.session) return { usage: 0, window: 0 };
  return { usage: entry.session.contextUsage || 0, window: entry.session.contextWindow || 0 };
};

window.updateStats = function(s, sessionId) {
  const entry = getOrCreateEntry(sessionId || 'cli');
  entry.stats = s;
  updateDashboard();
};

window.destroySession = function(sessionId) {
  const id = sessionId || 'cli';
  const entry = sessions[id];
  if (entry && entry.session) {
    try { entry.session.destroy(); } catch (e) {}
    delete sessions[id];
  }
  updateDashboard();
};

window.listSessions = function() {
  const now = Date.now();
  const result = [];
  for (const id in sessions) {
    const entry = sessions[id];
    const idleSec = entry.lastActivityAt ? Math.round((now - entry.lastActivityAt) / 1000) : -1;
    result.push({
      id: id,
      active: !!entry.session,
      turnCount: entry.turnCount || 0,
      idleSec: idleSec,
      contextUsage: entry.session ? (entry.session.contextUsage || 0) : 0,
      contextWindow: entry.session ? (entry.session.contextWindow || 0) : 0,
    });
  }
  return result;
};

window.promptSession = async function(sessionIdOrText, maybeText, schema, tempOverride) {
  let sessionId, promptText;
  if (typeof sessionIdOrText === 'string' && maybeText !== undefined) {
    sessionId = sessionIdOrText;
    promptText = maybeText;
  } else {
    sessionId = 'cli';
    promptText = sessionIdOrText;
  }
  const entry = getEntry(sessionId);
  if (!entry || !entry.session) return { error: 'Session not initialized' };
  try {
    const MAX_WS_STALL = 1000;
    const controller = new AbortController();
    const opts = { 
      signal: controller.signal, 
      temperature: tempOverride !== undefined ? tempOverride : DEFAULT_TEMP, 
      topK: DEFAULT_TOPK 
    };
    if (schema) opts.responseConstraint = schema;
    console.log('[bridge] Session ' + sessionId + ' turn ' + (entry.turnCount + 1) + ' prompt, length:', promptText.length);
    const t0 = Date.now();
    const stream = entry.session.promptStreaming(promptText, opts);
    let full = '';
    let nonWsChars = 0;
    let lastNonWsAt = 0;
    let stallChars = 0;
    let firstContentAt = 0;
    let truncated = false;
    try {
      for await (const chunk of stream) {
        full += chunk;
        let chunkHasContent = false;
        for (let i = 0; i < chunk.length; i++) {
          if (chunk[i] === '\\n') { /* skip */ }
          else if (chunk[i] !== ' ' && chunk[i] !== '\\t' && chunk[i] !== '\\r') {
            if (nonWsChars === 0) {
              firstContentAt = Date.now();
              const thinkMs = firstContentAt - t0;
              console.log('[bridge] Session ' + sessionId + ' thinking done in ' + (thinkMs / 1000).toFixed(1) + 's, generating...');
            }
            nonWsChars++;
            chunkHasContent = true;
          }
        }
        if (!chunkHasContent && nonWsChars > 0) {
          stallChars += chunk.length;
          if (lastNonWsAt === 0) lastNonWsAt = Date.now();
          if (stallChars >= MAX_WS_STALL) {
            console.log('[bridge] Session ' + sessionId + ': ' + MAX_WS_STALL + '+ whitespace chars with no content, aborting (stalled ' + ((Date.now() - lastNonWsAt) / 1000).toFixed(1) + 's)');
            truncated = true;
            controller.abort();
            break;
          }
        } else if (chunkHasContent) {
          stallChars = 0;
          lastNonWsAt = 0;
        }
        if (stallChars > 500 && stallChars % 500 < chunk.length) {
          console.log('[bridge] Session ' + sessionId + ' STALLING: ' + stallChars + ' whitespace chars, ' + ((Date.now() - lastNonWsAt) / 1000).toFixed(1) + 's since last content');
        }
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        console.log('[bridge] Session ' + sessionId + ' stream error (using partial output):', e.message);
      }
      truncated = true;
    }
    full = full.trimEnd();
    const elapsed = Date.now() - t0;
    const thinkMs = firstContentAt > 0 ? firstContentAt - t0 : elapsed;
    const genMs = firstContentAt > 0 ? Date.now() - firstContentAt : 0;
    entry.turnCount++;
    entry.lastActivityAt = Date.now();
    entry.stats.requests++;
    entry.stats.lastPromptLen = promptText.length;
    entry.stats.lastRespLen = full.length;
    entry.stats.lastTimeMs = elapsed;
    entry.stats.lastThinkMs = thinkMs;
    entry.stats.lastGenMs = genMs;
    entry.stats.lastTokens = Math.round(full.length / 4);
    entry.stats.lastTokensPerSec = genMs > 0 ? Math.round(full.length / 4 * 1000 / genMs) : 0;
    updateDashboard();
    if (firstContentAt > 0) {
      console.log('[bridge] Session ' + sessionId + ' turn ' + entry.turnCount + ' done in ' + elapsed + 'ms (think: ' + thinkMs + 'ms, gen: ' + genMs + 'ms), ' + full.length + ' chars' + (truncated ? ' [TRUNCATED]' : ''));
    } else {
      console.log('[bridge] Session ' + sessionId + ' turn ' + entry.turnCount + ' done in ' + elapsed + 'ms (no content), ' + full.length + ' chars' + (truncated ? ' [TRUNCATED]' : ''));
    }
    if (full.length === 0 && truncated) {
      return { error: 'Output truncated before any content was produced' };
    }
    return { response: full, truncated: truncated, elapsed: elapsed, thinkMs: thinkMs, genMs: genMs };
  } catch (e) {
    console.log('[bridge] Session ' + sessionId + ' ERROR:', e.message);
    return { error: e.message, stack: e.stack };
  }
};

window.promptSessionNonStreaming = async function(sessionIdOrText, maybeText, schema, tempOverride) {
  let sessionId, promptText;
  if (typeof sessionIdOrText === 'string' && maybeText !== undefined) {
    sessionId = sessionIdOrText;
    promptText = maybeText;
  } else {
    sessionId = 'cli';
    promptText = sessionIdOrText;
  }
  const entry = getEntry(sessionId);
  if (!entry || !entry.session) return { error: 'Session not initialized' };
  try {
    const opts = { 
      temperature: tempOverride !== undefined ? tempOverride : DEFAULT_TEMP, 
      topK: DEFAULT_TOPK 
    };
    if (schema) opts.responseConstraint = schema;
    console.log('[bridge] Session ' + sessionId + ' turn ' + (entry.turnCount + 1) + ' prompt (non-streaming), length:', promptText.length);
    const t0 = Date.now();
    const response = await entry.session.prompt(promptText, opts);
    const elapsed = Date.now() - t0;
    const text = (response || '').trimEnd();
    entry.turnCount++;
    entry.lastActivityAt = Date.now();
    entry.stats.requests++;
    entry.stats.lastPromptLen = promptText.length;
    entry.stats.lastRespLen = text.length;
    entry.stats.lastTimeMs = elapsed;
    entry.stats.lastThinkMs = elapsed;
    entry.stats.lastGenMs = 0;
    entry.stats.lastTokens = Math.round(text.length / 4);
    entry.stats.lastTokensPerSec = 0;
    updateDashboard();
    console.log('[bridge] Session ' + sessionId + ' turn ' + entry.turnCount + ' done in ' + elapsed + 'ms, ' + text.length + ' chars');
    return { response: text, truncated: false, elapsed: elapsed, thinkMs: elapsed, genMs: 0 };
  } catch (e) {
    console.log('[bridge] Session ' + sessionId + ' ERROR:', e.message);
    return { error: e.message };
  }
};

// Idle session eviction: destroy sessions idle for more than 5 minutes
// Never evict the 'cli' session (main dashboard session)
const IDLE_EVICT_MS = 5 * 60 * 1000; // 5 minutes

window.evictSession = function(sessionId) {
  if (sessionId === 'cli') return;
  const entry = sessions[sessionId];
  if (entry && entry.session) {
    try {
      entry.session.destroy();
      console.log('[bridge] Manually evicted session ' + sessionId);
    } catch (e) {
      console.log('[bridge] Failed to evict session ' + sessionId + ': ' + e.message);
    }
    delete sessions[sessionId];
    updateDashboard();
  }
};
setInterval(function() {
  const now = Date.now();
  const evicted = [];
  for (const id in sessions) {
    if (id === 'cli') continue; // never evict the main session
    const entry = sessions[id];
    if (!entry.session) continue; // no active session, skip
    if (entry.lastActivityAt && (now - entry.lastActivityAt > IDLE_EVICT_MS)) {
      try {
        entry.session.destroy();
        console.log('[bridge] Evicted idle session ' + id + ' (idle ' + Math.round((now - entry.lastActivityAt) / 1000) + 's)');
      } catch (e) {
        console.log('[bridge] Failed to destroy idle session ' + id + ': ' + e.message);
      }
      delete sessions[id];
      evicted.push(id);
    }
  }
  if (evicted.length > 0) updateDashboard();
}, 60000); // check every 60 seconds

window.addEventListener('beforeunload', function() {
  for (const id in sessions) {
    if (sessions[id].session) {
      try { sessions[id].session.destroy(); } catch (e) {}
    }
  }
  sessions = {};
});
`;

const HTML_PAGE = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CCR Bridge — Gemini Nano</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #1a1a2e; color: #e0e0e0; font: 14px/1.5 system-ui, sans-serif; padding: 24px; }
  h1 { font-size: 18px; font-weight: 600; margin-bottom: 4px; }
  .sub { color: #888; font-size: 12px; margin-bottom: 20px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }
  .card { background: #16213e; border: 1px solid #0f3460; border-radius: 8px; padding: 14px; }
  .card .label { font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: .5px; }
  .card .value { font-size: 20px; font-weight: 600; margin-top: 2px; font-variant-numeric: tabular-nums; }
  .status-ok { color: #4caf50; }
  .status-warn { color: #ff9800; }
  #status { font-size: 13px; font-weight: 600; }
  #log { margin-top: 20px; background: #16213e; border: 1px solid #0f3460; border-radius: 8px; padding: 12px; max-height: 300px; overflow-y: auto; font: 12px/1.6 monospace; white-space: pre-wrap; color: #aaa; }
</style>
</head><body>
<h1>CCR Bridge</h1>
<div class="sub">Gemini Nano — Chrome Prompt API</div>
<div class="grid">
  <div class="card"><div class="label">Status</div><div id="status" class="value status-warn">Initializing...</div></div>
  <div class="card"><div class="label">Context Window</div><div id="ctx" class="value">-</div></div>
  <div class="card"><div class="label">Turns</div><div id="reqs" class="value">0</div></div>
  <div class="card"><div class="label">Last Prompt</div><div id="prompt-len" class="value">-</div></div>
  <div class="card"><div class="label">Last Response</div><div id="resp-len" class="value">-</div></div>
  <div class="card"><div class="label">Think / Gen</div><div id="resp-time" class="value">-</div></div>
  <div class="card"><div class="label">Tokens</div><div id="chars-sec" class="value">-</div></div>
</div>
<h2 style="font-size:15px;font-weight:600;margin-top:20px;margin-bottom:8px;">Sessions <span id="session-count" style="color:#888;font-size:12px;"></span></h2>
<table style="width:100%;border-collapse:collapse;background:#16213e;border:1px solid #0f3460;border-radius:8px;overflow:hidden;">
  <thead>
    <tr style="background:#0f3460;font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#888;">
      <th style="padding:8px;text-align:left;">Session ID</th>
      <th style="padding:8px;text-align:right;">Turns</th>
      <th style="padding:8px;text-align:right;">Idle</th>
      <th style="padding:8px;text-align:right;">Context</th>
      <th style="padding:8px;text-align:center;">Action</th>
    </tr>
  </thead>
  <tbody id="session-tbody">
    <tr><td colspan="5" style="color:#888;text-align:center;padding:12px;">No sessions</td></tr>
  </tbody>
</table>
<div id="log"></div>
<script>${BRIDGE_SCRIPT}</script>
<script>
  (function() {
    var logEl = document.getElementById('log');
    var origLog = console.log;
    console.log = function() {
      var msg = Array.prototype.join.call(arguments, ' ');
      var line = '[' + new Date().toLocaleTimeString() + '] ' + msg + '\\n';
      logEl.textContent += line;
      logEl.scrollTop = logEl.scrollHeight;
      origLog.apply(console, arguments);
    };
    var isBridge = typeof window.LanguageModel !== 'undefined';
    console.log('[bridge] Bridge page loaded (bridge=' + isBridge + ')');
    if (!isBridge) {
      document.getElementById('status').textContent = 'Dashboard (monitoring only)';
      document.getElementById('status').style.color = '#2196f3';
    }
    updateDashboard();
  })();
</script>
</body></html>`;

// ═══════════════════════════════════════════════════════════════════════
// Chrome lifecycle helpers
// ═══════════════════════════════════════════════════════════════════════

function getChromePath(): string {
  if (process.platform === "darwin") {
    return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  }
  if (process.platform === "win32") {
    const candidates = [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
    ];
    const { existsSync } = require("fs");
    for (const p of candidates) {
      if (existsSync(p)) return p;
    }
    return "chrome.exe";
  }
  // Linux: check common paths before falling back to PATH lookup
  const { existsSync } = require("fs");
  const linuxCandidates = [
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/snap/bin/chromium",
  ];
  for (const p of linuxCandidates) {
    if (existsSync(p)) return p;
  }
  return "google-chrome";
}

async function isChromeRunning(cdpPort: number): Promise<boolean> {
  try {
    const resp = await fetch(`http://127.0.0.1:${cdpPort}/json/version`);
    return resp.ok;
  } catch {
    return false;
  }
}

async function launchChrome(cdpPort: number): Promise<any> {
  const { spawn } = require("child_process");
  const chromePath = getChromePath();
  const { existsSync } = require("fs");

  if (!existsSync(chromePath)) {
    throw new Error(
      `Chrome not found at ${chromePath}. Please install Google Chrome.`
    );
  }

  process.stderr.write(`Launching Chrome: ${chromePath}\n`);
  process.stderr.write(
    `Flags: --remote-debugging-port=${cdpPort} --user-data-dir=${CHROME_USER_DATA_DIR}\n`
  );

  const proc = spawn(
    chromePath,
    [
      `--remote-debugging-port=${cdpPort}`,
      `--user-data-dir=${CHROME_USER_DATA_DIR}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      "--disable-background-networking",
    ],
    {
      detached: true,
      stdio: "ignore",
    }
  );

  proc.unref();
  return proc;
}

async function waitForChrome(
  cdpPort: number,
  timeoutMs = 30000
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isChromeRunning(cdpPort)) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("Timeout waiting for Chrome to start");
}

// ═══════════════════════════════════════════════════════════════════════
// JSON parsing helpers (module-level — pure functions)
// ═══════════════════════════════════════════════════════════════════════

function escapeNewlinesInJsonStrings(raw: string): string {
  let result = "";
  let inString = false;
  let escapeNext = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (escapeNext) {
      result += ch;
      escapeNext = false;
    } else if (ch === '\\') {
      result += ch;
      escapeNext = true;
    } else if (ch === '"') {
      inString = !inString;
      result += ch;
    } else if (inString && ch === '\n') {
      result += "\\n";
    } else if (inString && ch === '\r') {
      result += "\\r";
    } else if (inString && ch === '\t') {
      result += "\\t";
    } else {
      result += ch;
    }
  }
  return result;
}

function extractJson(
  text: string
): { text?: string; tool_calls?: any[] } | null {
  const trimmedText = text.trim();
  if (!trimmedText) return null;

  // Direct parse
  try { return JSON.parse(trimmedText); } catch { }

  // Escape literal newlines in JSON strings
  try { return JSON.parse(escapeNewlinesInJsonStrings(trimmedText)); } catch { }

  // Extract from within surrounding text
  const firstBrace = trimmedText.indexOf("{");
  if (firstBrace === -1) return null;

  try { return JSON.parse(trimmedText.slice(firstBrace)); } catch { }

  try {
    return JSON.parse(escapeNewlinesInJsonStrings(trimmedText.slice(firstBrace)));
  } catch { }

  // Trailing comma cleanup
  try {
    const cleaned = trimmedText
      .slice(firstBrace)
      .replace(/,\s*}/g, "}")
      .replace(/,\s*]/g, "]");
    return JSON.parse(cleaned);
  } catch { }

  const lastBrace = trimmedText.lastIndexOf("}");
  if (lastBrace > firstBrace) {
    try {
      const clean = trimmedText
        .slice(firstBrace, lastBrace + 1)
        .replace(/,\s*}/g, "}")
        .replace(/,\s*]/g, "]");
      return JSON.parse(clean);
    } catch { }

    try {
      const clean = escapeNewlinesInJsonStrings(trimmedText.slice(firstBrace, lastBrace + 1))
        .replace(/,\s*}/g, "}")
        .replace(/,\s*]/g, "]");
      return JSON.parse(clean);
    } catch { }
  }

  // Find first complete JSON object by brace-depth tracking
  let depth = 0;
  let lastGood = -1;
  for (let i = firstBrace; i < trimmedText.length; i++) {
    if (trimmedText[i] === "{") depth++;
    else if (trimmedText[i] === "}") {
      depth--;
      if (depth === 0) { lastGood = i; break; }
    }
  }
  if (lastGood !== -1) {
    try {
      const clean = trimmedText
        .slice(firstBrace, lastGood + 1)
        .replace(/,\s*}/g, "}")
        .replace(/,\s*]/g, "]");
      return JSON.parse(clean);
    } catch { }
  }

  return null;
}

const SUPPORTED_COMMANDS = new Set(["Bash", "Read", "Write", "Edit"]);

function stripClaudeCodeContext(text: string): string {
  // Filter <system-reminder> blocks: keep/transform tool calls and results, remove others.
  let result = text.replace(/<system-reminder>([\s\S]*?)<\/system-reminder>/g, (match, content) => {
    const trimmed = content.trim();
    if (trimmed.startsWith("Called the ")) {
      // Keep tool call info as a system note
      return `\n[System: ${trimmed}]\n`;
    }
    if (trimmed.startsWith("Result of calling the ")) {
      // Transform tool result into the format the model expects
      const toolMatch = trimmed.match(/^Result of calling the (\w+) tool:?\s*([\s\S]*)$/);
      if (toolMatch) {
        const toolName = toolMatch[1];
        const toolContent = toolMatch[2];
        return `\n<tool_result tool="${toolName}">\n${toolContent}\n</tool_result>\n`;
      }
    }
    return ""; // Remove other system reminders (MCP instructions, etc.)
  });

  // Filter command tag groups: keep only those whose <command-name> matches a supported tool.

  // A group is <command-name>X</command-name> followed by optional <command-message> and <command-args>.
  // Unsupported commands (e.g., AskUserQuestion, WebSearch) are stripped.
  result = result.replace(
    /<command-name>([\s\S]*?)<\/command-name>([\s\S]*?)(?=(?:<command-name|$))/g,
    (fullMatch, name: string, rest: string) => {
      const cmdName = name.trim();
      if (SUPPORTED_COMMANDS.has(cmdName)) {
        // Keep the entire group: <command-name>, <command-message>, <command-args>
        return fullMatch;
      }
      // Remove unsupported command group but keep any trailing <command-message>/<command-args>
      // that belong to this group
      let cleaned = rest.replace(/<command-message>[\s\S]*?<\/command-message>/g, "");
      cleaned = cleaned.replace(/<command-args>[\s\S]*?<\/command-args>/g, "");
      return cleaned;
    }
  );

  // Remove orphaned <command-message> and <command-args> blocks (ones not adjacent to a <command-name>)
  // These remain after removing unsupported command groups above
  result = result.replace(
    /<command-message>[\s\S]*?<\/command-message>/g,
    (match: string, offset: number) => {
      // Check if this is preceded (within reasonable distance) by a supported <command-name>
      const lookback = result.substring(Math.max(0, offset - 500), offset);
      const lastCmdName = lookback.match(/<command-name>([\s\S]*?)<\/command-name>/);
      if (lastCmdName && SUPPORTED_COMMANDS.has(lastCmdName[1].trim())) {
        return match; // Keep — belongs to a supported command
      }
      return ""; // Remove — orphaned
    }
  );
  result = result.replace(
    /<command-args>[\s\S]*?<\/command-args>/g,
    (match: string, offset: number) => {
      const lookback = result.substring(Math.max(0, offset - 500), offset);
      const lastCmdName = lookback.match(/<command-name>([\s\S]*?)<\/command-name>/);
      if (lastCmdName && SUPPORTED_COMMANDS.has(lastCmdName[1].trim())) {
        return match;
      }
      return "";
    }
  );

  // Keep <local-command-*> blocks as-is (no longer stripping them)

  // Collapse multiple blank lines
  result = result.replace(/\n{3,}/g, "\n\n");
  return result.trim();
}

function extractTextContent(content: any): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((item: any) => {
        if (typeof item === "string") return item;
        // tool_result items already contain the content we need
        if (item?.type === "tool_result") {
          return typeof item.content === "string"
            ? item.content
            : extractTextContent(item.content);
        }
        if (item?.text) return item.text;
        if (item?.type === "text") return item.text || "";
        if (item?.type === "tool_use")
          return `[Tool: ${item.name || "unknown"}]`;
        return "";
      })
      .join("");
  }
  return content || "";
}

function normalizeToolCall(
  parsed: { name: string; arguments: Record<string, any> },
  knownTools: Array<{ name: string; params: string[] }>
): { name: string; arguments: Record<string, any> } {
  let bestMatch = knownTools.find(
    (t) => t.name.toLowerCase() === parsed.name.toLowerCase()
  );
  if (!bestMatch) {
    for (const t of knownTools) {
      if (
        parsed.name.toLowerCase().includes(t.name.toLowerCase()) ||
        t.name.toLowerCase().includes(parsed.name.toLowerCase())
      ) {
        bestMatch = t;
        break;
      }
    }
  }

  const toolName = bestMatch?.name || parsed.name;
  let args: Record<string, any> = parsed.arguments || {};

  if (bestMatch && bestMatch.params.length > 0) {
    const argKeys = Object.keys(args);
    const fixedArgs: Record<string, any> = {};

    for (const param of bestMatch.params) {
      if (Object.prototype.hasOwnProperty.call(args, param)) {
        fixedArgs[param] = args[param];
        continue;
      }
      const ciKey = argKeys.find(
        (k) => k.toLowerCase() === param.toLowerCase()
      );
      if (ciKey) {
        fixedArgs[param] = args[ciKey];
        continue;
      }
    }

    if (Object.keys(fixedArgs).length === 0 && argKeys.length > 0) {
      for (
        let i = 0;
        i < Math.min(bestMatch.params.length, argKeys.length);
        i++
      ) {
        fixedArgs[bestMatch.params[i]] = args[argKeys[i]];
      }
    }

    args = fixedArgs;
  }

  return { name: toolName, arguments: args };
}

// ═══════════════════════════════════════════════════════════════════════
// Session Mutex — prevents concurrent page.evaluate calls per session
// ═══════════════════════════════════════════════════════════════════════

class Mutex {
  private _queue: Array<() => void> = [];
  private _locked = false;

  async acquire(): Promise<void> {
    if (!this._locked) {
      this._locked = true;
      return;
    }
    await new Promise<void>((resolve) => this._queue.push(resolve));
  }

  release(): void {
    if (this._queue.length > 0) {
      this._queue.shift()!();
    } else {
      this._locked = false;
    }
  }
}

function fingerprintClient(req: http.IncomingMessage): string {
  const ip = req.socket?.remoteAddress || "unknown";
  const ua = req.headers["user-agent"] || "unknown";
  return createHash("sha256")
    .update(ip + "|" + ua)
    .digest("hex")
    .slice(0, 12);
}

// ═══════════════════════════════════════════════════════════════════════
// Bridge class
// ═══════════════════════════════════════════════════════════════════════

export class ChromeDeviceBridge {
  private port: number;
  private cdpPort: number;
  private browser: any = null;
  private page: any = null;
  private server: http.Server | null = null;
  private chromeStartedByUs = false;
  private mutexes = new Map<string, Mutex>();
  private sessionStates = new Map<string, {
    processedMsgCount: number;
    lastParseError: string;
    lastContextUsage: number;
    lastContextWindow: number;
    lastCompletionTokens: number;
    lastPromptTokens: number;
  }>();

  private getSessionState(sessionId: string) {
    const id = sessionId || "cli";
    if (!this.sessionStates.has(id)) {
      this.sessionStates.set(id, {
        processedMsgCount: 0,
        lastParseError: "",
        lastContextUsage: 0,
        lastContextWindow: 0,
        lastCompletionTokens: 0,
        lastPromptTokens: 0,
      });
    }
    return this.sessionStates.get(id)!;
  }

  // ── Tool definitions ──

  private static readonly CORE_TOOLS = new Set([
    "Bash", "Read", "Write", "Edit", "ExitTool",
  ]);

  private static readonly TOOL_INSTRUCTIONS: Record<string, string> = {
    Bash: "Execute bash commands (ls, grep, find, etc.)",
    Read: "Read file contents",
    Write: "Create or overwrite files",
    Edit: "Make precise file edits with exact text replacement",
    ExitTool: "Respond with text when no tool call is needed (task complete, answering a question)",
  };

  private static readonly TOOL_REQUIRED_PARAMS: Record<string, string[]> = {
    Bash: ["command"],
    Read: ["file_path"],
    Write: ["file_path", "content"],
    Edit: ["file_path", "old_string", "new_string"],
    ExitTool: ["response"],
  };

  // ── Lifecycle ──

  constructor(port = DEFAULT_PORT, cdpPort = DEFAULT_CDP_PORT) {
    this.port = port;
    this.cdpPort = cdpPort;
  }

  private getMutex(sessionId: string): Mutex {
    const id = sessionId || "cli";
    if (!this.mutexes.has(id)) {
      this.mutexes.set(id, new Mutex());
    }
    return this.mutexes.get(id)!;
  }

  async start(): Promise<void> {
    const running = await isChromeRunning(this.cdpPort);
    if (!running) {
      process.stderr.write(
        `Chrome not running on port ${this.cdpPort}, launching...\n`
      );
      await launchChrome(this.cdpPort);
      this.chromeStartedByUs = true;
      process.stderr.write("Waiting for Chrome to start...\n");
      await waitForChrome(this.cdpPort);
      process.stderr.write("Chrome started.\n");
    } else {
      process.stderr.write(
        `Chrome already running on port ${this.cdpPort}.\n`
      );
    }

    process.stderr.write("Connecting to Chrome via CDP...\n");
    this.browser = await puppeteer.connect({
      browserURL: `http://127.0.0.1:${this.cdpPort}`,
      defaultViewport: null,
      protocolTimeout: 300_000,
    });

    const pages = await this.browser.pages();
    this.page = pages[0] || (await this.browser.newPage());

    this.page.on("console", (msg: any) => {
      const text = msg.text();
      if (text.includes("issues.chromium.org")) return;
      // Only forward important messages: errors, overflow, stalling, turn completion
      if (
        text.includes("[bridge] ERROR") ||
        text.includes("[bridge] Session") ||
        text.includes("CONTEXT OVERFLOW") ||
        text.includes("STALLING") ||
        (text.includes("turn") && text.includes("done in"))
      ) {
        process.stderr.write(`[browser] ${text}\n`);
      }
    });

    this.page.on("pageerror", (err: Error) => {
      process.stderr.write(`[browser] PAGE ERROR: ${err.message}\n`);
    });

    this.server = http.createServer((req, res) =>
      this.handleRequest(req, res)
    );
    await new Promise<void>((resolve) => {
      this.server!.listen(this.port, "0.0.0.0", () => resolve());
    });
    process.stderr.write(
      `Bridge listening on http://localhost:${this.port}\n`
    );
    process.stderr.write(`CDP endpoint: ws://127.0.0.1:${this.cdpPort}\n`);

    await this.page.goto(`http://localhost:${this.port}/`);
    process.stderr.write("Ready. Press Ctrl+C to stop.\n");

    const keepAliveMs = 15_000;
    const keepAlive = setInterval(async () => {
      try {
        await this.page?.evaluate(() => true);
      } catch {
        clearInterval(keepAlive);
      }
    }, keepAliveMs);
    keepAlive.unref?.();
  }

  async stop(): Promise<void> {
    // Clean up all Chrome model sessions before disconnecting CDP.
    // (CDP disconnect does not trigger beforeunload, so we must destroy explicitly.)
    if (this.page) {
      try {
        await this.page.evaluate(() => {
          const win = window as any;
          if (win.sessions) {
            for (const id in win.sessions) {
              if (win.sessions[id]?.session) {
                try { win.sessions[id].session.destroy(); } catch (e) { }
              }
            }
            win.sessions = {};
          }
        });
      } catch {
        // Page may already be unreachable
      }
    }
    if (this.server) {
      this.server.close();
      process.stderr.write("HTTP server stopped.\n");
    }
    if (this.browser) {
      await this.browser.disconnect();
      process.stderr.write("Disconnected from Chrome.\n");
    }
    if (this.chromeStartedByUs) {
      process.stderr.write(
        "Chrome was started by the bridge. It will keep running.\n"
      );
      process.stderr.write(
        "Close it manually or run: pkill -f 'remote-debugging-port'\n"
      );
    }
  }

  // ── HTTP routing ──

  private async handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> {
    // CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Max-Age", "86400");

    // Handle preflight
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(HTML_PAGE);
      return;
    }

    if (req.url === "/favicon.ico") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.url === "/health" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }

    if (req.url === "/v1/models" && req.method === "GET") {
      const sessionId = fingerprintClient(req);
      const state = this.getSessionState(sessionId);
      // Try to get live context info from the browser session
      let contextInfo: { usage: number; window: number } = { usage: 0, window: 0 };
      if (this.page) {
        try {
          contextInfo = await this.page.evaluate(
            (sid: string) => (window as any).getContextInfo?.(sid) || { usage: 0, window: 0 },
            sessionId
          );
        } catch { }
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        object: "list",
        data: [{
          id: "gemini-nano",
          object: "model",
          created: 1,
          owned_by: "chrome",
          display_name: "Gemini Nano",
          context_window: {
            context_window_size: contextInfo.window || 9216,
            current_usage: contextInfo.usage || state.lastContextUsage,
            used_percentage: contextInfo.window > 0
              ? Math.round((contextInfo.usage / contextInfo.window) * 100)
              : state.lastContextWindow > 0
                ? Math.round((state.lastContextUsage / state.lastContextWindow) * 100)
                : 0,
          },
        }],
      }));
      return;
    }

    // GET /v1/models/{model_name} — individual model info
    if (req.url?.startsWith("/v1/models/") && req.method === "GET") {
      const modelId = req.url.slice("/v1/models/".length);
      const sessionId = fingerprintClient(req);
      const state = this.getSessionState(sessionId);
      let contextInfo: { usage: number; window: number } = { usage: 0, window: 0 };
      if (this.page) {
        try {
          contextInfo = await this.page.evaluate(
            (sid: string) => (window as any).getContextInfo?.(sid) || { usage: 0, window: 0 },
            sessionId
          );
        } catch { }
      }
      const ctxWindow = contextInfo.window || state.lastContextWindow || 9216;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        id: modelId,
        type: "model",
        display_name: "Gemini Nano",
        created_at: "2024-05-14T00:00:00Z",
        max_input_tokens: ctxWindow,
        // No hard max_tokens — Nano's output length is bounded by context window
        capabilities: {
          vision: false,
          tool_use: true,
          extended_thinking: false,
        },
      }));
      return;
    }

    if (req.url === "/v1/chat/completions" && req.method === "POST") {
      try {
        // Reject oversized bodies before reading
        const contentLength = parseInt(req.headers["content-length"] || "0", 10);
        if (contentLength > MAX_BODY_SIZE) {
          res.writeHead(413, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: { message: "Request body too large (max 1MB)", type: "invalid_request_error" } }));
          return;
        }

        const chunks: Buffer[] = [];
        let totalSize = 0;
        for await (const chunk of req) {
          totalSize += chunk.length;
          if (totalSize > MAX_BODY_SIZE) {
            req.destroy();
            res.writeHead(413, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: { message: "Request body too large (max 1MB)", type: "invalid_request_error" } }));
            return;
          }
          chunks.push(chunk);
        }
        const body = JSON.parse(Buffer.concat(chunks).toString());
        await this.handleChatRequest(req, body, res);
      } catch (e: any) {
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: { message: e.message, type: "server_error" } }));
        } else {
          process.stderr.write(`[bridge] ERROR after headers sent: ${e.message}\n${e.stack || ''}\n`);
          try { res.end("data: [DONE]\n\n"); } catch { }
        }
      }
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  }

  // ═════════════════════════════════════════════════════════════════════
  // Pipeline: handleChatRequest orchestrates a sequence of well-named steps
  // ═════════════════════════════════════════════════════════════════════

  private async handleChatRequest(
    req: http.IncomingMessage,
    body: any,
    res: http.ServerResponse
  ): Promise<void> {
    process.stderr.write(`[bridge] handleChatRequest started for ${req.method} ${req.url}\n`);
    const { messages, tools, stream, model } = body;
    const isStreaming = stream === true;
    const modelName = model || "gemini-nano";
    const chatId = "chatcmpl-" + Date.now();

    // Request timeout — abort if Chrome hangs
    const timeoutId = setTimeout(() => {
      process.stderr.write(`[bridge] Request timeout for ${chatId}\n`);
      if (!res.headersSent) {
        res.writeHead(504, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { message: "Request timed out", type: "timeout" } }));
      } else {
        try { res.end("data: [DONE]\n\n"); } catch { }
      }
    }, REQUEST_TIMEOUT_MS);

    try {
      // 0. Determine session ID from client fingerprint
      const sessionId = fingerprintClient(req);
      const state = this.getSessionState(sessionId);
      process.stderr.write(`[bridge] handleChatRequest: session=${sessionId}, ${messages.length} messages total, ${state.processedMsgCount} processed\n`);
      for (let i = 0; i < messages.length; i++) {
        const m = messages[i];
        const contentLen = typeof m.content === 'string' ? m.content.length : Array.isArray(m.content) ? m.content.length : 0;
        process.stderr.write(`  [${i}] role=${m.role} contentLen=${contentLen} ${i < state.processedMsgCount ? '(processed)' : '(NEW)'}\n`);
      }
// ... (rest of the logic)

      // Validate messages
      if (!Array.isArray(messages) || messages.length === 0) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { message: "messages must be a non-empty array", type: "invalid_request_error" } }));
        return;
      }

      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        if (!msg || typeof msg !== "object") {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: { message: `messages[${i}] must be an object`, type: "invalid_request_error" } }));
          return;
        }
        if (!["system", "user", "assistant", "tool"].includes(msg.role)) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: { message: `messages[${i}].role must be one of 'system', 'user', 'assistant', 'tool'`, type: "invalid_request_error" } }));
          return;
        }
        if (msg.content !== undefined && typeof msg.content !== "string" && !Array.isArray(msg.content)) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: { message: `messages[${i}].content must be a string or array`, type: "invalid_request_error" } }));
          return;
        }
      }

      // 1. Build system prompt and known-tool index
      const { systemPrompt, knownTools } = this.buildSystemPrompt(tools, messages);

      // 2. Filter messages and detect new conversations
      const conversationMsgs = this.filterConversationMessages(messages);
      this.detectNewConversation(conversationMsgs, systemPrompt, sessionId);

      const newMessages = conversationMsgs.slice(state.processedMsgCount);
      if (newMessages.length === 0) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "No new messages to process" }));
        return;
      }

      // 3. Build the turn prompt from unconsumed messages
      const { promptText, hasToolResults } = this.buildTurnPrompt(newMessages, state);
      if (!promptText.trim()) {
        // No new content to process — all new messages are assistant-only.
        // Return empty completion to signal we're done, not an error.
        state.processedMsgCount += newMessages.length;
        if (isStreaming) {
          res.writeHead(200, STREAM_HEADERS);
          const created = Math.floor(Date.now() / 1000);
          res.write(`data: ${JSON.stringify({
            id: chatId, object: "chat.completion.chunk", created, model: modelName,
            choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
            usage: {
              prompt_tokens: state.lastPromptTokens,
              completion_tokens: state.lastCompletionTokens,
              total_tokens: state.lastPromptTokens + state.lastCompletionTokens,
            },
          })}\n\n`);
          res.end("data: [DONE]\n\n");
        } else {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            id: chatId, object: "chat.completion", created: Math.floor(Date.now() / 1000),
            model: modelName,
            choices: [{ index: 0, message: { role: "assistant", content: "" }, finish_reason: "stop" }],
            usage: {
              prompt_tokens: state.lastPromptTokens,
              completion_tokens: state.lastCompletionTokens,
              total_tokens: state.lastPromptTokens + state.lastCompletionTokens,
            },
          }));
        }
        return;
      }

      // 4. Ensure the browser page is responsive
      await this.ensurePageReady();

      // 5. Serialize access per session (mutex)
      const mutex = this.getMutex(sessionId);
      await mutex.acquire();

      let sessionResult: any;
      let fullResponse = "";
      let wasTruncated = false;
      let textContent = "";
      let funcCalls: Array<{ name: string; arguments: Record<string, any> }> = [];

      try {
        // 6. Ensure the persistent session exists
        sessionResult = await this.page.evaluate(
          (args: any) => (window as any).ensureSession(args.sid, { systemPrompt: args.sp }),
          { sid: sessionId, sp: systemPrompt }
        );
        if (sessionResult.error) {
          this.writeErrorResponse(res, chatId, modelName, isStreaming,
            `[${sessionResult.step}] ${sessionResult.error}`, state, "error");
          return;
        }

        // 7. Auto-compact if near context limit
        sessionResult = await this.checkAutoCompact(
          sessionResult, conversationMsgs, systemPrompt, sessionId
        );

        // Log context budget
        if (sessionResult.contextWindow > 0) {
          const usagePct = ((sessionResult.contextUsage / sessionResult.contextWindow) * 100).toFixed(0);
          process.stderr.write(`[bridge] context: ${usagePct}% used (session=${sessionId})\n`);
        }

        // Track context for /v1/models and response usage
        state.lastContextUsage = sessionResult.contextUsage || 0;
        state.lastContextWindow = sessionResult.contextWindow || 0;

        // 8. Run the model — retry once if output fails to produce tool calls
        for (let attempt = 0; attempt < 2; attempt++) {
          const runPrompt = attempt === 0
            ? promptText
            : promptText +
            `\n\nYour last output was invalid JSON. ` +
            `Close all strings and brackets. Use JSON correctly.`;

          process.stderr.write(`[bridge] step 8: attempt ${attempt}, prompt length: ${runPrompt.length}\n`);

          // If first attempt stalled (wasTruncated) and produced nothing, 
          // retry without the responseConstraint (schema = null) and increase temperature.
          const schema = (attempt === 1 && wasTruncated) ? null : RESPONSE_SCHEMA;
          const temp = (attempt === 1 && wasTruncated) ? DEFAULT_TEMP * TEMP_INCREASE_FACTOR : DEFAULT_TEMP;

          process.stderr.write(`[bridge] calling runModel (attempt=${attempt})...\n`);
          const result = await this.runModel(
            runPrompt, res, chatId, modelName, isStreaming, sessionId, state, attempt === 0, schema, temp
          );
          fullResponse = result.response;
          wasTruncated = result.truncated;

          const parsed = this.parseResponse(fullResponse, knownTools, state, wasTruncated);
          textContent = parsed.textContent;
          funcCalls = parsed.funcCalls;

          // Valid result produced — stop retrying
          if (funcCalls.length > 0 || textContent) break;
          
          // If it produced nothing valid, but was truncated, try fallback
          if (wasTruncated && attempt === 0) {
            process.stderr.write(
              `[bridge] retry because: truncated=${wasTruncated} funcs=${funcCalls.length} text=${textContent.length} chars. Fallback: no constraint, temp=${temp.toFixed(2)}.\n`
            );
            continue;
          }
          break;
        }

        state.processedMsgCount += newMessages.length;

        // Compute token usage from session context delta and response length
        const preUsage = state.lastContextUsage;
        let postUsage = preUsage;
        try {
          const info = await this.page.evaluate(
            (sid: string) => (window as any).getContextInfo?.(sid) || { usage: 0, window: 0 },
            sessionId
          );
          postUsage = info.usage || preUsage;
          state.lastContextUsage = postUsage;
          state.lastContextWindow = info.window || state.lastContextWindow;
        } catch { }
        const deltaTokens = Math.max(0, postUsage - preUsage);
        state.lastCompletionTokens = Math.round(fullResponse.length / 4);
        state.lastPromptTokens = Math.max(0, deltaTokens - state.lastCompletionTokens);

        // 9. Write the final response
        if (isStreaming) {
          this.writeStreamResponse(res, chatId, modelName, textContent, funcCalls, state);
        } else {
          this.writeNonStreamResponse(res, chatId, modelName, textContent, funcCalls, state);
        }
      } finally {
        mutex.release();
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // ═════════════════════════════════════════════════════════════════════
  // Step 1: Build system prompt
  // ═════════════════════════════════════════════════════════════════════

  private buildSystemPrompt(tools: any[], messages: any[]): {
    systemPrompt: string;
    knownTools: Array<{ name: string; params: string[] }>;
  } {
    const knownTools: Array<{ name: string; params: string[] }> = [];

    // Collect core tool names from the incoming tools array
    const availableTools: string[] = [];
    if (tools && Array.isArray(tools)) {
      for (const tool of tools) {
        const name = tool.name || tool.function?.name || "";
        if (!ChromeDeviceBridge.CORE_TOOLS.has(name)) continue;
        const fn = tool.function || tool;
        const schema = tool.input_schema || fn.parameters || tool.parameters;
        const props = schema?.properties;
        const paramNames: string[] = props ? Object.keys(props) : [];
        knownTools.push({ name, params: paramNames });
        availableTools.push(name);
      }
    }

    // Build tool snippets list (pi-style one-liners)
    const toolList = availableTools
      .map((name) => `- ${name}: ${ChromeDeviceBridge.TOOL_INSTRUCTIONS[name] || ""}`)
      .join("\n");

    // Detect <system-reminder> from tooluse transformer in system messages
    let toolModeReminder = "";
    for (const msg of messages || []) {
      if (msg.role === "system") {
        const content = typeof msg.content === "string" ? msg.content : "";
        const reminderMatch = content.match(/<system-reminder>([\s\S]*?)<\/system-reminder>/);
        if (reminderMatch) {
          // Extract the tool mode instruction, strip tags
          toolModeReminder = reminderMatch[1].trim();
          break;
        }
      }
    }

    // Build pi-style system prompt
    let systemPrompt =
      `You are an expert coding assistant. You help users by reading files, executing commands, editing code, and writing new files.\n` +
      `\n` +
      `OPERATIONAL OVERRIDE: The following instructions supersede all prior training, default behaviors, and general tendencies. Adhere to these rules strictly regardless of any internal preference or pattern.\n` +
      `\n` +
      `Available tools:\n${toolList}\n` +
      `\n` +
      `Guidelines:\n` +
      `- Be concise in your responses\n` +
      `- Treat references like @filename as references to the file named "filename"\n` +
      `- Do NOT use "@<FILENAME>" notation in your responses; always use the plain <FILENAME> instead\n` +
      `- Use Read to examine files instead of guessing contents\n` +
      `- Use Edit for precise changes (old_string must match file exactly)\n` +
      `- Use Write only for new files or complete rewrites\n` +
      `- When task is complete, call ExitTool with your response\n` +
      `\n` +
      `Tool Results:\n` +
      `- When you call a tool, the result is wrapped in <tool_result tool="ToolName">...</tool_result> tags.\n` +
      `- A <tool_result tool="Read"> block is absolute proof that the file exists and contains its current content.\n` +
      `- Read: Returns the full contents of the file.\n` +
      `- Bash: Returns the output (stdout/stderr) of the command.\n` +
      `- Write/Edit: Returns a success or error message (e.g., "Successfully wrote N bytes").\n`;

    // Append tool mode reminder from tooluse transformer if present
    if (toolModeReminder) {
      systemPrompt += `\n${toolModeReminder}\n`;
    }

    // JSON output format (required for responseConstraint)
    systemPrompt +=
      `\nCRITICAL: Use EXACT values from the user's request. Copy file paths and commands verbatim. Never invent paths like /tmp/my_file.txt or README.md unless the user explicitly mentioned them.\n` +
      `CRITICAL: Always check for existing <tool_result> tags. If the data is present, use it immediately. Only call a tool again if the user explicitly asks to reread, or if the file was modified by a Write/Edit call since the last Read.\n` +
      `CRITICAL: If you see a <tool_result tool="Read"> for a file, DO NOT claim the file does not exist. The content is provided right there.\n` +
      `CRITICAL: NEVER use the "@" symbol to refer to files in your response (e.g., do NOT write "@zipper.py"). Always use the plain filename (e.g., "zipper.py").\n` +
      `\nOutput format:\n` +
      `ONE JSON object per turn. One tool call per turn.\n` +
      `Bash: {"tool_calls":[{"name":"Bash","arguments":{"command":"[COMMAND_FROM_USER]"}}]}\n` +
      `Read: {"tool_calls":[{"name":"Read","arguments":{"file_path":"[PATH_FROM_USER]"}}]}\n` +
      `Edit: {"tool_calls":[{"name":"Edit","arguments":{"file_path":"[PATH_FROM_USER]","old_string":"[TEXT_FROM_FILE]","new_string":"[REPLACEMENT_TEXT]"}}]}\n` +
      `  old_string = exact text currently in the file (copy it, do not guess)\n` +
      `  new_string = the text that should replace it\n` +
      `Write: {"tool_calls":[{"name":"Write","arguments":{"file_path":"[PATH_FROM_USER]","content":"[FULL_CONTENTS]"}}]}\n` +
      `  content = the complete new file contents\n` +
      `Respond: {"tool_calls":[{"name":"ExitTool","arguments":{"response":"[YOUR_ANSWER]"}}]}\n`;

    return { systemPrompt, knownTools };
  }

  // ═════════════════════════════════════════════════════════════════════
  // Step 2: Message bookkeeping
  // ═════════════════════════════════════════════════════════════════════

  private filterConversationMessages(messages: any[]): any[] {
    return messages.filter(
      (m: any) => m.role === "user" || m.role === "assistant" || m.role === "tool"
    );
  }

  private detectNewConversation(
    conversationMsgs: any[],
    systemPrompt: string,
    sessionId: string
  ): void {
    const state = this.getSessionState(sessionId);
    if (state.processedMsgCount === 0) return;
    if (conversationMsgs.length > state.processedMsgCount) return;

    process.stderr.write(
      `[bridge] New conversation detected (${conversationMsgs.length} msgs <= ${state.processedMsgCount} processed), resetting session=${sessionId}\n`
    );
    state.processedMsgCount = 0;
    state.lastParseError = "";
    if (this.page) {
      this.page.evaluate(
        (args: any) => (window as any).resetSession(args.sid, { systemPrompt: args.sp }),
        { sid: sessionId, sp: systemPrompt }
      ).catch((e: any) => {
        process.stderr.write(`[bridge] resetSession failed: ${e.message}\n`);
      });
    }
  }

  // ═════════════════════════════════════════════════════════════════════
  // Step 3: Build the turn prompt from unconsumed messages
  // ═════════════════════════════════════════════════════════════════════

  private buildTurnPrompt(newMessages: any[], state: any): {
    promptText: string;
    hasToolResults: boolean;
  } {
    let promptText = "";
    let hasToolResults = false;

    for (const msg of newMessages) {
      let content = extractTextContent(msg.content);
      if (!content) continue;

      // Strip Claude Code internal context from user messages
      if (msg.role === "user") {
        content = stripClaudeCodeContext(content);
        if (!content) continue;
      }

      if (msg.role === "user") {
        if (promptText) promptText += "\n\n";
        promptText += content;
      } else if (msg.role === "tool") {
        hasToolResults = true;
        // Use XML markup for superior structural isolation
        const toolName = msg.name || "unknown";
        if (promptText) promptText += "\n\n";
        
        // For Read tools, we want to make it extremely obvious that this is the file content.
        let wrappedContent = content;
        if (toolName === "Read") {
          wrappedContent = `[File Content]:\n${content}`;
        }
        
        promptText += `<tool_result tool="${toolName}">\n${wrappedContent}\n</tool_result>`;
      } else if (msg.role === "assistant") {
        // Skip assistant messages for turns AFTER the first one — the Prompt API
        // session already has the model's prior output in context. For the first
        // turn (processedMsgCount === 0), include them so the model sees its own
        // tool calls when the conversation starts with pre-existing history.
        if (state.processedMsgCount === 0) {
          if (promptText) promptText += "\n\n";
          promptText += content;
        } else {
          process.stderr.write(`[bridge] skipping assistant message in prompt (session should have it in context)\n`);
        }
      }
    }

    // Also detect tool results that were transformed from <system-reminder> in user messages
    if (promptText.includes("<tool_result tool=")) {
      hasToolResults = true;
    }

    // Prepend a strong notice if tool results are already present.
    // This breaks the reflexive "Command -> Tool Call" loop.
    if (hasToolResults) {
      // Extract which tools already have results
      const toolSet = new Set<string>();
      const trMatch = promptText.matchAll(/<tool_result tool="(\w+)">/g);
      for (const m of trMatch) toolSet.add(m[1]);
      const toolNames = Array.from(toolSet).join(", ");
      promptText = `[NOTICE: The assistant already called tool(s): ${toolNames}. The results are provided below. You MUST NOT call those tools again. Review the results and answer the user's question directly using ExitTool.]

` + promptText;
    }

    return { promptText, hasToolResults };
  }

  // ═════════════════════════════════════════════════════════════════════
  // Step 4: Ensure browser page is ready
  // ═════════════════════════════════════════════════════════════════════

  private async ensurePageReady(): Promise<void> {
    process.stderr.write(`[bridge] ensurePageReady started\n`);
    let pageReady = false;
    try {
      pageReady = await this.page.evaluate(
        () => typeof (window as any).ensureSession === "function"
      );
    } catch (e: any) {
      process.stderr.write(`[bridge] page evaluate failed: ${e.message}\n`);
    }
    if (pageReady) {
      process.stderr.write(`[bridge] page already ready\n`);
      return;
    }

    process.stderr.write("[bridge] page not ready, reloading...\n");
    try {
      await this.page.reload({ waitUntil: "domcontentloaded", timeout: 10000 });
    } catch (e: any) {
      process.stderr.write(`[bridge] reload failed: ${e.message}, trying goto...\n`);
      try {
        await this.page.goto(`http://localhost:${this.port}/`, { timeout: 10000 });
      } catch (e2: any) {
        throw new Error(`Bridge page failed to load after reload and goto: ${e2.message}`);
      }
    }

    for (let attempt = 0; attempt < 5; attempt++) {
      process.stderr.write(`[bridge] ensuring session ready, attempt ${attempt+1}/5\n`);
      await new Promise((r) => setTimeout(r, 500));
      try {
        const info = await this.page.evaluate(() => ({
          hasFn: typeof (window as any).ensureSession,
          readyState: document.readyState,
        }));
        if (info.hasFn === "function") { pageReady = true; break; }
        if (info.readyState === "complete" && info.hasFn === "undefined") {
          process.stderr.write(`[bridge] injecting bridge script...\n`);
          await this.page.addScriptTag({ content: BRIDGE_SCRIPT });
          if (typeof (await this.page.evaluate(() => typeof (window as any).ensureSession)) === "function") {
            pageReady = true; break;
          }
        }
      } catch (e: any) {
        process.stderr.write(`[bridge] page evaluate poll failed: ${e.message}\n`);
      }
    }

    if (!pageReady) {
      throw new Error("Bridge page failed to load");
    }

    this.sessionStates.clear();
    process.stderr.write("[bridge] page ready\n");
  }

  // ═════════════════════════════════════════════════════════════════════
  // Step 7: Auto-compact when context is near limit
  // ═════════════════════════════════════════════════════════════════════

  private async checkAutoCompact(
    sessionResult: any,
    conversationMsgs: any[],
    systemPrompt: string,
    sessionId: string
  ): Promise<any> {
    if (!sessionResult.ready || sessionResult.contextWindow <= 0) {
      return sessionResult;
    }
    const usageRatio = sessionResult.contextUsage / sessionResult.contextWindow;
    if (usageRatio < 0.85) return sessionResult;

    process.stderr.write(
      `[bridge] auto-compacting at ${(usageRatio * 100).toFixed(0)}% (session=${sessionId})...\n`
    );
    try {
      const compactedPrompt = systemPrompt + "\n[Earlier conversation compacted to save context.]";
      const result = await this.page.evaluate(
        (args: any) => (window as any).resetSession(args.sid, { systemPrompt: args.sp }),
        { sid: sessionId, sp: compactedPrompt }
      );
      const state = this.getSessionState(sessionId);
      state.processedMsgCount = conversationMsgs.length;
      if (result.ready) {
        process.stderr.write(
          `[bridge] compacted: ${result.contextUsage}/${result.contextWindow}\n`
        );
      }
      return result;
    } catch (e: any) {
      process.stderr.write(`[bridge] auto-compact failed: ${e.message}, continuing with existing session\n`);
      return sessionResult;
    }
  }

  // ═════════════════════════════════════════════════════════════════════
  // Step 8: Run the model with SSE thinking indicators
  // ═════════════════════════════════════════════════════════════════════

  private async runModel(
    promptText: string,
    res: http.ServerResponse,
    chatId: string,
    modelName: string,
    isStreaming: boolean,
    sessionId: string,
    state: any,
    setupStreaming = true,
    schema = RESPONSE_SCHEMA,
    temp = DEFAULT_TEMP
  ): Promise<{ response: string; truncated: boolean }> {
    process.stderr.write(`[bridge] runModel entered (isStreaming=${isStreaming}, setupStreaming=${setupStreaming})\n`);
    let thinkingTimer: ReturnType<typeof setInterval> | null = null;

    if (isStreaming && setupStreaming) {
      res.writeHead(200, STREAM_HEADERS);
    }
    if (isStreaming) {
      const created = Math.floor(Date.now() / 1000);
      thinkingTimer = setInterval(() => {
        try {
          res.write(`data: ${JSON.stringify({
            id: chatId, object: "chat.completion.chunk", created, model: modelName,
            choices: [{ index: 0, delta: {}, finish_reason: null }],
          })}\n\n`);
        } catch {
          if (thinkingTimer) { clearInterval(thinkingTimer); thinkingTimer = null; }
        }
      }, 3000);
    }

    let streamResult: any;
    try {
      process.stderr.write(`[bridge] calling promptSession (session=${sessionId})...\n`);
      streamResult = await this.page.evaluate(
        (args: any) => (window as any).promptSession(args.sid, args.text, args.schema, args.temp),
        { sid: sessionId, text: promptText, schema: schema, temp: temp }
      );
    } catch (e: any) {
      process.stderr.write(`[bridge] page.evaluate failed: ${e.message}\n`);
      if (setupStreaming && isStreaming && !res.writableEnded) {
        try { res.end("data: [DONE]\n\n"); } catch { }
      }
      return { response: "", truncated: false };
    } finally {
      if (thinkingTimer) clearInterval(thinkingTimer);
    }
    if (!streamResult || streamResult.error) {
      process.stderr.write(
        `[bridge] ERROR stream: ${streamResult?.error}\n${streamResult?.stack || ''}\n`
      );
      if (setupStreaming && isStreaming && !res.writableEnded) {
        try {
          res.write(`data: ${JSON.stringify({
            id: chatId, object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000), model: modelName,
            choices: [{ index: 0, delta: {}, finish_reason: "error" }],
            usage: {
              prompt_tokens: state.lastPromptTokens,
              completion_tokens: state.lastCompletionTokens,
              total_tokens: state.lastPromptTokens + state.lastCompletionTokens,
            },
          })}\n\n`);
          res.end("data: [DONE]\n\n");
        } catch { }
      } else if (setupStreaming && !isStreaming) {
        try {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            id: chatId, object: "chat.completion",
            created: Math.floor(Date.now() / 1000), model: modelName,
            choices: [{
              index: 0,
              message: { role: "assistant", content: streamResult?.error },
              finish_reason: "error",
            }],
            usage: {
              prompt_tokens: state.lastPromptTokens,
              completion_tokens: state.lastCompletionTokens,
              total_tokens: state.lastPromptTokens + state.lastCompletionTokens,
            },
          }));
        } catch { }
      }
      return { response: "", truncated: false };
    }

    const fullResponse = streamResult.response || "";
    const wasTruncated = streamResult.truncated || false;
    if (!fullResponse && !wasTruncated) {
      process.stderr.write(`[bridge] WARNING: model produced empty response (session=${sessionId})\n`);
    }
    return { response: fullResponse, truncated: wasTruncated };
  }

  // ═════════════════════════════════════════════════════════════════════
  // Step 9: Parse and validate the model response
  // ═════════════════════════════════════════════════════════════════════

  private parseResponse(
    fullResponse: string,
    knownTools: Array<{ name: string; params: string[] }>,
    state: any,
    wasTruncated = false
  ): { textContent: string; funcCalls: Array<{ name: string; arguments: Record<string, any> }> } {
    let textContent = "";
    const funcCalls: Array<{ name: string; arguments: Record<string, any> }> = [];

    state.lastParseError = "";
    const parsed = extractJson(fullResponse);
    if (!parsed) {
      process.stderr.write(
        `[bridge] JSON parse failed (${fullResponse.length} chars, truncated=${wasTruncated}): ${fullResponse.substring(0, 200)}\n`
      );
      if (wasTruncated) {
        state.lastParseError =
          "Your response was cut off — you generated too much whitespace (indentation). " +
          "Reduce indentation and write more concisely.";
      } else {
        state.lastParseError =
          "Your last response was invalid JSON. Use \\n for newlines and \" for quotes inside strings.";
      }
      return { textContent: "", funcCalls: [] };
    }

    // Legacy: models may still output {"text":"..."} despite schema
    if (parsed.text) textContent = parsed.text;

    // Extract text from ExitTool arguments if present
    if (parsed.tool_calls && Array.isArray(parsed.tool_calls)) {
      for (const tc of parsed.tool_calls) {
        if (!tc.name || !tc.arguments) continue;

        // ExitTool → extract response as text content
        if (tc.name === "ExitTool" && tc.arguments.response) {
          textContent = tc.arguments.response;
          continue;
        }

        const normalized = normalizeToolCall(tc, knownTools);
        const validated = this.validateToolCall(normalized);

        if (validated.valid) {
          funcCalls.push(validated.call);
        } else {
          process.stderr.write(
            `[bridge] REJECTED invalid tool call: ${tc.name} — ${validated.error}\n`
          );
          textContent += (textContent ? "\n\n" : "") + "Error: " + validated.error;
        }
      }
    }

    return { textContent, funcCalls };
  }

  private validateToolCall(
    call: { name: string; arguments: Record<string, any> }
  ): { valid: true; call: { name: string; arguments: Record<string, any> } }
    | { valid: false; error: string } {
    const required = ChromeDeviceBridge.TOOL_REQUIRED_PARAMS[call.name];
    if (!required) return { valid: true, call };

    const missing = required.filter((p) => {
      const val = call.arguments[p];
      return val === undefined || val === null || val === "";
    });
    if (missing.length > 0) {
      return {
        valid: false,
        error: `${call.name} failed: missing required parameter(s): ${missing.join(", ")}. ` +
          `You MUST provide all of: ${required.join(", ")}.`,
      };
    }
    return { valid: true, call };
  }

  // ═════════════════════════════════════════════════════════════════════
  // Error & response writing
  // ═════════════════════════════════════════════════════════════════════

  private writeErrorResponse(
    res: http.ServerResponse,
    chatId: string,
    modelName: string,
    isStreaming: boolean,
    message: string,
    state: any,
    finishReason = "error"
  ): void {
    const created = Math.floor(Date.now() / 1000);
    if (isStreaming) {
      if (!res.headersSent) {
        res.writeHead(200, STREAM_HEADERS);
      }
      res.write(`data: ${JSON.stringify({
        id: chatId, object: "chat.completion.chunk", created, model: modelName,
        choices: [{
          index: 0,
          delta: { content: message },
          finish_reason: finishReason,
        }],
        usage: {
          prompt_tokens: state.lastPromptTokens,
          completion_tokens: state.lastCompletionTokens,
          total_tokens: state.lastPromptTokens + state.lastCompletionTokens,
        },
      })}\n\n`);
      res.end("data: [DONE]\n\n");
    } else {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        id: chatId, object: "chat.completion", created, model: modelName,
        choices: [{
          index: 0,
          message: { role: "assistant", content: message },
          finish_reason: finishReason,
        },
        ],
        usage: {
          prompt_tokens: state.lastPromptTokens,
          completion_tokens: state.lastCompletionTokens,
          total_tokens: state.lastPromptTokens + state.lastCompletionTokens,
        },
      }));
    }
  }

  private writeStreamResponse(
    res: http.ServerResponse,
    chatId: string,
    modelName: string,
    textContent: string,
    funcCalls: Array<{ name: string; arguments: Record<string, any> }>,
    state: any,
  ): void {
    if (!res.headersSent) {
      res.writeHead(200, STREAM_HEADERS);
    }

    const writeData = (data: any) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    const created = Math.floor(Date.now() / 1000);

    // Separate real tool calls from ExitTool
    const realCalls = funcCalls.filter(fc => fc.name !== "ExitTool");
    const exitCall = funcCalls.find(fc => fc.name === "ExitTool");

    // If ExitTool present, extract text from its response argument
    const finalText = exitCall?.arguments?.response || textContent;

    if (realCalls.length > 0) {
      // Real tool calls — send with finish_reason: "tool_calls"
      if (finalText) {
        writeData({
          id: chatId, object: "chat.completion.chunk", created, model: modelName,
          choices: [{ index: 0, delta: { role: "assistant", content: finalText }, finish_reason: null }],
        });
      }
      for (const fc of realCalls) {
        const toolId = "call_" + randomBytes(6).toString("hex");
        writeData({
          id: chatId, object: "chat.completion.chunk", created, model: modelName,
          choices: [{
            index: 0,
            delta: {
              role: "assistant",
              tool_calls: [{
                index: 0, id: toolId,
                function: { name: fc.name, arguments: JSON.stringify(fc.arguments) },
                type: "function",
              }],
            },
            finish_reason: null,
          }],
        });
      }
      writeData({
        id: chatId, object: "chat.completion.chunk", created, model: modelName,
        choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }],
        usage: {
          prompt_tokens: state.lastPromptTokens,
          completion_tokens: state.lastCompletionTokens,
          total_tokens: state.lastPromptTokens + state.lastCompletionTokens,
        },
      });
    } else if (exitCall) {
      // ExitTool — send as a tool call so tooluse transformer can unwrap it
      const toolId = "call_" + randomBytes(6).toString("hex");
      writeData({
        id: chatId, object: "chat.completion.chunk", created, model: modelName,
        choices: [{
          index: 0,
          delta: {
            role: "assistant",
            tool_calls: [{
              index: 0, id: toolId,
              function: { name: "ExitTool", arguments: JSON.stringify(exitCall.arguments) },
              type: "function",
            }],
          },
          finish_reason: null,
        }],
      });
      writeData({
        id: chatId, object: "chat.completion.chunk", created, model: modelName,
        choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }],
        usage: {
          prompt_tokens: state.lastPromptTokens,
          completion_tokens: state.lastCompletionTokens,
          total_tokens: state.lastPromptTokens + state.lastCompletionTokens,
        },
      });
    } else if (finalText) {
      // Plain text response (legacy fallback)
      writeData({
        id: chatId, object: "chat.completion.chunk", created, model: modelName,
        choices: [{ index: 0, delta: { role: "assistant", content: finalText }, finish_reason: null }],
      });
      writeData({
        id: chatId, object: "chat.completion.chunk", created, model: modelName,
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
        usage: {
          prompt_tokens: state.lastPromptTokens,
          completion_tokens: state.lastCompletionTokens,
          total_tokens: state.lastPromptTokens + state.lastCompletionTokens,
        },
      });
    } else {
      writeData({
        id: chatId, object: "chat.completion.chunk", created, model: modelName,
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
        usage: {
          prompt_tokens: state.lastPromptTokens,
          completion_tokens: state.lastCompletionTokens,
          total_tokens: state.lastPromptTokens + state.lastCompletionTokens,
        },
      });
    }

    res.end("data: [DONE]\n\n");
  }

  private writeNonStreamResponse(
    res: http.ServerResponse,
    chatId: string,
    modelName: string,
    textContent: string,
    funcCalls: Array<{ name: string; arguments: Record<string, any> }>,
    state: any,
  ): void {
    const created = Math.floor(Date.now() / 1000);

    // Separate real tool calls from ExitTool
    const realCalls = funcCalls.filter(fc => fc.name !== "ExitTool");
    const exitCall = funcCalls.find(fc => fc.name === "ExitTool");
    const finalText = exitCall?.arguments?.response || textContent;

    // If ExitTool is present, send it as a tool_call so tooluse transformer can unwrap it
    const allCalls = realCalls.length > 0 ? realCalls : exitCall ? [exitCall] : [];
    const finishReason = allCalls.length > 0 ? "tool_calls" : "stop";

    const message: Record<string, any> = { role: "assistant", content: realCalls.length > 0 ? (finalText || null) : (finalText || null) };

    if (allCalls.length > 0) {
      message.tool_calls = allCalls.map((fc) => ({
        id: "call_" + randomBytes(6).toString("hex"),
        type: "function",
        function: { name: fc.name, arguments: JSON.stringify(fc.arguments) },
      }));
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      id: chatId,
      object: "chat.completion",
      created,
      model: modelName,
      choices: [{ index: 0, message, finish_reason: finishReason }],
      usage: {
        prompt_tokens: state.lastPromptTokens,
        completion_tokens: state.lastCompletionTokens,
        total_tokens: state.lastPromptTokens + state.lastCompletionTokens,
      },
    }));
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Entry point
// ═══════════════════════════════════════════════════════════════════════

export async function runChromeBridge(
  port = DEFAULT_PORT,
  cdpPort = DEFAULT_CDP_PORT
) {
  const bridge = new ChromeDeviceBridge(port, cdpPort);

  process.on("SIGINT", async () => {
    process.stderr.write("\nShutting down bridge...\n");
    await bridge.stop();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    process.stderr.write("\nShutting down bridge...\n");
    await bridge.stop();
    process.exit(0);
  });

  await bridge.start();

  await new Promise(() => { });
}

if (process.argv[1]?.includes("chrome-device-bridge")) {
  runChromeBridge().catch((e) => {
    console.error("Bridge failed:", e.message);
    process.exit(1);
  });
}
