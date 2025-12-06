# Implementation Plan: External Model Configuration Wizard

**Branch**: `001-external-model-wizard` | **Date**: 2025-12-06 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-external-model-wizard/spec.md`

**Note**: This template is filled in by the `/sp.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Implement an interactive conversational wizard accessible via the `/external-model` slash command that guides users through configuring external LLM providers (Gemini, Qwen) directly in the chat interface. The wizard will intercept the command before it reaches the LLM, present a numbered menu for provider selection, prompt for API keys, and atomically update `~/.claude-code-router/config.json` with the correct provider configuration. This eliminates manual config file editing and reduces configuration errors.

**Technical Approach**: Implement an in-memory state machine using a Map keyed by conversationId, create a dedicated ConfigManager module for atomic config.json read/write operations, and integrate a request interceptor in the existing Fastify preHandler middleware chain to capture and handle `/external-model` commands before routing to upstream providers.

## Technical Context

**Language/Version**: TypeScript 5+ with strict mode enabled (Node.js LTS v20.x)
**Primary Dependencies**: Fastify (HTTP server), JSON5 (config parsing), rotating-file-stream (logging), tiktoken (tokenization)
**Storage**: File-based configuration at `~/.claude-code-router/config.json` (JSON5 format with environment variable interpolation)
**Testing**: No existing testing framework (manual integration testing via CLI)
**Target Platform**: Node.js server (macOS, Linux, Windows)
**Project Type**: Single-project CLI/server application
**Performance Goals**: Interactive response latency <100ms per wizard step; wizard completion <60 seconds (happy path)
**Constraints**: Must maintain backwards compatibility with existing config.json format; zero downtime for non-wizard requests; atomic config writes only
**Scale/Scope**: Single-user local service; 2 supported providers initially (Gemini, Qwen); <10 wizard steps total

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### I. TypeScript Strict Mode ✅ PASS
- All code will use TypeScript with strict mode enabled
- No `any` types; all wizard state, config interfaces explicitly typed
- Wizard state interface: `WizardState`, provider config: `ProviderConfig`

### II. Async/Await Only ✅ PASS
- All file operations use `fs/promises` (readFile, writeFile, rename)
- Config manager uses async/await for atomic read-modify-write
- No callback-based patterns

### III. Graceful Error Handling ✅ PASS
- All wizard steps wrapped in try/catch with user-friendly error messages
- File system errors (ENOENT, EACCES, EISDIR) handled gracefully
- Config parse errors (invalid JSON) caught and reported
- Wizard never crashes server; errors reset wizard state for that conversation

### IV. Atomic Configuration Updates ✅ PASS
- Config manager implements: read config → modify in-memory → write to temp file → rename over original
- Uses `fs.promises.rename()` for atomic replacement
- Backup created before modification (keep last 3 backups)
- No partial writes or in-place mutations

### V. Modular Architecture ✅ PASS
- Wizard logic separated into dedicated module: `src/utils/wizardManager.ts`
- Config operations isolated in: `src/utils/configManager.ts` (extends existing utils/index.ts)
- Interceptor logic in existing: `src/index.ts` (preHandler hook)
- Clear interfaces between modules (WizardManager, ConfigManager, Server)

### VI. Interceptor Pattern ✅ PASS
- Wizard command intercepted in existing Fastify `preHandler` hook
- Detection: check for `/external-model` in message content
- Deterministic: slash command pattern matching before routing logic
- Non-intercepted commands continue normal routing flow

### VII. Wizard Pattern for Conversational State ✅ PASS
- State stored in-memory Map: `Map<conversationId, WizardState>`
- Keyed by conversationId from request metadata
- Expiration policy: TTL of 15 minutes (auto-cleanup on timeout)
- No database persistence for ephemeral wizard flows

**STATUS**: All constitutional principles satisfied. No violations requiring justification.

## Project Structure

### Documentation (this feature)

```text
specs/001-external-model-wizard/
├── plan.md              # This file (/sp.plan command output)
├── research.md          # Phase 0 output: API endpoint research, state management patterns
├── data-model.md        # Phase 1 output: WizardState, ProviderConfig, ConfigFile schemas
├── quickstart.md        # Phase 1 output: User guide for /external-model wizard
├── contracts/           # Phase 1 output: TypeScript interfaces (exported from modules)
│   ├── wizard-state.interface.ts
│   ├── provider-config.interface.ts
│   └── wizard-manager.interface.ts
└── tasks.md             # Phase 2 output (/sp.tasks command - NOT created by /sp.plan)
```

### Source Code (repository root)

```text
src/
├── index.ts                      # [MODIFIED] Add wizard interceptor to preHandler hook
├── utils/
│   ├── index.ts                  # [EXISTING] Config read/write functions (extend for atomic writes)
│   ├── wizardManager.ts          # [NEW] WizardManager class: state machine, step handlers
│   ├── configManager.ts          # [NEW] ConfigManager class: atomic config operations
│   └── providerTemplates.ts      # [NEW] Provider-specific config templates (Gemini, Qwen)
└── types/
    └── wizard.types.ts           # [NEW] Type definitions: WizardState, WizardStep, ProviderType

tests/                            # [NO CHANGES] Manual testing only (no test framework)
```

**Structure Decision**: Single-project structure (Option 1) is appropriate for this CLI/server application. New wizard functionality is isolated in dedicated modules (`wizardManager.ts`, `configManager.ts`) with minimal changes to existing server initialization (`index.ts`). All wizard-related types are co-located in `types/wizard.types.ts` for maintainability. The existing `utils/` directory pattern is extended to house wizard logic alongside other utilities like `router.ts` and `modelSelector.ts`.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations. All implementation choices align with constitutional principles.

---

## Phase 0: Research & Requirements Analysis

### Research Goals

1. **Provider API Endpoints**: Determine exact `api_base_url` values for Gemini and Qwen
2. **Default Model Identifiers**: Identify default model names/IDs for each provider
3. **Message Content Detection**: Research how to extract user message content from Anthropic API `/v1/messages` request body
4. **ConversationId Extraction**: Determine if conversationId exists in request headers/body or needs to be generated
5. **SSE Response Format**: Understand how to send wizard prompts back to Claude Code CLI as SSE chunks
6. **State Expiration Patterns**: Research TTL/cleanup patterns for in-memory Map state management

### Research Tasks

| Task | Deliverable | Status |
|------|-------------|--------|
| Research Gemini API endpoint and authentication | Exact URL format and API key usage pattern | Pending |
| Research Qwen API endpoint and authentication | Exact URL format and API key usage pattern | Pending |
| Identify default model names for Gemini (e.g., gemini-pro, gemini-1.5-flash) | List of 2-3 recommended default models | Pending |
| Identify default model names for Qwen (e.g., qwen-turbo, qwen-plus) | List of 2-3 recommended default models | Pending |
| Analyze existing request structure in `src/index.ts` preHandler | Document how to extract message content and metadata | Pending |
| Research conversationId availability in Anthropic API requests | Determine source or generation strategy | Pending |
| Review existing SSE serialization in `src/utils/SSESerializer.transform.ts` | Document how to create wizard response chunks | Pending |
| Research Node.js Map cleanup patterns with setTimeout | Best practice for TTL-based entry expiration | Pending |

### Expected Outcomes

**`research.md` file containing:**

1. **Provider Configuration Reference**
   - Gemini: `api_base_url`, authentication header format, default models
   - Qwen: `api_base_url`, authentication header format, default models

2. **Request/Response Handling Patterns**
   - How to detect `/external-model` in message content
   - ConversationId extraction or generation strategy
   - SSE response format for wizard prompts

3. **State Management Best Practices**
   - TTL cleanup implementation for Map-based state
   - Memory leak prevention strategies
   - Concurrent wizard session handling

---

## Phase 1: Design & Interface Contracts

### 1.1 Data Model (`data-model.md`)

#### Entity: WizardState

Represents the current state of a wizard session for a specific conversation.

```typescript
interface WizardState {
  conversationId: string;           // Unique identifier for the conversation
  currentStep: WizardStep;          // Current step in the wizard flow
  selectedProvider: ProviderType | null;  // User's provider selection
  apiKey: string | null;            // User's API key input (stored temporarily)
  createdAt: Date;                  // Timestamp for TTL expiration
  retryCount: number;               // Number of invalid input attempts
}

enum WizardStep {
  MENU = 'menu',                    // Showing provider selection menu
  API_KEY = 'api_key',              // Prompting for API key
  CONFIRM = 'confirm',              // Confirming configuration
  COMPLETE = 'complete'             // Wizard finished
}

enum ProviderType {
  GEMINI = 'gemini',
  QWEN = 'qwen'
}
```

**Validation Rules:**
- `conversationId`: Non-empty string, alphanumeric + hyphens
- `currentStep`: Must be one of WizardStep enum values
- `selectedProvider`: Null until user selects, then one of ProviderType enum values
- `apiKey`: Non-empty, non-whitespace-only string when collected
- `retryCount`: Integer >= 0, reset on successful step transition

**State Transitions:**
- `MENU` → `API_KEY`: Valid provider selection (1 or 2)
- `API_KEY` → `CONFIRM`: Valid API key provided
- `CONFIRM` → `COMPLETE`: User confirms, config saved successfully
- Any step → `MENU`: User sends `/cancel` or invalid input exceeds threshold

#### Entity: ProviderConfig

Represents the configuration structure for an external LLM provider.

```typescript
interface ProviderConfig {
  name: string;                     // Provider name (e.g., "Gemini", "Qwen")
  api_base_url: string;             // API endpoint base URL
  models: string[];                 // Array of model identifiers
  headers?: Record<string, string>; // Optional custom headers
}

interface ConfigFile {
  Providers: ProviderConfig[];      // Array of configured providers
  [key: string]: any;               // Other existing config properties
}
```

**Validation Rules:**
- `api_base_url`: Valid HTTPS URL format
- `models`: Non-empty array of strings
- `name`: Non-empty string, unique within Providers array

#### Entity: ProviderTemplate

Pre-defined configuration templates for supported providers.

```typescript
interface ProviderTemplate {
  providerType: ProviderType;
  name: string;
  api_base_url: string;
  models: string[];
  apiKeyPlaceholder: string;        // Placeholder text for API key prompt
  configInstructions: string;       // URL or text for getting API keys
}
```

### 1.2 API Contracts (`contracts/`)

#### WizardManager Interface

**File**: `contracts/wizard-manager.interface.ts`

```typescript
export interface IWizardManager {
  /**
   * Check if a message triggers wizard handling
   * @param messageContent - User message text
   * @returns true if message is /external-model command
   */
  isWizardCommand(messageContent: string): boolean;

  /**
   * Process user input for active wizard session
   * @param conversationId - Unique conversation identifier
   * @param userInput - User's message content
   * @returns Wizard response message to display
   */
  processInput(conversationId: string, userInput: string): Promise<string>;

  /**
   * Initialize new wizard session
   * @param conversationId - Unique conversation identifier
   * @returns Initial wizard prompt (provider menu)
   */
  startWizard(conversationId: string): string;

  /**
   * Clean up expired wizard sessions (TTL-based)
   */
  cleanupExpiredSessions(): void;

  /**
   * Cancel wizard session for conversation
   * @param conversationId - Unique conversation identifier
   */
  cancelWizard(conversationId: string): void;
}
```

#### ConfigManager Interface

**File**: `contracts/config-manager.interface.ts`

```typescript
export interface IConfigManager {
  /**
   * Add or update provider configuration atomically
   * @param provider - Provider configuration to add/update
   * @throws Error if file operations fail
   */
  upsertProvider(provider: ProviderConfig): Promise<void>;

  /**
   * Read current configuration file
   * @returns Parsed configuration object
   * @throws Error if file doesn't exist or invalid JSON
   */
  readConfig(): Promise<ConfigFile>;

  /**
   * Create backup of current config file
   * @returns Path to backup file
   */
  backupConfig(): Promise<string>;

  /**
   * Validate configuration structure
   * @param config - Configuration object to validate
   * @returns true if valid, throws Error otherwise
   */
  validateConfig(config: ConfigFile): boolean;
}
```

### 1.3 Quickstart Guide (`quickstart.md`)

**User Guide: Configuring External LLM Providers**

1. **Start the wizard**: Type `/external-model` in the chat
2. **Select provider**: Reply with `1` (Gemini) or `2` (Qwen)
3. **Enter API key**: Paste your provider API key when prompted
4. **Confirm**: Review configuration and confirm
5. **Restart**: Restart the claude-code-router service for changes to take effect

**Getting API Keys:**
- Gemini: Visit [Google AI Studio](https://makersuite.google.com/app/apikey)
- Qwen: Visit [Alibaba Cloud Console](https://dashscope.console.aliyun.com/)

**Troubleshooting:**
- To cancel wizard: Type `/cancel` at any step
- Invalid input: Wizard will re-prompt up to 3 times
- File errors: Check `~/.claude-code-router/` directory permissions

---

## Phase 2: Implementation Phases (High-Level)

**Note**: Detailed tasks will be generated by `/sp.tasks` command. This section outlines the implementation approach.

### Phase 2.1: Config Manager Foundation

**Goal**: Build atomic configuration read/write infrastructure

**Key Modules**: `src/utils/configManager.ts`

**Approach**:
1. Extend existing `readConfigFile()` in `src/utils/index.ts` for atomic writes
2. Implement temp file + rename pattern for atomicity
3. Add backup creation (keep last 3 backups)
4. Add config validation before writes
5. Handle file system errors gracefully (ENOENT, EACCES, EISDIR)

**Deliverables**:
- `ConfigManager` class with `upsertProvider()`, `readConfig()`, `backupConfig()`, `validateConfig()` methods
- Unit tests for atomic write scenarios
- Error handling for all file operations

### Phase 2.2: Wizard State Machine

**Goal**: Implement in-memory wizard state management and step handlers

**Key Modules**: `src/utils/wizardManager.ts`, `src/utils/providerTemplates.ts`, `src/types/wizard.types.ts`

**Approach**:
1. Define TypeScript types: `WizardState`, `WizardStep`, `ProviderType`
2. Implement `WizardManager` class with Map-based state storage
3. Create provider templates for Gemini and Qwen (api_base_url, default models)
4. Implement step handlers:
   - `handleMenuStep()`: Validate provider selection (1 or 2)
   - `handleApiKeyStep()`: Validate API key (non-empty)
   - `handleConfirmStep()`: Call ConfigManager to save, return success message
5. Implement TTL cleanup with `setInterval()` (check every 5 minutes, expire after 15 minutes)
6. Add `/cancel` command detection at all steps

**Deliverables**:
- `WizardManager` class with state machine logic
- Provider templates for Gemini and Qwen
- TTL-based session cleanup
- Cancel command handling

### Phase 2.3: Request Interceptor Integration

**Goal**: Hook wizard into Fastify request pipeline

**Key Modules**: `src/index.ts` (modify existing preHandler hook)

**Approach**:
1. Import `WizardManager` singleton instance
2. In `preHandler` hook (before agent processing):
   - Extract message content from request body
   - Check if message is `/external-model` command
   - If yes: call `wizardManager.startWizard(conversationId)` or `wizardManager.processInput(conversationId, messageContent)`
   - Generate SSE response with wizard prompt
   - Short-circuit request (prevent upstream routing)
3. Extract or generate conversationId from request metadata
4. Handle SSE response formatting using existing `SSESerializerTransform`

**Deliverables**:
- Modified `src/index.ts` with wizard interceptor
- ConversationId extraction logic
- SSE response generation for wizard prompts

### Phase 2.4: Testing & Polish

**Goal**: Manual integration testing and user experience refinement

**Approach**:
1. Test happy path: `/external-model` → select Gemini → enter API key → confirm → verify config.json
2. Test error cases:
   - Invalid menu selection (0, 3, abc)
   - Empty API key input
   - Whitespace-only API key
   - `/cancel` at each step
   - Missing config directory
   - Read-only config file
   - Invalid JSON in existing config
3. Test concurrent wizards (multiple conversations)
4. Test TTL expiration (wait 15+ minutes)
5. Verify API key masking in logs
6. Test restart requirement messaging

**Deliverables**:
- Test script or manual test checklist
- Bug fixes for identified issues
- User-facing error message refinements

---

## Architectural Decisions (ADR Candidates)

### Decision 1: In-Memory State vs. Database for Wizard Sessions

**Context**: Wizard sessions need to persist across multiple request/response cycles for the same conversation.

**Decision**: Use in-memory Map keyed by conversationId with TTL-based expiration.

**Rationale**:
- Wizard sessions are ephemeral (15-minute lifespan typical)
- Single-user local service (no distributed state requirements)
- Low latency (<100ms response time) critical for interactive wizard
- Database adds complexity (setup, migrations, queries) without clear benefit
- Memory footprint minimal (2-3 active wizards = ~1KB total)

**Alternatives Considered**:
1. **SQLite database**: Adds persistence but requires schema migrations, query overhead (~10-20ms), cleanup jobs
2. **File-based state** (JSON): Requires atomic read/write on every step, introduces file I/O latency
3. **No state** (stateless wizard): Would require encoding state in messages, complex and brittle

**Consequences**:
- Wizard state lost on server restart (acceptable for configuration wizard)
- Must implement TTL cleanup to prevent memory leaks
- Cannot resume wizard after 15-minute timeout (user must restart)

**Significance Test**:
- ✅ Impact: Affects wizard reliability and performance
- ✅ Alternatives: 3 viable options considered
- ✅ Scope: Cross-cutting decision affecting state management pattern

**ADR Suggestion**: 📋 Architectural decision detected: In-memory wizard state with TTL expiration — Document reasoning and tradeoffs? Run `/sp.adr in-memory-wizard-state`

### Decision 2: Restart Required After Configuration Changes

**Context**: Provider configuration changes require reloading the provider registry and models.

**Decision**: Require manual service restart after wizard completion (do not implement hot-reload).

**Rationale**:
- Configuration changes are infrequent (typically once during initial setup)
- Hot-reloading provider configs requires:
  - Graceful connection draining for in-flight requests
  - Provider re-initialization logic
  - Potential race conditions between old/new provider instances
- Restart is simple, reliable, and well-understood by users
- Complexity cost of hot-reload outweighs rare-use-case benefit

**Alternatives Considered**:
1. **Hot-reload providers**: Requires config file watching, provider lifecycle management, complex error handling
2. **Auto-restart service**: Requires process management (systemd, pm2), platform-specific

**Consequences**:
- User must manually run `ccr restart` or `ccr stop && ccr start`
- Brief downtime (~1-2 seconds) during restart
- Simpler implementation (no config watching or lifecycle management)

**Significance Test**:
- ✅ Impact: Affects user workflow and system architecture
- ✅ Alternatives: 2 simpler/more complex options considered
- ✅ Scope: Influences config management and provider initialization

**ADR Suggestion**: 📋 Architectural decision detected: Manual restart required for config changes — Document reasoning and tradeoffs? Run `/sp.adr manual-restart-requirement`

### Decision 3: Slash Command Detection in Message Content

**Context**: Need to detect `/external-model` command in user messages to trigger wizard.

**Decision**: Intercept in Fastify `preHandler` hook by pattern-matching message content for exact string `/external-model`.

**Rationale**:
- Existing architecture uses `preHandler` hook for agent detection and routing
- Message content is already extracted from request body at this point
- Simple string matching (no regex complexity needed)
- Allows interception before agent processing or upstream routing
- Consistent with existing interceptor pattern

**Alternatives Considered**:
1. **Agent-based detection**: Implement as IAgent with `shouldHandle()` - adds unnecessary abstraction for simple command
2. **Dedicated middleware**: Separate Fastify plugin - increases indirection for single-purpose interceptor
3. **Post-LLM processing**: Detect in LLM response - too late, command would be sent to upstream

**Consequences**:
- Wizard detection logic lives in `src/index.ts` preHandler
- Must ensure wizard check happens before agent processing
- Pattern matching must handle case sensitivity and whitespace

**Significance Test**:
- ❌ Impact: Localized to wizard feature, no system-wide implications
- ❌ Alternatives: Only 1 other viable option (Agent-based)
- ❌ Scope: Feature-specific, not cross-cutting

**ADR Suggestion**: Not architecturally significant (localized implementation detail)
