---
id: 001
title: External Model Wizard Implementation Plan
stage: plan
date: 2025-12-06
surface: agent
model: claude-sonnet-4-5
feature: external-model-wizard
branch: 001-external-model-wizard
user: Muhammad Fasih
command: /sp.plan
labels: ["planning", "architecture", "wizard", "configuration", "external-providers"]
links:
  spec: specs/001-external-model-wizard/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - specs/001-external-model-wizard/plan.md
 - specs/001-external-model-wizard/research.md
 - specs/001-external-model-wizard/data-model.md
 - specs/001-external-model-wizard/quickstart.md
 - specs/001-external-model-wizard/contracts/wizard-state.interface.ts
 - specs/001-external-model-wizard/contracts/provider-config.interface.ts
 - specs/001-external-model-wizard/contracts/wizard-manager.interface.ts
 - specs/001-external-model-wizard/contracts/config-manager.interface.ts
tests:
 - No tests created (planning phase only)
---

## Prompt

I have a specification for the "External Model Configuration Wizard" feature.
Please generate an implementation plan that covers:

1.  **Architecture**:
    * **Interceptor**: Where in the request pipeline do we trap `/external-model`? (e.g., `src/routes/chat.ts` or a new middleware).
    * **State Machine**: How do we track which user is in which step of the wizard? (In-memory Map keyed by `conversationId`).
    * **Config Manager**: A dedicated module for reading/updating `config.json` safely.

2.  **Phases**:
    * Phase 1: Build the Config Manager (Safe Read/Write).
    * Phase 2: Build the Wizard Logic (State Machine & Prompts).
    * Phase 3: Hook into the Server (Interceptor).
    * Phase 4: Testing & Polish.

3.  **Design Decisions (ADR Candidates)**:
    * Why in-memory state vs. database? (Ephemeral, simple).
    * Why restart required? (Simpler than hot-reloading providers).

Please generate the @specs/external-model-wizard/plan.md file.

## Response snapshot

Generated comprehensive implementation plan for External Model Configuration Wizard feature with the following deliverables:

**Core Planning Documents Created:**

1. **plan.md** - Complete implementation plan including:
   - Technical context (TypeScript 5+, Fastify server, Node.js LTS)
   - Constitution check (all 7 principles satisfied, no violations)
   - Project structure (single-project, 3 new modules, 4 modified files)
   - Phase 0: Research goals (8 research tasks for API endpoints, request handling, state management)
   - Phase 1: Design artifacts (data model, API contracts, quickstart guide)
   - Phase 2: Implementation phases (4 phases: ConfigManager, WizardManager, Interceptor, Testing)
   - Architectural decisions with ADR candidates (2 significant decisions documented)

2. **research.md** - Resolved all technical unknowns:
   - Provider API endpoints (Gemini: generativelanguage.googleapis.com, Qwen: dashscope.aliyuncs.com)
   - Default model identifiers (Gemini: 1.5-flash/pro, Qwen: turbo/plus/max)
   - Request/response handling patterns (message extraction, conversationId via UUID + headers)
   - SSE response format (standard Anthropic JSON, non-streaming)
   - State management (setInterval cleanup, 15min TTL, Map-based storage)
   - Integration points (existing config functions, preHandler hook)

3. **data-model.md** - Complete entity definitions:
   - WizardState (6 fields, validation rules, state transitions)
   - WizardStep enum (MENU, API_KEY, CONFIRM, COMPLETE)
   - ProviderType enum (GEMINI, QWEN)
   - ProviderConfig (4 fields, URL validation)
   - ConfigFile (Providers array + existing fields)
   - ProviderTemplate (pre-defined configs)
   - Validation rules and error handling strategies
   - Performance considerations (20KB for 100 sessions)

4. **contracts/** - TypeScript interface files:
   - wizard-state.interface.ts (WizardState, WizardStep, ProviderType)
   - provider-config.interface.ts (ProviderConfig, ConfigFile, ProviderTemplate)
   - wizard-manager.interface.ts (IWizardManager with 8 methods, WizardResponse)
   - config-manager.interface.ts (IConfigManager with 6 methods)

5. **quickstart.md** - User-facing documentation:
   - Step-by-step wizard usage instructions
   - API key acquisition guides (Gemini, Qwen)
   - Error handling reference (8 common errors)
   - FAQ section (8 questions)
   - Troubleshooting guide
   - Manual configuration examples

**Key Architectural Decisions:**

1. **In-Memory State Management**:
   - Decision: Use Map<sessionId, WizardState> with 15-minute TTL
   - Rationale: Ephemeral sessions, low latency (<100ms), minimal memory (~1KB per session)
   - Alternatives rejected: SQLite (query overhead), file-based (I/O latency), stateless (complex)
   - ADR suggested: `/sp.adr in-memory-wizard-state`

2. **Manual Restart Requirement**:
   - Decision: Require `ccr restart` after config changes (no hot-reload)
   - Rationale: Infrequent changes, hot-reload complexity (connection draining, race conditions), simplicity
   - Alternatives rejected: Hot-reload (complex), auto-restart (platform-specific)
   - ADR suggested: `/sp.adr manual-restart-requirement`

**Constitution Compliance:**
- All 7 constitutional principles satisfied (TypeScript strict, async/await, error handling, atomic writes, modularity, interceptor pattern, in-memory wizard state)
- No violations requiring justification
- Modular design: 3 new modules (wizardManager, configManager, providerTemplates), 1 types file, minimal changes to existing index.ts

**Implementation Phases Outlined:**
- Phase 2.1: ConfigManager (atomic read/write, backups, validation)
- Phase 2.2: WizardManager (state machine, step handlers, TTL cleanup)
- Phase 2.3: Request Interceptor (preHandler integration, SSE responses)
- Phase 2.4: Testing & Polish (happy path, error cases, concurrency, TTL)

**Next Steps:**
- Run `/sp.tasks` to generate detailed implementation tasks from this plan
- Consider creating ADRs for the 2 significant architectural decisions
- Update agent context with new technology decisions (research findings)

## Outcome

- ✅ Impact: Complete implementation plan generated with all required artifacts (plan, research, data-model, contracts, quickstart). All Phase 0 research tasks resolved. Ready for Phase 2 task generation.
- 🧪 Tests: No tests created (planning phase). Testing strategy documented in Phase 2.4.
- 📁 Files: 8 files created (1 plan, 1 research, 1 data-model, 1 quickstart, 4 contract interfaces)
- 🔁 Next prompts: Run `/sp.tasks` to generate implementation tasks. Consider `/sp.adr in-memory-wizard-state` and `/sp.adr manual-restart-requirement` for architectural decisions.
- 🧠 Reflection: Comprehensive planning session covering all architectural aspects. Constitution check passed with no violations. Two significant architectural decisions identified and documented with rationale. Research phase resolved all technical unknowns (API endpoints, state management, request handling). Design phase produced complete data models and API contracts. Ready for implementation phase.

## Evaluation notes (flywheel)

- Failure modes observed: None. All planning deliverables completed successfully.
- Graders run and results (PASS/FAIL): PASS - Constitution compliance verified, all required artifacts generated, architectural decisions documented with rationale
- Prompt variant (if applicable): Standard /sp.plan workflow with user-provided architectural guidance (interceptor location, state management approach, implementation phases)
- Next experiment (smallest change to try): Proceed with `/sp.tasks` to validate that planning artifacts contain sufficient detail for task generation. Monitor for any missing technical details during task breakdown.
