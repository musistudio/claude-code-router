# Data Model: External Model Configuration Wizard

**Feature**: `001-external-model-wizard`
**Date**: 2025-12-06

## Overview

This document defines the core data entities, their relationships, validation rules, and state transitions for the External Model Configuration Wizard feature.

---

## Entity Definitions

### 1. WizardState

**Purpose**: Represents the runtime state of an active wizard session for a specific user conversation.

**Schema**:
```typescript
interface WizardState {
  sessionId: string;                    // Unique identifier for wizard session (UUID)
  currentStep: WizardStep;              // Current step in wizard flow
  selectedProvider: ProviderType | null; // User's provider selection (null until selected)
  apiKey: string | null;                // User's API key input (temporary, cleared after save)
  createdAt: Date;                      // Session creation timestamp (for TTL expiration)
  retryCount: number;                   // Count of invalid input attempts at current step
}
```

**Field Constraints**:

| Field | Type | Required | Validation | Default |
|-------|------|----------|------------|---------|
| sessionId | string | Yes | Non-empty, UUID format | Generated via `randomUUID()` |
| currentStep | WizardStep | Yes | One of: MENU, API_KEY, CONFIRM, COMPLETE | MENU |
| selectedProvider | ProviderType \| null | No | One of: GEMINI, QWEN, or null | null |
| apiKey | string \| null | No | Non-empty, non-whitespace when collected | null |
| createdAt | Date | Yes | Valid Date object | `new Date()` on creation |
| retryCount | number | Yes | Integer >= 0, max 3 | 0 |

**Validation Rules**:
1. `sessionId` must be valid UUID format (8-4-4-4-12 hex digits)
2. `currentStep` must be one of the WizardStep enum values
3. `selectedProvider` must be null OR one of ProviderType enum values
4. `apiKey` when non-null must satisfy: `apiKey.trim().length > 0`
5. `retryCount` must be 0 <= retryCount <= 3 (exceeding 3 resets wizard)

**State Transitions**:
```
[Start] → MENU
  ├─ Valid selection (1 or 2) → API_KEY
  ├─ Invalid selection → MENU (retryCount++)
  └─ /cancel → [End Session]

MENU → API_KEY
  ├─ Valid API key (non-empty) → CONFIRM
  ├─ Invalid API key (empty/whitespace) → API_KEY (retryCount++)
  └─ /cancel → [End Session]

API_KEY → CONFIRM
  ├─ User confirms (y/yes) → COMPLETE → [End Session]
  ├─ User cancels (n/no) → MENU (reset state)
  └─ /cancel → [End Session]

CONFIRM → COMPLETE
  └─ Config saved successfully → [End Session, delete state]

Any Step → TTL Expired (15 min) → [End Session]
Any Step → retryCount > 3 → MENU (reset retryCount)
```

**Lifecycle**:
- **Creation**: On first `/external-model` detection
- **Update**: On each valid user input advancing step
- **Expiration**: 15 minutes of inactivity (TTL)
- **Deletion**: On wizard completion, cancellation, or TTL expiration

---

### 2. WizardStep

**Purpose**: Enum defining the possible steps in the wizard flow.

**Schema**:
```typescript
enum WizardStep {
  MENU = 'menu',           // Displaying provider selection menu
  API_KEY = 'api_key',     // Prompting for API key input
  CONFIRM = 'confirm',     // Confirming configuration before save
  COMPLETE = 'complete'    // Wizard successfully completed
}
```

**Step Descriptions**:

| Step | Description | User Prompt | Valid Inputs |
|------|-------------|-------------|--------------|
| MENU | Provider selection | "Select Provider:\n1. Gemini\n2. Qwen" | "1", "2", "/cancel" |
| API_KEY | API key collection | "Enter your {provider} API key:" | Any non-empty string, "/cancel" |
| CONFIRM | Final confirmation | "Save {provider} config?\n(y)es / (n)o" | "y", "yes", "n", "no", "/cancel" |
| COMPLETE | Success message | "✓ Config saved. Restart to apply changes." | N/A (session ends) |

---

### 3. ProviderType

**Purpose**: Enum identifying supported external LLM providers.

**Schema**:
```typescript
enum ProviderType {
  GEMINI = 'gemini',
  QWEN = 'qwen'
}
```

**Provider Mappings**:

| ProviderType | Display Name | Menu Number |
|--------------|--------------|-------------|
| GEMINI | "Gemini" | 1 |
| QWEN | "Qwen" | 2 |

---

### 4. ProviderConfig

**Purpose**: Represents a complete configuration for an external LLM provider to be stored in config.json.

**Schema**:
```typescript
interface ProviderConfig {
  name: string;                         // Provider display name (e.g., "Gemini")
  api_base_url: string;                 // API endpoint base URL
  models: string[];                     // Array of model identifiers
  headers?: Record<string, string>;     // Optional custom request headers
}
```

**Field Constraints**:

| Field | Type | Required | Validation | Example |
|-------|------|----------|------------|---------|
| name | string | Yes | Non-empty, unique in Providers array | "Gemini" |
| api_base_url | string | Yes | Valid HTTPS URL | "https://generativelanguage.googleapis.com/v1beta" |
| models | string[] | Yes | Non-empty array of strings | ["gemini-1.5-flash"] |
| headers | object | No | Key-value pairs (string: string) | {"x-api-version": "1"} |

**Validation Rules**:
1. `name` must be non-empty string, unique within config.Providers array
2. `api_base_url` must match regex: `^https:\/\/.+`
3. `models` must be non-empty array (length >= 1)
4. `models` entries must be non-empty strings

**Provider Templates** (pre-defined):
```typescript
const GEMINI_CONFIG: ProviderConfig = {
  name: "Gemini",
  api_base_url: "https://generativelanguage.googleapis.com/v1beta",
  models: ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-pro"]
};

const QWEN_CONFIG: ProviderConfig = {
  name: "Qwen",
  api_base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  models: ["qwen-turbo", "qwen-plus", "qwen-max"]
};
```

---

### 5. ConfigFile

**Purpose**: Represents the complete structure of `~/.claude-code-router/config.json`.

**Schema**:
```typescript
interface ConfigFile {
  Providers: ProviderConfig[];          // Array of configured providers
  Router?: {                            // Optional routing configuration
    default?: string;
    think?: string;
    webSearch?: string;
    longContext?: string;
    // ... other router fields
  };
  [key: string]: any;                   // Other existing config properties
}
```

**Field Constraints**:

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| Providers | ProviderConfig[] | Yes | Array, can be empty initially |
| Router | object | No | Valid router configuration |
| * | any | No | Preserve all other existing fields |

**Validation Rules**:
1. `Providers` must be an array (can be empty)
2. Each item in `Providers` must satisfy ProviderConfig validation
3. Provider names must be unique within Providers array
4. All other existing config fields must be preserved during updates

**Update Strategy** (upsert):
```typescript
// Pseudocode for ConfigManager.upsertProvider()
function upsertProvider(newProvider: ProviderConfig) {
  const config = readConfig();

  // Find existing provider by name
  const existingIndex = config.Providers.findIndex(
    p => p.name === newProvider.name
  );

  if (existingIndex >= 0) {
    // Update existing
    config.Providers[existingIndex] = newProvider;
  } else {
    // Add new
    config.Providers.push(newProvider);
  }

  // Atomic write
  writeConfigAtomic(config);
}
```

---

### 6. ProviderTemplate

**Purpose**: Internal data structure for pre-defined provider configurations used by wizard.

**Schema**:
```typescript
interface ProviderTemplate {
  providerType: ProviderType;           // Enum identifier
  config: ProviderConfig;               // Provider configuration
  apiKeyPrompt: string;                 // Custom prompt text for API key step
  apiKeyInstructions: string;           // URL or instructions for obtaining API key
}
```

**Example Templates**:
```typescript
const PROVIDER_TEMPLATES: Record<ProviderType, ProviderTemplate> = {
  [ProviderType.GEMINI]: {
    providerType: ProviderType.GEMINI,
    config: {
      name: "Gemini",
      api_base_url: "https://generativelanguage.googleapis.com/v1beta",
      models: ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-pro"]
    },
    apiKeyPrompt: "Enter your Gemini API key:",
    apiKeyInstructions: "Get your API key at: https://makersuite.google.com/app/apikey"
  },
  [ProviderType.QWEN]: {
    providerType: ProviderType.QWEN,
    config: {
      name: "Qwen",
      api_base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      models: ["qwen-turbo", "qwen-plus", "qwen-max"]
    },
    apiKeyPrompt: "Enter your Qwen API key:",
    apiKeyInstructions: "Get your API key at: https://dashscope.console.aliyun.com/"
  }
};
```

---

## Relationships

```
┌─────────────────┐
│  WizardState    │
│  - sessionId    │──────┐
│  - currentStep  │      │ references
│  - provider     │──────┼────────────────┐
│  - apiKey       │      │                │
│  - createdAt    │      │                ▼
│  - retryCount   │      │     ┌──────────────────┐
└─────────────────┘      │     │  ProviderType    │
                         │     │  - GEMINI        │
                         │     │  - QWEN          │
     manages             │     └──────────────────┘
        │                │                │
        ▼                │                │ used by
┌─────────────────┐     │                ▼
│ WizardManager   │     │     ┌──────────────────────┐
│ - sessions Map  │     │     │  ProviderTemplate    │
│ - cleanupTimer  │     │     │  - providerType      │
└─────────────────┘     │     │  - config            │
                        │     │  - apiKeyPrompt      │
        │               │     └──────────────────────┘
        │ calls         │                │
        ▼               │                │ contains
┌─────────────────┐    │                ▼
│ ConfigManager   │    │     ┌──────────────────┐
│ - readConfig    │────┘     │  ProviderConfig  │
│ - upsertProvider│─────────▶│  - name          │
│ - backupConfig  │          │  - api_base_url  │
└─────────────────┘          │  - models        │
        │                    └──────────────────┘
        │ modifies                    │
        ▼                             │
┌─────────────────┐                  │
│   ConfigFile    │                  │
│  - Providers[]  │─────contains─────┘
│  - Router       │
│  - ...          │
└─────────────────┘
```

---

## Validation Summary

### Input Validation

**Menu Selection**:
```typescript
function validateMenuSelection(input: string): ProviderType | null {
  const trimmed = input.trim();
  if (trimmed === '1') return ProviderType.GEMINI;
  if (trimmed === '2') return ProviderType.QWEN;
  return null; // Invalid
}
```

**API Key Validation**:
```typescript
function validateApiKey(input: string): boolean {
  return input.trim().length > 0;
}
```

**Confirmation Validation**:
```typescript
function validateConfirmation(input: string): boolean | null {
  const trimmed = input.trim().toLowerCase();
  if (trimmed === 'y' || trimmed === 'yes') return true;
  if (trimmed === 'n' || trimmed === 'no') return false;
  return null; // Invalid
}
```

### State Validation

**WizardState Invariants**:
1. If `currentStep === API_KEY`, then `selectedProvider !== null`
2. If `currentStep === CONFIRM`, then `selectedProvider !== null && apiKey !== null`
3. `retryCount` is reset to 0 on successful step transition
4. `createdAt` never changes after initial creation

### Config Validation

**ConfigFile Invariants**:
1. `Providers` is always an array (never undefined/null)
2. Provider names are unique (no duplicates)
3. All providers have valid `api_base_url` (HTTPS URLs)
4. All providers have at least one model

---

## Error Handling

### Invalid Input Handling

| Error Condition | Response | Action |
|----------------|----------|--------|
| Invalid menu selection | "Invalid selection. Please enter 1 or 2." | Increment retryCount, re-prompt |
| Empty API key | "API key cannot be empty. Please try again." | Increment retryCount, re-prompt |
| Invalid confirmation | "Please enter 'y' (yes) or 'n' (no)." | Increment retryCount, re-prompt |
| Retry limit exceeded (>3) | "Too many invalid attempts. Restarting wizard." | Reset to MENU, retryCount = 0 |

### File System Error Handling

| Error Condition | Response | Recovery |
|----------------|----------|----------|
| Config directory missing (ENOENT) | "Config directory not found. Creating..." | Create directory, retry |
| Permission denied (EACCES) | "Permission denied. Check ~/.claude-code-router/ permissions." | Abort wizard, preserve state |
| Config file locked (EBUSY) | "Config file in use. Please try again in a moment." | Abort wizard, preserve state |
| Invalid JSON in config | "Config file corrupted. Creating backup and resetting..." | Backup existing, write new config |

### Concurrency Error Handling

| Error Condition | Response | Recovery |
|----------------|----------|----------|
| Config modified during wizard | "Config updated externally. Please restart wizard." | Abort current wizard |
| Multiple wizards completing | Use atomic file writes (OS-level) | Last write wins |

---

## Storage and Persistence

### In-Memory Storage (WizardState)

**Location**: `WizardManager.sessions` (Map<string, WizardState>)

**Persistence**: None (ephemeral, lost on server restart)

**Cleanup**: TTL-based (15-minute expiration) + immediate on completion/cancel

### File Storage (ConfigFile)

**Location**: `~/.claude-code-router/config.json`

**Format**: JSON5 (supports comments, trailing commas)

**Backup Strategy**:
- Backup created before each modification
- Backups stored as `config.json.backup-{timestamp}`
- Keep last 3 backups, delete older

**Atomicity**: Write to temp file, then atomic rename

---

## Performance Considerations

**Memory Footprint**:
- Each WizardState: ~200 bytes
- 100 concurrent sessions: ~20 KB
- Negligible impact on server memory

**File I/O**:
- Config read: 1 file read operation (~1-2ms)
- Config write: 1 backup + 1 temp write + 1 rename (~5-10ms)
- Acceptable latency for interactive wizard

**Concurrency**:
- Map operations are synchronous (no locking needed in single-threaded Node.js)
- File writes are atomic (OS-level guarantee via rename)

---

## Next Steps

With data model defined, proceed to create:
1. TypeScript interface files in `specs/001-external-model-wizard/contracts/`
2. Quickstart user guide in `specs/001-external-model-wizard/quickstart.md`
3. Update agent context with new technology decisions
