# claude-code-router Constitution

## Core Principles

### I. TypeScript Strict Mode
All code MUST be written in TypeScript with strict mode enabled. The `any` type is FORBIDDEN; all types must be explicitly defined using interfaces or type aliases. This ensures type safety, prevents runtime errors, and makes the codebase maintainable and self-documenting.

**Rationale**: TypeScript's strict mode catches entire classes of bugs at compile time. Eliminating `any` forces thoughtful API design and makes refactoring safe.

### II. Async/Await Only
All asynchronous operations MUST use async/await syntax. Callback-based patterns are FORBIDDEN. File system operations MUST use `fs/promises` module, not the callback-based `fs` API.

**Rationale**: Async/await produces linear, readable code that handles errors consistently via try/catch. Callback hell obscures control flow and makes error handling fragile.

### III. Graceful Error Handling (NON-NEGOTIABLE)
All errors MUST be caught and logged gracefully. The router MUST NEVER crash due to unhandled exceptions. Every async operation must be wrapped in try/catch blocks with appropriate error logging and fallback behavior.

**Rationale**: As middleware, this router sits in the critical path. A crash interrupts all users. Logging errors while maintaining service ensures observability without availability loss.

### IV. Atomic Configuration Updates
All configuration file updates MUST follow the atomic read-modify-write pattern:
1. Read current configuration
2. Modify in-memory copy
3. Write atomically (temp file + rename, or transaction-safe method)

Partial writes or in-place mutations are FORBIDDEN.

**Rationale**: Configuration corruption from interrupted writes can brick the system. Atomic operations ensure configurations are always valid or unchanged.

### V. Modular Architecture
Command logic MUST be separated from server logic. Each concern (request handling, command interception, upstream forwarding, wizard state management) MUST live in its own module with clear interfaces.

**Rationale**: Modularity enables independent testing, reduces coupling, and makes the codebase navigable. Mixed concerns create fragile code that breaks in unpredictable ways.

### VI. Interceptor Pattern
The router implements an interceptor middleware pattern. Specific commands are intercepted and handled locally before (or instead of) forwarding upstream. Interception rules MUST be configurable and deterministic.

**Rationale**: This pattern provides a clean extension point for custom command handling without modifying upstream servers. Configurability allows runtime adaptation.

### VII. Wizard Pattern for Conversational State
Multi-step conversational flows (wizards) MUST store state in memory, not in databases. State MUST be keyed by session/conversation ID with expiration policies to prevent memory leaks.

**Rationale**: In-memory storage provides low-latency access for interactive flows. Database persistence adds unnecessary complexity and latency for ephemeral conversational state.

## Technical Stack

**Runtime**: Node.js Latest LTS (v20.x or current LTS at time of development)

**Language**: TypeScript 5+ with `strict: true`, `noImplicitAny: true`, `strictNullChecks: true`

**Linting**: ESLint with default recommended rules, extended with TypeScript-specific rules

**File System Operations**: `fs/promises` API exclusively

**Package Manager**: npm (lock file MUST be committed)

## Quality Gates

All code merged to main MUST satisfy:

1. **Type Safety**: Zero TypeScript errors with strict mode enabled
2. **Linting**: Zero ESLint errors or warnings (warnings may be suppressed with justification comments only)
3. **Error Handling**: All async operations wrapped in try/catch with logging
4. **Modularity**: No file exceeding 300 lines; single responsibility per module
5. **Testing**: Unit tests for pure logic; integration tests for command interception flows
6. **Documentation**: Public interfaces documented with JSDoc; README updated for new features

## Development Workflow

### Code Reviews

All PRs MUST be reviewed for:
- Adherence to all Core Principles (especially strict typing and error handling)
- Modular structure (no mixing of server and command logic)
- Atomic configuration patterns where applicable
- Appropriate use of async/await

### Testing Requirements

**Unit Tests**: Required for:
- Command parsing logic
- Configuration read/modify/write operations
- Wizard state management

**Integration Tests**: Required for:
- Command interception flows (verify correct commands are intercepted)
- Upstream forwarding (verify non-intercepted commands reach upstream)
- Wizard multi-step flows (verify state persists across steps)

### Deployment

- All dependencies MUST be listed in `package.json` with locked versions
- Environment-specific configuration MUST use environment variables, never hardcoded
- Secrets MUST be read from `.env` or secure vaults, NEVER committed to the repository

## Governance

This constitution supersedes all other development practices and coding standards. Any code that violates these principles MUST be rejected in code review.

**Amendments**: Changes to this constitution require:
1. Documented rationale for the change
2. Impact analysis on existing code
3. Migration plan if existing code violates new principles
4. Approval from project maintainer(s)
5. Version increment following semantic versioning

**Versioning**:
- MAJOR: Removal or redefinition of a core principle
- MINOR: Addition of new principle or quality gate
- PATCH: Clarifications, typo fixes, non-semantic refinements

**Compliance**: All PRs MUST verify compliance with this constitution. Complexity that violates simplicity or modularity principles MUST be justified in writing or refactored.

For runtime development guidance during task execution, refer to `CLAUDE.md` or equivalent agent guidance files.

**Version**: 1.0.0 | **Ratified**: 2025-12-06 | **Last Amended**: 2025-12-06
