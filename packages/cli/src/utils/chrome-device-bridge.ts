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
import { randomBytes } from "crypto";

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
const CHROME_USER_DATA_DIR = "/tmp/chrome-debug-profile";

const STREAM_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
};

// ═══════════════════════════════════════════════════════════════════════
// JSON schema for structured output — forces the model to emit well-formed
// tool calls or text responses via responseConstraint (Chrome 137+).
// ═══════════════════════════════════════════════════════════════════════

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    text: {
      type: "string",
      maxLength: 1100,
    },
    tool_calls: {
      type: "array",
      maxItems: 1,
      items: {
        type: "object",
        properties: {
          name: {
            type: "string",
            maxLength: 20,
          },
          arguments: {
            type: "object",
            properties: {
              command: { type: "string", maxLength: 250 },
              file_path: { type: "string", maxLength: 80 },
              content: { type: "string", maxLength: 800 },
              old_string: { type: "string", maxLength: 200 },
              new_string: { type: "string", maxLength: 500 },
              url: { type: "string", maxLength: 300 },
              prompt: { type: "string", maxLength: 300 },
              query: { type: "string", maxLength: 100 },
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
// ═══════════════════════════════════════════════════════════════════════

const BRIDGE_SCRIPT = `
let conversationSession = null;
let turnCount = 0;
let stats = { requests: 0, lastPromptLen: 0, lastRespLen: 0, lastTimeMs: 0, lastCharsPerSec: 0 };

function updateDashboard() {
  const ctx = conversationSession ? (conversationSession.contextUsage || 0) + ' / ' + (conversationSession.contextWindow || 0) + ' tokens' : 'no session';
  document.getElementById('ctx').textContent = ctx;
  document.getElementById('reqs').textContent = stats.requests;
  document.getElementById('prompt-len').textContent = stats.lastPromptLen;
  document.getElementById('resp-len').textContent = stats.lastRespLen;
  document.getElementById('resp-time').textContent = stats.lastTimeMs ? (stats.lastTimeMs / 1000).toFixed(1) + 's' : '-';
  document.getElementById('chars-sec').textContent = stats.lastCharsPerSec ? stats.lastCharsPerSec.toFixed(1) + ' ch/s' : '-';
  document.getElementById('status').textContent = conversationSession ? 'Session active (turn ' + turnCount + ')' : 'No session';
  document.getElementById('status').style.color = conversationSession ? '#4caf50' : '#ff9800';
}

window.ensureSession = async function(systemPrompt) {
  if (conversationSession) {
    return { ready: true, contextUsage: conversationSession.contextUsage || 0, contextWindow: conversationSession.contextWindow || 0 };
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
        initialPrompts: [{ role: 'system', content: systemPrompt }],
      };
      try {
        if (typeof api.params === 'function') {
          const p = await api.params(availOpts);
          console.log('[model] default params: temperature=' + p.defaultTemperature + ', topK=' + p.defaultTopK + ', maxTemperature=' + p.maxTemperature + ', maxTopK=' + p.maxTopK);
          createOpts.temperature = 0;
          createOpts.topK = p.defaultTopK;
        }
      } catch (e) {
        console.log('[model] could not query params, using defaults:', e.message);
      }
      conversationSession = await api.create(createOpts);
      try {
        conversationSession.addEventListener('contextoverflow', function() {
          console.log('[model] CONTEXT OVERFLOW - oldest messages being evicted');
          updateDashboard();
        });
      } catch (e) {}
      turnCount = 0;
      updateDashboard();
      return { ready: true, contextUsage: conversationSession.contextUsage || 0, contextWindow: conversationSession.contextWindow || 0 };
    } catch (e) {
      if (i === maxRetries - 1) return { step: 'create', error: e.message };
      await new Promise(r => setTimeout(r, 2000));
    }
  }
};

window.resetSession = async function(systemPrompt) {
  if (conversationSession) {
    try { conversationSession.destroy(); } catch (e) { console.log('[model] destroy failed:', e.message); }
    conversationSession = null;
  }
  turnCount = 0;
  return window.ensureSession(systemPrompt);
};

window.getContextInfo = function() {
  if (!conversationSession) return { usage: 0, window: 0 };
  return { usage: conversationSession.contextUsage || 0, window: conversationSession.contextWindow || 0 };
};

window.updateStats = function(s) {
  stats = s;
  updateDashboard();
};

window.promptSession = async function(promptText, schema) {
  if (!conversationSession) return { error: 'Session not initialized' };
  try {
    const MAX_WS_STALL = 2000;
    const controller = new AbortController();
    const opts = { signal: controller.signal, temperature: 0.1, topK: 5 };
    if (schema) opts.responseConstraint = schema;
    console.log('[model] turn ' + (turnCount + 1) + ' prompt, length:', promptText.length);
    const t0 = Date.now();
    const stream = conversationSession.promptStreaming(promptText, opts);
    let full = '';
    let nonWsChars = 0;
    let prevNonWsChars = 0;
    let lastNonWsAt = 0;
    let stallChars = 0;
    let stallChunks = 0;
    let firstContentAt = 0;
    let lastThinkingLog = 0;
    let lastContentLog = 0;
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
              console.log('[model] thinking done in ' + (thinkMs / 1000).toFixed(1) + 's, generating...');
            }
            nonWsChars++;
            chunkHasContent = true;
          }
        }
        if (!chunkHasContent && nonWsChars > 0) {
          stallChars += chunk.length;
          stallChunks++;
          if (lastNonWsAt === 0) lastNonWsAt = Date.now();
          if (stallChars >= MAX_WS_STALL) {
            console.log('[model] ' + MAX_WS_STALL + '+ whitespace chars with no content, aborting (stalled ' + ((Date.now() - lastNonWsAt) / 1000).toFixed(1) + 's)');
            truncated = true;
            controller.abort();
            break;
          }
        } else if (chunkHasContent) {
          if (stallChars > MAX_WS_STALL) {
            console.log('[model] recovered after ' + stallChars + ' whitespace chars (stalled ' + ((Date.now() - lastNonWsAt) / 1000).toFixed(1) + 's)');
          }
          stallChars = 0;
          stallChunks = 0;
          lastNonWsAt = 0;
          prevNonWsChars = nonWsChars;
        }
        if (stallChars > 500 && stallChars % 500 < chunk.length) {
          console.log('[model] STALLING: ' + stallChars + ' whitespace chars, ' + ((Date.now() - lastNonWsAt) / 1000).toFixed(1) + 's since last content, chunk sample: ' + JSON.stringify(chunk.substring(0, 60)));
        }
        const elapsed = Date.now() - t0;
        if (nonWsChars === 0 && elapsed - lastThinkingLog >= 3000) {
          console.log('[model] thinking... (' + (elapsed / 1000).toFixed(1) + 's)');
          lastThinkingLog = elapsed;
        } else if (nonWsChars > 0 && elapsed - lastContentLog >= 2000) {
          const preview = full.replace(/^[\\s]+/, '').substring(0, 80);
          console.log('[model] generating: ' + nonWsChars + ' content chars, preview: ' + JSON.stringify(preview));
          lastContentLog = elapsed;
        }
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        console.log('[model] stream error (using partial output):', e.message);
      }
      truncated = true;
    }
    full = full.trimEnd();
    const elapsed = Date.now() - t0;
    const thinkMs = firstContentAt > 0 ? firstContentAt - t0 : elapsed;
    const genMs = firstContentAt > 0 ? elapsed - firstContentAt : 0;
    turnCount++;
    stats.requests++;
    stats.lastPromptLen = promptText.length;
    stats.lastRespLen = full.length;
    stats.lastTimeMs = elapsed;
    stats.lastCharsPerSec = elapsed > 0 ? (full.length * 1000 / elapsed) : 0;
    updateDashboard();
    if (firstContentAt > 0) {
      console.log('[model] turn ' + turnCount + ' done in ' + elapsed + 'ms (think: ' + thinkMs + 'ms, gen: ' + genMs + 'ms), ' + full.length + ' chars' + (truncated ? ' [TRUNCATED]' : ''));
    } else {
      console.log('[model] turn ' + turnCount + ' done in ' + elapsed + 'ms (no content), ' + full.length + ' chars' + (truncated ? ' [TRUNCATED]' : ''));
    }
    if (full.length === 0 && truncated) {
      return { error: 'Output truncated before any content was produced' };
    }
    return { response: full, truncated: truncated };
  } catch (e) {
    console.log('[model] ERROR:', e.message);
    return { error: e.message, stack: e.stack };
  }
};

// Clean up the session when the page is closed (releases Chrome model memory)
window.addEventListener('beforeunload', function() {
  if (conversationSession) {
    try { conversationSession.destroy(); } catch (e) {}
    conversationSession = null;
  }
});
`;

const HTML_PAGE = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
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
  <div class="card"><div class="label">Requests</div><div id="reqs" class="value">0</div></div>
  <div class="card"><div class="label">Last Prompt</div><div id="prompt-len" class="value">-</div></div>
  <div class="card"><div class="label">Last Response</div><div id="resp-len" class="value">-</div></div>
  <div class="card"><div class="label">Last Duration</div><div id="resp-time" class="value">-</div></div>
  <div class="card"><div class="label">Throughput</div><div id="chars-sec" class="value">-</div></div>
</div>
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
    console.log('Bridge page loaded');
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
  // Direct parse
  try { return JSON.parse(text); } catch { }

  // Escape literal newlines in JSON strings
  try { return JSON.parse(escapeNewlinesInJsonStrings(text)); } catch { }

  // Extract from within surrounding text
  const firstBrace = text.indexOf("{");
  if (firstBrace === -1) return null;

  try { return JSON.parse(text.slice(firstBrace)); } catch { }

  try {
    return JSON.parse(escapeNewlinesInJsonStrings(text.slice(firstBrace)));
  } catch { }

  // Trailing comma cleanup
  try {
    const cleaned = text
      .slice(firstBrace)
      .replace(/,\s*}/g, "}")
      .replace(/,\s*\]/g, "]");
    return JSON.parse(cleaned);
  } catch { }

  const lastBrace = text.lastIndexOf("}");
  if (lastBrace > firstBrace) {
    try {
      const clean = text
        .slice(firstBrace, lastBrace + 1)
        .replace(/,\s*}/g, "}")
        .replace(/,\s*]/g, "]");
      return JSON.parse(clean);
    } catch { }

    try {
      const clean = escapeNewlinesInJsonStrings(text.slice(firstBrace, lastBrace + 1))
        .replace(/,\s*}/g, "}")
        .replace(/,\s*]/g, "]");
      return JSON.parse(clean);
    } catch { }
  }

  // Find first complete JSON object by brace-depth tracking
  let depth = 0;
  let lastGood = -1;
  for (let i = firstBrace; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (depth === 0) { lastGood = i; break; }
    }
  }
  if (lastGood !== -1) {
    try {
      const clean = text
        .slice(firstBrace, lastGood + 1)
        .replace(/,\s*}/g, "}")
        .replace(/,\s*]/g, "]");
      return JSON.parse(clean);
    } catch { }
  }

  return null;
}

function stripClaudeCodeContext(text: string): string {
  // Remove <system-reminder> blocks — Claude Code injects these with MCP
  // instructions, skill lists, plan files, etc. Irrelevant to the on-device model.
  let result = text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "");
  // Remove <command-name> blocks
  result = result.replace(/<command-name>[\s\S]*?<\/command-name>/g, "");
  // Remove <command-message> blocks
  result = result.replace(/<command-message>[\s\S]*?<\/command-message>/g, "");
  // Remove <command-args> blocks
  result = result.replace(/<command-args>[\s\S]*?<\/command-args>/g, "");
  // Remove <local-command-*> blocks
  result = result.replace(/<local-command-[^>]*>[\s\S]*?<\/local-command-[^>]*>/g, "");
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
// Bridge class
// ═══════════════════════════════════════════════════════════════════════

export class ChromeDeviceBridge {
  private port: number;
  private cdpPort: number;
  private browser: any = null;
  private page: any = null;
  private server: http.Server | null = null;
  private chromeStartedByUs = false;
  private processedMsgCount = 0;
  private lastParseError = "";
  private lastContextUsage = 0;
  private lastContextWindow = 0;
  private lastCompletionTokens = 0;
  private lastPromptTokens = 0;

  // ── Tool definitions ──

  private static readonly CORE_TOOLS = new Set([
    "Bash", "Read", "Write", "Edit", "WebFetch", "WebSearch", "AskUserQuestion",
  ]);

  private static readonly TOOL_INSTRUCTIONS: Record<string, string> = {
    Bash: "Run shell command. Params: command\n",
    Read: "Read file contents. Params: file_path\n",
    Write: "Create/overwrite file. Max 3 lines per call. Params: file_path, content\n",
    Edit: "Replace text in file. old_string must match Read output exactly. Params: file_path, old_string, new_string\n",
    WebFetch: "Fetch URL content. Params: url, prompt\n",
    WebSearch: "Search the web. Params: query\n",
    AskUserQuestion: "ONLY when truly stuck. question object MUST have: question, header, options. options is [{label,description}], NOT strings.\n",
  };

  private static readonly TOOL_REQUIRED_PARAMS: Record<string, string[]> = {
    Bash: ["command"],
    Read: ["file_path"],
    Write: ["file_path", "content"],
    Edit: ["file_path", "old_string", "new_string"],
    WebFetch: ["url", "prompt"],
    WebSearch: ["query"],
    AskUserQuestion: ["questions"],
  };

  // ── Lifecycle ──

  constructor(port = DEFAULT_PORT, cdpPort = DEFAULT_CDP_PORT) {
    this.port = port;
    this.cdpPort = cdpPort;
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
        text.includes("[model] ERROR") ||
        text.includes("CONTEXT OVERFLOW") ||
        text.includes("STALLING") ||
        text.includes("turn") && text.includes("done in")
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
    // Clean up the Chrome model session before disconnecting CDP.
    // (CDP disconnect does not trigger beforeunload, so we must destroy explicitly.)
    if (this.page) {
      try {
        await this.page.evaluate(() => {
          const win = window as any;
          if (win.conversationSession) {
            try { win.conversationSession.destroy(); } catch (e) { }
            win.conversationSession = null;
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
      // Try to get live context info from the browser session
      let contextInfo: { usage: number; window: number } = { usage: 0, window: 0 };
      if (this.page) {
        try {
          contextInfo = await this.page.evaluate(
            () => (window as any).getContextInfo?.() || { usage: 0, window: 0 }
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
            current_usage: contextInfo.usage || this.lastContextUsage,
            used_percentage: contextInfo.window > 0
              ? Math.round((contextInfo.usage / contextInfo.window) * 100)
              : this.lastContextWindow > 0
                ? Math.round((this.lastContextUsage / this.lastContextWindow) * 100)
                : 0,
          },
        }],
      }));
      return;
    }

    // GET /v1/models/{model_name} — individual model info
    if (req.url?.startsWith("/v1/models/") && req.method === "GET") {
      const modelId = req.url.slice("/v1/models/".length);
      let contextInfo: { usage: number; window: number } = { usage: 0, window: 0 };
      if (this.page) {
        try {
          contextInfo = await this.page.evaluate(
            () => (window as any).getContextInfo?.() || { usage: 0, window: 0 }
          );
        } catch { }
      }
      const ctxWindow = contextInfo.window || this.lastContextWindow || 9216;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        id: modelId,
        type: "model",
        display_name: "Gemini Nano",
        created_at: "2024-05-14T00:00:00Z",
        max_input_tokens: ctxWindow,
        max_tokens: 1200,
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
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(chunk);
        }
        const body = JSON.parse(Buffer.concat(chunks).toString());
        await this.handleChatRequest(body, res);
      } catch (e: any) {
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: e.message }));
        } else {
          process.stderr.write(`[bridge] ERROR after headers sent: ${e.message}\n${e.stack || ''}\n`);
          try { res.end("data: [DONE]\n\n"); } catch { }
        }
      }
      return;
    }

    res.writeHead(404);
    res.end("Not found");
  }

  // ═════════════════════════════════════════════════════════════════════
  // Pipeline: handleChatRequest orchestrates a sequence of well-named steps
  // ═════════════════════════════════════════════════════════════════════

  private async handleChatRequest(
    body: any,
    res: http.ServerResponse
  ): Promise<void> {
    const { messages, tools, stream, model } = body;
    const isStreaming = stream === true;
    const modelName = model || "gemini-nano";
    const chatId = "chatcmpl-" + Date.now();

    // 1. Build system prompt and known-tool index
    const { systemPrompt, knownTools } = this.buildSystemPrompt(tools);

    // 2. Filter messages and detect new conversations
    const conversationMsgs = this.filterConversationMessages(messages);
    this.detectNewConversation(conversationMsgs, systemPrompt);

    const newMessages = conversationMsgs.slice(this.processedMsgCount);
    if (newMessages.length === 0) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "No new messages to process" }));
      return;
    }

    // 3. Build the turn prompt from unconsumed messages
    const { promptText, hasToolResults } = this.buildTurnPrompt(newMessages);
    if (!promptText.trim()) {
      // No new content to process — all new messages are assistant-only.
      // Return empty completion to signal we're done, not an error.
      this.processedMsgCount += newMessages.length;
      if (isStreaming) {
        res.writeHead(200, STREAM_HEADERS);
        const created = Math.floor(Date.now() / 1000);
        res.write(`data: ${JSON.stringify({
          id: chatId, object: "chat.completion.chunk", created, model: modelName,
          choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
          usage: {
            prompt_tokens: this.lastPromptTokens,
            completion_tokens: this.lastCompletionTokens,
            total_tokens: this.lastPromptTokens + this.lastCompletionTokens,
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
            prompt_tokens: this.lastPromptTokens,
            completion_tokens: this.lastCompletionTokens,
            total_tokens: this.lastPromptTokens + this.lastCompletionTokens,
          },
        }));
      }
      return;
    }

    // 4. Ensure the browser page is responsive
    await this.ensurePageReady();

    // 5. Ensure the persistent session exists
    let sessionResult = await this.page.evaluate(
      (sp: string) => (window as any).ensureSession(sp),
      systemPrompt
    );
    if (sessionResult.error) {
      this.writeErrorResponse(res, chatId, modelName, isStreaming,
        `[${sessionResult.step}] ${sessionResult.error}`, "error");
      return;
    }
    // 6. Auto-compact if near context limit
    sessionResult = await this.checkAutoCompact(
      sessionResult, conversationMsgs, systemPrompt
    );

    // Log context budget
    if (sessionResult.contextWindow > 0) {
      const usagePct = ((sessionResult.contextUsage / sessionResult.contextWindow) * 100).toFixed(0);
      process.stderr.write(`[bridge] context: ${usagePct}% used\n`);
    }

    // Track context for /v1/models and response usage
    this.lastContextUsage = sessionResult.contextUsage || 0;
    this.lastContextWindow = sessionResult.contextWindow || 0;

    // 7. Run the model — retry once if output fails to produce tool calls
    let fullResponse = "";
    let wasTruncated = false;
    let textContent = "";
    let funcCalls: Array<{ name: string; arguments: Record<string, any> }> = [];

    for (let attempt = 0; attempt < 2; attempt++) {
      const runPrompt = attempt === 0
        ? promptText
        : promptText +
        `\n\nYour last output was invalid JSON. ` +
        `Close all strings and brackets. Use JSON correctly.`;

      const result = await this.runModel(
        runPrompt, res, chatId, modelName, isStreaming, attempt === 0
      );
      fullResponse = result.response;
      wasTruncated = result.truncated;

      const parsed = this.parseResponse(fullResponse, knownTools, wasTruncated);
      textContent = parsed.textContent;
      funcCalls = parsed.funcCalls;

      if (funcCalls.length > 0) break;
      if (textContent && (!wasTruncated || attempt > 0)) break;
      process.stderr.write(
        `[bridge] retry because: ` +
        `truncated=${wasTruncated} funcs=${funcCalls.length} text=${textContent.length} chars\n`
      );
    }

    this.processedMsgCount += newMessages.length;

    // Compute token usage from session context delta and response length
    const preUsage = this.lastContextUsage;
    let postUsage = preUsage;
    try {
      const info = await this.page.evaluate(
        () => (window as any).getContextInfo?.() || { usage: 0, window: 0 }
      );
      postUsage = info.usage || preUsage;
      this.lastContextUsage = postUsage;
      this.lastContextWindow = info.window || this.lastContextWindow;
    } catch { }
    const deltaTokens = Math.max(0, postUsage - preUsage);
    this.lastCompletionTokens = Math.round(fullResponse.length / 4);
    this.lastPromptTokens = Math.max(0, deltaTokens - this.lastCompletionTokens);

    // 8. Write the final response
    if (isStreaming) {
      this.writeStreamResponse(res, chatId, modelName, textContent, funcCalls);
    } else {
      this.writeNonStreamResponse(res, chatId, modelName, textContent, funcCalls);
    }
  }

  // ═════════════════════════════════════════════════════════════════════
  // Step 1: Build system prompt
  // ═════════════════════════════════════════════════════════════════════

  private buildSystemPrompt(tools: any[]): {
    systemPrompt: string;
    knownTools: Array<{ name: string; params: string[] }>;
  } {
    let toolList = "";
    const knownTools: Array<{ name: string; params: string[] }> = [];

    if (tools && Array.isArray(tools)) {
      for (const tool of tools) {
        const name = tool.name || tool.function?.name || "";
        if (!ChromeDeviceBridge.CORE_TOOLS.has(name)) continue;

        const instruction = ChromeDeviceBridge.TOOL_INSTRUCTIONS[name] || "";
        const required = ChromeDeviceBridge.TOOL_REQUIRED_PARAMS[name] || [];

        const schema = tool.input_schema || tool.function?.parameters || tool.parameters;
        const props = schema?.properties;
        const paramNames: string[] = props ? Object.keys(props) : [];

        toolList += `${name}: ${instruction}Required: ${required.join(", ")}\n`;
        knownTools.push({ name, params: paramNames });
      }
    }

    const systemPrompt =
      `You are a tool-calling agent. Write CODE, not comments or plans.\n` +
      `Output ONE JSON object per turn. One tool call per turn.\n` +
      `Use EXACT values from user's request. Never invent paths, content, or names.\n` +
      `When asked about files or code, Read them before answering. Do not answer from memory.\n` +
      `Before answering: does this need a tool? If unsure, use a tool first. Verify, then respond.\n` +
      `Never ask user for info they already provided. Use Bash/Read to discover, not AskUserQuestion.\n` +
      `When task is fully complete, respond: {"text":"Done."} and STOP. Do not add extra work.\n` +
      `If not asked to test the output or results, say Done. Do not add extra work.\n` +
      `After each step, check: did I fulfill what the user explicitly asked? If yes, say Done. If no, continue.\n\n` +
      `<tools>\n${toolList}</tools>\n` +
      `<format>\n` +
      `{"text":"short label","tool_calls":[{...}]}\n` +
      `{"tool_calls":[{...}]}\n` +
      `{"text":"response text"}\n` +
      `{"text":"Done."}\n` +
      `</format>`;

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
    systemPrompt: string
  ): void {
    if (this.processedMsgCount === 0) return;
    if (conversationMsgs.length > this.processedMsgCount) return;

    process.stderr.write(
      `[bridge] New conversation detected (${conversationMsgs.length} msgs <= ${this.processedMsgCount} processed), resetting\n`
    );
    this.processedMsgCount = 0;
    this.lastParseError = "";
    if (this.page) {
      this.page.evaluate(
        (sp: string) => (window as any).resetSession(sp),
        systemPrompt
      ).catch((e: any) => {
        process.stderr.write(`[bridge] resetSession failed: ${e.message}\n`);
      });
    }
  }

  // ═════════════════════════════════════════════════════════════════════
  // Step 3: Build the turn prompt from unconsumed messages
  // ═════════════════════════════════════════════════════════════════════

  private buildTurnPrompt(newMessages: any[]): {
    promptText: string;
    hasToolResults: boolean;
  } {
    const MAX_TOOL_RESULT = 500;
    const MAX_FILE_CONTENT = 400;

    let promptText = "";
    let hasToolResults = false;
    let fileWasWritten = false;
    let fileWasEdited = false;
    let readContents: Array<{ path: string; content: string }> = [];

    // Track Read tool calls by tool_call_id for structured extraction
    const readPaths: Map<string, string> = new Map();
    // Track Anthropic-format tool_use blocks for Read
    const anthropicReadPaths: Map<string, string> = new Map();

    // First pass: identify Read tool calls
    for (const msg of newMessages) {
      // OpenAI format: assistant message with tool_calls
      if (msg.role === "assistant" && Array.isArray(msg.tool_calls)) {
        for (const tc of msg.tool_calls) {
          const fnName = tc.function?.name || tc.name;
          if (fnName === "Read") {
            try {
              const args = typeof tc.function?.arguments === "string"
                ? JSON.parse(tc.function.arguments)
                : tc.function?.arguments || tc.arguments;
              if (args?.file_path) {
                readPaths.set(tc.id, args.file_path);
              }
            } catch { }
          }
        }
      }
      // Anthropic format: assistant message with content array containing tool_use
      if (msg.role === "assistant" && Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === "tool_use" && block.name === "Read" && block.id) {
            const fp = block.input?.file_path;
            if (fp) anthropicReadPaths.set(block.id, fp);
          }
        }
      }
    }

    // Second pass: build prompt
    for (const msg of newMessages) {
      let content = extractTextContent(msg.content);
      if (!content) continue;

      // Strip Claude Code internal context from user messages
      if (msg.role === "user") {
        content = stripClaudeCodeContext(content);
        if (!content) continue;
      }

      if (msg.role === "user") {
        // Check for Anthropic-format tool_result blocks embedded in user messages
        if (Array.isArray(msg.content)) {
          for (const block of msg.content) {
            if (block.type === "tool_result" && block.tool_use_id) {
              const filePath = anthropicReadPaths.get(block.tool_use_id);
              if (filePath) {
                const blockContent = typeof block.content === "string"
                  ? block.content
                  : extractTextContent(block.content);
                readContents.push({
                  path: filePath,
                  content: blockContent.substring(0, MAX_FILE_CONTENT),
                });
              }
            }
          }
        }

        if (/Result of calling|Tool result|Successfully|Error:/.test(content)) {
          hasToolResults = true;
          if (/Successfully wrote/i.test(content)) fileWasWritten = true;
          else if (/Successfully (edited|updated|modified)/i.test(content)) fileWasEdited = true;
        }
        if (promptText) promptText += "\n\n";
        promptText += content;
      } else if (msg.role === "tool") {
        hasToolResults = true;
        if (/Successfully wrote/i.test(content)) fileWasWritten = true;
        else if (/Successfully (edited|updated|modified)/i.test(content)) fileWasEdited = true;

        // Check if this is a Read result via tool_call_id
        const filePath = readPaths.get(msg.tool_call_id);
        if (filePath) {
          readContents.push({
            path: filePath,
            content: content.substring(0, MAX_FILE_CONTENT),
          });
        }

        const truncated = content.length > MAX_TOOL_RESULT
          ? content.substring(0, MAX_TOOL_RESULT) + "..."
          : content;
        promptText += `\n\n<result>\n${truncated}\n</result>`;
      }
    }

    // Deduplicate Read results by path (keep last)
    const seen = new Set<string>();
    const uniqueReads: Array<{ path: string; content: string }> = [];
    for (let i = readContents.length - 1; i >= 0; i--) {
      if (!seen.has(readContents[i].path)) {
        seen.add(readContents[i].path);
        uniqueReads.unshift(readContents[i]);
      }
    }
    if (uniqueReads.length > 0) {
      promptText += `\n\n<files>`;
      for (const rc of uniqueReads) {
        promptText += `\n<file path="${rc.path}">\n${rc.content}\n</file>`;
      }
      promptText += `\n</files>`;
    }

    // Compact continuation prompt
    if (hasToolResults) {
      promptText += "\n\n";
      if (fileWasWritten) {
        promptText += "[write-ok] ";
      } else if (fileWasEdited) {
        promptText += "[edit-ok] ";
      }
      if (this.lastParseError) {
        promptText += `[error] ${this.lastParseError} `;
        this.lastParseError = "";
      }
      promptText += "Check: is the user's request fully done? If yes, say Done. If no, next step.";
    }

    return { promptText, hasToolResults };
  }

  // ═════════════════════════════════════════════════════════════════════
  // Step 4: Ensure browser page is ready
  // ═════════════════════════════════════════════════════════════════════

  private async ensurePageReady(): Promise<void> {
    let pageReady = false;
    try {
      pageReady = await this.page.evaluate(
        () => typeof (window as any).ensureSession === "function"
      );
    } catch (e: any) {
      process.stderr.write(`[bridge] page evaluate failed: ${e.message}\n`);
    }
    if (pageReady) return;

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
        process.stderr.write(`[bridge] poll ${attempt + 1} failed: ${e.message}\n`);
      }
    }

    if (!pageReady) {
      throw new Error("Bridge page failed to load");
    }

    this.processedMsgCount = 0;
    this.lastParseError = "";
    process.stderr.write("[bridge] page ready (session state reset)\n");
  }

  // ═════════════════════════════════════════════════════════════════════
  // Step 6: Auto-compact when context is near limit
  // ═════════════════════════════════════════════════════════════════════

  private async checkAutoCompact(
    sessionResult: any,
    conversationMsgs: any[],
    systemPrompt: string
  ): Promise<any> {
    if (!sessionResult.ready || sessionResult.contextWindow <= 0) {
      return sessionResult;
    }
    const usageRatio = sessionResult.contextUsage / sessionResult.contextWindow;
    if (usageRatio < 0.85) return sessionResult;

    process.stderr.write(
      `[bridge] auto-compacting at ${(usageRatio * 100).toFixed(0)}%...\n`
    );
    try {
      const result = await this.page.evaluate(
        (sp: string) => (window as any).resetSession(sp),
        systemPrompt + "\n[Earlier conversation compacted to save context.]"
      );
      this.processedMsgCount = conversationMsgs.length;
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
  // Step 7: Run the model with SSE thinking indicators
  // ═════════════════════════════════════════════════════════════════════

  private async runModel(
    promptText: string,
    res: http.ServerResponse,
    chatId: string,
    modelName: string,
    isStreaming: boolean,
    setupStreaming = true
  ): Promise<{ response: string; truncated: boolean }> {
    const t0 = Date.now();
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
      streamResult = await this.page.evaluate(
        (p: string, schema: any) => (window as any).promptSession(p, schema),
        promptText,
        RESPONSE_SCHEMA
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
        `[bridge] ERROR stream: ${streamResult.error}\n${streamResult.stack || ''}\n`
      );
      if (setupStreaming && isStreaming && !res.writableEnded) {
        try {
          res.write(`data: ${JSON.stringify({
            id: chatId, object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000), model: modelName,
            choices: [{ index: 0, delta: {}, finish_reason: "error" }],
            usage: {
              prompt_tokens: this.lastPromptTokens,
              completion_tokens: this.lastCompletionTokens,
              total_tokens: this.lastPromptTokens + this.lastCompletionTokens,
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
              message: { role: "assistant", content: streamResult.error },
              finish_reason: "error",
            }],
            usage: {
              prompt_tokens: this.lastPromptTokens,
              completion_tokens: this.lastCompletionTokens,
              total_tokens: this.lastPromptTokens + this.lastCompletionTokens,
            },
          }));
        } catch { }
      }
      return { response: "", truncated: false };
    }

    const fullResponse = streamResult.response || "";
    const wasTruncated = streamResult.truncated || false;
    return { response: fullResponse, truncated: wasTruncated };
  }

  // ═════════════════════════════════════════════════════════════════════
  // Step 8: Parse and validate the model response
  // ═════════════════════════════════════════════════════════════════════

  private parseResponse(
    fullResponse: string,
    knownTools: Array<{ name: string; params: string[] }>,
    wasTruncated = false
  ): { textContent: string; funcCalls: Array<{ name: string; arguments: Record<string, any> }> } {
    let textContent = "";
    const funcCalls: Array<{ name: string; arguments: Record<string, any> }> = [];

    this.lastParseError = "";
    const parsed = extractJson(fullResponse);
    if (!parsed) {
      process.stderr.write(
        `[bridge] JSON parse failed (${fullResponse.length} chars, truncated=${wasTruncated}): ${fullResponse.substring(0, 200)}\n`
      );
      if (wasTruncated) {
        this.lastParseError =
          "Your response was cut off — you generated too much whitespace (indentation). " +
          "Write shorter content. Only 2-4 lines per Write, 1-2 lines per Edit.";
      } else {
        this.lastParseError =
          "Your last response was invalid JSON. Use \\n for newlines and \" for quotes inside strings.";
      }
      return { textContent: "", funcCalls: [] };
    }

    if (parsed.text) textContent = parsed.text;

    if (parsed.tool_calls && Array.isArray(parsed.tool_calls)) {
      for (const tc of parsed.tool_calls) {
        if (!tc.name || !tc.arguments) continue;

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
          prompt_tokens: this.lastPromptTokens,
          completion_tokens: this.lastCompletionTokens,
          total_tokens: this.lastPromptTokens + this.lastCompletionTokens,
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
        }],
        usage: {
          prompt_tokens: this.lastPromptTokens,
          completion_tokens: this.lastCompletionTokens,
          total_tokens: this.lastPromptTokens + this.lastCompletionTokens,
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
  ): void {
    if (!res.headersSent) {
      res.writeHead(200, STREAM_HEADERS);
    }

    const writeData = (data: any) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    const created = Math.floor(Date.now() / 1000);

    if (funcCalls.length > 0) {
      if (textContent) {
        writeData({
          id: chatId, object: "chat.completion.chunk", created, model: modelName,
          choices: [{ index: 0, delta: { role: "assistant", content: textContent }, finish_reason: null }],
        });
      }
      for (const fc of funcCalls) {
        const toolId = "call_" + randomBytes(6).toString("hex");
        writeData({
          id: chatId, object: "chat.completion.chunk", created, model: modelName,
          choices: [{
            index: 0,
            delta: {
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
          prompt_tokens: this.lastPromptTokens,
          completion_tokens: this.lastCompletionTokens,
          total_tokens: this.lastPromptTokens + this.lastCompletionTokens,
        },
      });
    } else if (textContent) {
      writeData({
        id: chatId, object: "chat.completion.chunk", created, model: modelName,
        choices: [{ index: 0, delta: { role: "assistant", content: textContent }, finish_reason: null }],
      });
      writeData({
        id: chatId, object: "chat.completion.chunk", created, model: modelName,
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
        usage: {
          prompt_tokens: this.lastPromptTokens,
          completion_tokens: this.lastCompletionTokens,
          total_tokens: this.lastPromptTokens + this.lastCompletionTokens,
        },
      });
    } else {
      writeData({
        id: chatId, object: "chat.completion.chunk", created, model: modelName,
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
        usage: {
          prompt_tokens: this.lastPromptTokens,
          completion_tokens: this.lastCompletionTokens,
          total_tokens: this.lastPromptTokens + this.lastCompletionTokens,
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
  ): void {
    const created = Math.floor(Date.now() / 1000);
    const message: Record<string, any> = { role: "assistant" };

    if (textContent) message.content = textContent;

    if (funcCalls.length > 0) {
      message.tool_calls = funcCalls.map((fc) => ({
        id: "call_" + randomBytes(6).toString("hex"),
        type: "function",
        function: { name: fc.name, arguments: JSON.stringify(fc.arguments) },
      }));
    }

    const finishReason = funcCalls.length > 0 ? "tool_calls" : "stop";

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      id: chatId,
      object: "chat.completion",
      created,
      model: modelName,
      choices: [{ index: 0, message, finish_reason: finishReason }],
      usage: {
        prompt_tokens: this.lastPromptTokens,
        completion_tokens: this.lastCompletionTokens,
        total_tokens: this.lastPromptTokens + this.lastCompletionTokens,
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
