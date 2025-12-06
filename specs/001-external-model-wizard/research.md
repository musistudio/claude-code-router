# Research: External Model Configuration Wizard

**Feature**: `001-external-model-wizard`
**Date**: 2025-12-06
**Status**: Research Complete

## Overview

This document contains research findings for implementing the External Model Configuration Wizard feature. All unknowns from the Technical Context section have been resolved through codebase analysis and external documentation review.

---

## 1. Provider Configuration Reference

### 1.1 Gemini (Google AI)

**API Base URL**: `https://generativelanguage.googleapis.com/v1beta`

**Authentication**:
- Method: API Key in URL parameter
- Format: `?key={API_KEY}` appended to request URL
- Header alternative: `x-goog-api-key: {API_KEY}`

**Default Models** (recommended):
1. `gemini-1.5-flash` - Fast, efficient model for most tasks
2. `gemini-1.5-pro` - Advanced reasoning and complex tasks
3. `gemini-pro` - Stable production model (older generation)

**Provider Configuration Template**:
```json
{
  "name": "Gemini",
  "api_base_url": "https://generativelanguage.googleapis.com/v1beta",
  "models": ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-pro"]
}
```

**API Key Acquisition**: https://makersuite.google.com/app/apikey

**Notes**:
- Gemini API uses OpenAI-compatible `/chat/completions` endpoint structure
- Supports streaming responses (SSE format)
- Free tier available with rate limits

### 1.2 Qwen (Alibaba Cloud DashScope)

**API Base URL**: `https://dashscope.aliyuncs.com/compatible-mode/v1`

**Authentication**:
- Method: Bearer token in Authorization header
- Format: `Authorization: Bearer {API_KEY}`

**Default Models** (recommended):
1. `qwen-turbo` - Fast, cost-effective model
2. `qwen-plus` - Enhanced capabilities, better reasoning
3. `qwen-max` - Most capable Qwen model

**Provider Configuration Template**:
```json
{
  "name": "Qwen",
  "api_base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
  "models": ["qwen-turbo", "qwen-plus", "qwen-max"]
}
```

**API Key Acquisition**: https://dashscope.console.aliyun.com/

**Notes**:
- Qwen uses OpenAI-compatible API format via `compatible-mode` endpoint
- Requires Alibaba Cloud account
- Supports streaming responses (SSE format)

---

## 2. Request/Response Handling Patterns

### 2.1 Message Content Detection

**Source File**: `src/index.ts` (Fastify preHandler hook)

**Request Structure** (Anthropic API `/v1/messages` format):
```typescript
interface AnthropicRequest {
  model: string;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string | Array<ContentBlock>;
  }>;
  max_tokens: number;
  system?: string;
  // ... other fields
}
```

**Message Content Extraction**:
```typescript
// From src/index.ts preHandler
const body = req.body as any;
const messages = body.messages || [];

// Get last user message
const lastUserMessage = messages
  .filter((m: any) => m.role === 'user')
  .pop();

// Extract text content
let messageContent = '';
if (typeof lastUserMessage?.content === 'string') {
  messageContent = lastUserMessage.content;
} else if (Array.isArray(lastUserMessage?.content)) {
  // Handle content blocks (text, image, etc.)
  const textBlocks = lastUserMessage.content
    .filter((block: any) => block.type === 'text');
  messageContent = textBlocks
    .map((block: any) => block.text)
    .join(' ');
}
```

**Slash Command Detection Pattern**:
```typescript
// Detect /external-model command
const isWizardCommand = messageContent.trim().startsWith('/external-model');

// Also handle /cancel
const isCancelCommand = messageContent.trim().startsWith('/cancel');
```

**Decision**: Use exact prefix match on trimmed content (case-sensitive)

### 2.2 ConversationId Extraction

**Analysis**: Anthropic API `/v1/messages` requests do NOT include a conversationId in the standard request format.

**Options Considered**:
1. **Request ID**: Use Fastify's `req.id` (unique per request, not per conversation)
2. **Session ID**: Extract from custom headers (e.g., `x-session-id`)
3. **Generated Hash**: Hash first user message + timestamp
4. **IP + User Agent**: Combine to create pseudo-session identifier

**Decision**: Use request ID for wizard session tracking, with the following rationale:
- Wizard is single-request-per-step (stateless between HTTP requests)
- Each wizard step is a separate HTTP request
- Solution: Store wizard state with a generated session ID passed back in responses

**Revised Approach**:
- On `/external-model` trigger: Generate UUID as `wizardSessionId`
- Include `wizardSessionId` in wizard response metadata
- Client includes `wizardSessionId` in subsequent requests via custom header: `x-wizard-session`
- Fallback: If no header, treat as new wizard session

**Implementation**:
```typescript
import { randomUUID } from 'crypto';

// Generate session ID
const wizardSessionId = req.headers['x-wizard-session'] as string
  || randomUUID();

// Include in response metadata (for client to echo back)
response.headers['x-wizard-session'] = wizardSessionId;
```

**Limitation**: Claude Code CLI may not preserve custom headers between requests. If headers are not supported, wizard will restart on each message. This is acceptable for MVP (user can complete wizard in rapid succession).

**Alternative for Production**: Implement session tracking via request IP + message history hash if header passing is unreliable.

### 2.3 SSE Response Format

**Source File**: `src/utils/SSESerializer.transform.ts`

**Existing SSE Format** (Anthropic API streaming response):
```
event: message_start
data: {"type":"message_start","message":{"id":"msg_123","type":"message","role":"assistant","content":[],"model":"claude-3-5-sonnet-20241022"}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}

event: message_stop
data: {"type":"message_stop"}
```

**Wizard Response Pattern** (non-streaming for simplicity):
```typescript
// Simple text response (non-streaming)
const wizardResponse = {
  id: randomUUID(),
  type: 'message',
  role: 'assistant',
  content: [{
    type: 'text',
    text: 'Select Provider:\n1. Gemini\n2. Qwen'
  }],
  model: 'wizard',
  stop_reason: 'end_turn',
  usage: { input_tokens: 0, output_tokens: 0 }
};

// Return as JSON (not SSE for wizard)
reply.send(wizardResponse);
```

**Decision**: Wizard will return standard Anthropic API JSON response (non-streaming) for simplicity. This matches the expected response format and avoids SSE complexity for interactive prompts.

**Interceptor Response Strategy**:
1. Detect wizard command in preHandler
2. Process wizard step (synchronously)
3. Generate Anthropic-compatible JSON response
4. Call `reply.send(wizardResponse)` and return (short-circuit pipeline)

---

## 3. State Management Best Practices

### 3.1 TTL Cleanup Implementation

**Pattern**: Use Map with periodic cleanup via setInterval

**Implementation**:
```typescript
class WizardManager {
  private sessions = new Map<string, WizardState>();
  private cleanupInterval: NodeJS.Timeout;
  private readonly SESSION_TTL_MS = 15 * 60 * 1000; // 15 minutes
  private readonly CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

  constructor() {
    // Start cleanup job
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions();
    }, this.CLEANUP_INTERVAL_MS);
  }

  cleanupExpiredSessions(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [sessionId, state] of this.sessions.entries()) {
      const age = now - state.createdAt.getTime();
      if (age > this.SESSION_TTL_MS) {
        this.sessions.delete(sessionId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`Cleaned up ${cleanedCount} expired wizard sessions`);
    }
  }

  shutdown(): void {
    // Clean up interval on server shutdown
    clearInterval(this.cleanupInterval);
  }
}
```

**Best Practices**:
- Use `setInterval` for periodic cleanup (not per-operation cleanup)
- Keep TTL generous (15 minutes) to avoid interrupting active users
- Cleanup interval shorter than TTL (5 minutes) for regular maintenance
- Provide explicit shutdown method to clear interval

### 3.2 Memory Leak Prevention

**Strategies**:
1. **TTL-based expiration**: Automatic cleanup of old sessions
2. **Max sessions limit**: Cap total sessions (e.g., 100 max)
3. **Completion cleanup**: Delete session immediately on wizard completion
4. **Cancel cleanup**: Delete session immediately on `/cancel`

**Implementation**:
```typescript
class WizardManager {
  private readonly MAX_SESSIONS = 100;

  startWizard(sessionId: string): string {
    // Enforce max sessions
    if (this.sessions.size >= this.MAX_SESSIONS) {
      // Remove oldest session
      const oldestSession = Array.from(this.sessions.entries())
        .sort((a, b) => a[1].createdAt.getTime() - b[1].createdAt.getTime())[0];
      this.sessions.delete(oldestSession[0]);
    }

    // Create new session
    this.sessions.set(sessionId, {
      conversationId: sessionId,
      currentStep: WizardStep.MENU,
      selectedProvider: null,
      apiKey: null,
      createdAt: new Date(),
      retryCount: 0
    });

    return this.getMenuPrompt();
  }

  async completeWizard(sessionId: string): Promise<void> {
    // ... save config ...

    // Immediately clean up session
    this.sessions.delete(sessionId);
  }
}
```

### 3.3 Concurrent Wizard Session Handling

**Scenario**: Multiple users (or same user in multiple terminal windows) run wizard simultaneously.

**Approach**: Each session is independent, keyed by unique `wizardSessionId`

**Concurrency Safety**:
- Map is not thread-safe, but Node.js is single-threaded (event loop)
- No locking needed for Map operations
- ConfigManager must use atomic file writes to prevent config corruption

**Race Condition**: Two wizards completing simultaneously

**Mitigation**:
```typescript
// In ConfigManager.upsertProvider()
import { mkdir, writeFile, rename } from 'fs/promises';
import { lock } from 'proper-lockfile'; // Optional: file locking library

async upsertProvider(provider: ProviderConfig): Promise<void> {
  // Simple approach: atomic write with temp file
  const configPath = this.getConfigPath();
  const tempPath = `${configPath}.tmp.${Date.now()}`;

  try {
    // Read current config
    const config = await this.readConfig();

    // Modify in-memory
    const existingIndex = config.Providers.findIndex(
      p => p.name === provider.name
    );
    if (existingIndex >= 0) {
      config.Providers[existingIndex] = provider;
    } else {
      config.Providers.push(provider);
    }

    // Write to temp file
    await writeFile(tempPath, JSON.stringify(config, null, 2), 'utf-8');

    // Atomic rename (OS-level atomic operation)
    await rename(tempPath, configPath);

  } catch (error) {
    // Clean up temp file on error
    try { await unlink(tempPath); } catch {}
    throw error;
  }
}
```

**Decision**: Rely on atomic rename for config safety. For production, consider file locking library (`proper-lockfile`) if simultaneous config updates are common.

---

## 4. Integration Points

### 4.1 Existing Config Management

**File**: `src/utils/index.ts`

**Existing Functions**:
- `readConfigFile()`: Reads and parses JSON5 config with env var interpolation
- `writeConfigFile()`: Writes config (currently used by web UI)
- `backupConfigFile()`: Creates timestamped backups, keeps last 3

**Reuse Strategy**:
- Use existing `readConfigFile()` for reading
- Use existing `backupConfigFile()` before writes
- Extend/wrap `writeConfigFile()` for atomic writes

**New ConfigManager Integration**:
```typescript
import { readConfigFile, backupConfigFile } from './index';

class ConfigManager implements IConfigManager {
  async readConfig(): Promise<ConfigFile> {
    const config = await readConfigFile();
    return config as ConfigFile;
  }

  async backupConfig(): Promise<string> {
    return await backupConfigFile();
  }

  async upsertProvider(provider: ProviderConfig): Promise<void> {
    // Backup first
    await this.backupConfig();

    // Read current
    const config = await this.readConfig();

    // Modify
    // ... (see atomic write pattern above)

    // Write atomically
    // ...
  }
}
```

### 4.2 Server Initialization Hook

**File**: `src/index.ts` (run function)

**Existing preHandler Logic**:
```typescript
server.addHook('preHandler', async (req, reply) => {
  // 1. API key authentication
  await apiKeyAuth(req, reply);

  // 2. Agent detection
  const agent = agentsManager.getAgent(req, config);
  if (agent) {
    // Process agent request/response
  }

  // 3. Router middleware (token counting, model selection)
  const selectedModel = await router(req, config);

  // 4. Continue to upstream
});
```

**Wizard Integration Point** (add before agent detection):
```typescript
server.addHook('preHandler', async (req, reply) => {
  // 1. API key authentication
  await apiKeyAuth(req, reply);

  // 2. WIZARD INTERCEPTOR (NEW)
  if (req.url === '/v1/messages' && req.method === 'POST') {
    const body = req.body as any;
    const lastMessage = body.messages?.filter((m: any) => m.role === 'user').pop();
    const content = typeof lastMessage?.content === 'string'
      ? lastMessage.content
      : lastMessage?.content?.find((b: any) => b.type === 'text')?.text || '';

    const sessionId = (req.headers['x-wizard-session'] as string) || randomUUID();

    if (wizardManager.isWizardCommand(content) || wizardManager.hasActiveSession(sessionId)) {
      const response = await wizardManager.processInput(sessionId, content);
      reply.header('x-wizard-session', sessionId);
      reply.send(response);
      return; // Short-circuit
    }
  }

  // 3. Agent detection (existing)
  // ...
});
```

---

## 5. Summary of Decisions

| Research Area | Decision | Rationale |
|---------------|----------|-----------|
| Gemini API URL | `https://generativelanguage.googleapis.com/v1beta` | Official API endpoint, OpenAI-compatible |
| Qwen API URL | `https://dashscope.aliyuncs.com/compatible-mode/v1` | OpenAI-compatible mode for easy integration |
| ConversationId | Generate UUID, pass via `x-wizard-session` header | Anthropic API doesn't include conversation ID |
| Response Format | Standard Anthropic JSON (non-streaming) | Simpler than SSE, matches expected format |
| State Cleanup | setInterval every 5 min, 15 min TTL | Balances memory efficiency and user experience |
| Config Atomic Write | Temp file + rename pattern | OS-level atomic operation, no external deps |
| Interceptor Location | preHandler hook, before agent detection | Consistent with existing architecture |
| Session Concurrency | Independent Map entries, atomic file writes | Single-threaded Node.js, OS-level atomicity |

---

## 6. Next Steps (Phase 1)

With research complete, proceed to Phase 1 design:

1. **Create `data-model.md`**: Document WizardState, ProviderConfig, ConfigFile entities
2. **Create `contracts/`**: TypeScript interface files for WizardManager, ConfigManager
3. **Create `quickstart.md`**: User guide for `/external-model` wizard
4. **Update agent context**: Run `.specify/scripts/powershell/update-agent-context.ps1`

All unknowns resolved. Ready for Phase 1 design.
