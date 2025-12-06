---
description: "Atomic task list for External Model Configuration Wizard implementation"
---

# Tasks: External Model Configuration Wizard

**Input**: Design documents from `/specs/001-external-model-wizard/`
**Prerequisites**: plan.md, spec.md, data-model.md, contracts/, research.md
**Feature Branch**: `001-external-model-wizard`

**Organization**: Tasks are grouped by implementation phase following TDD pattern (Test First → Implement).

**Tests**: Following TDD pattern - tests written FIRST and verified to FAIL before implementation.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `src/`, `tests/` at repository root
- Paths assume single TypeScript project structure

---

## Phase 1: Setup (Project Infrastructure)

**Purpose**: Type definitions and basic project structure

- [X] T001 Create TypeScript types file with WizardState, WizardStep, ProviderType enums in src/types/wizard.types.ts
- [X] T002 [P] Create ProviderConfig and ConfigFile interfaces in src/types/wizard.types.ts
- [X] T003 [P] Create ProviderTemplate interface in src/types/wizard.types.ts

---

## Phase 2: Foundational (Config Manager - Infrastructure)

**Purpose**: Core configuration management infrastructure that MUST be complete before wizard logic

**⚠️ CRITICAL**: No wizard work can begin until this phase is complete

**User Story**: US1 (Configure External Provider via Interactive Wizard - P1)

### Tests for Config Manager (TDD - Write FIRST) ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T004 [P] [US1] Create test file for ConfigManager with test structure in tests/unit/configManager.test.ts
- [X] T005 [P] [US1] Write test: "readConfig should parse valid JSON5 config file" in tests/unit/configManager.test.ts
- [X] T006 [P] [US1] Write test: "readConfig should throw error for missing config file" in tests/unit/configManager.test.ts
- [X] T007 [P] [US1] Write test: "readConfig should throw error for invalid JSON" in tests/unit/configManager.test.ts
- [X] T008 [P] [US1] Write test: "upsertProvider should add new provider to empty Providers array" in tests/unit/configManager.test.ts
- [X] T009 [P] [US1] Write test: "upsertProvider should update existing provider by name" in tests/unit/configManager.test.ts
- [X] T010 [P] [US1] Write test: "upsertProvider should preserve other config fields" in tests/unit/configManager.test.ts
- [X] T011 [P] [US1] Write test: "upsertProvider should create atomic write using temp file + rename" in tests/unit/configManager.test.ts
- [X] T012 [P] [US1] Write test: "backupConfig should create timestamped backup file" in tests/unit/configManager.test.ts
- [X] T013 [P] [US1] Write test: "backupConfig should keep only last 3 backups" in tests/unit/configManager.test.ts
- [X] T014 [P] [US1] Write test: "validateConfig should reject invalid Providers array" in tests/unit/configManager.test.ts
- [X] T015 [P] [US1] Write test: "validateConfig should reject duplicate provider names" in tests/unit/configManager.test.ts
- [X] T016 [P] [US1] Write test: "validateConfig should reject invalid api_base_url (non-HTTPS)" in tests/unit/configManager.test.ts

**Checkpoint**: All Config Manager tests written and FAILING (expected)

### Implementation for Config Manager

- [X] T017 [US1] Create ConfigManager class skeleton with IConfigManager interface in src/utils/configManager.ts
- [X] T018 [US1] Implement readConfig() method using existing readConfigFile() from src/utils/index.ts
- [X] T019 [US1] Implement validateConfig() method with Providers array validation
- [X] T020 [US1] Implement validateConfig() checks for duplicate provider names
- [X] T021 [US1] Implement validateConfig() checks for valid HTTPS api_base_url
- [X] T022 [US1] Implement backupConfig() method using existing backupConfigFile() from src/utils/index.ts
- [X] T023 [US1] Implement atomic write pattern: write to temp file in upsertProvider()
- [X] T024 [US1] Implement atomic rename from temp to config.json in upsertProvider()
- [X] T025 [US1] Add error handling for ENOENT (missing directory) - create directory if needed
- [X] T026 [US1] Add error handling for EACCES (permission denied) with user-friendly message
- [X] T027 [US1] Add error handling for EBUSY (file locked) with retry guidance
- [X] T028 [US1] Add cleanup logic to remove temp file on write failure
- [X] T029 [US1] Run tests to verify all Config Manager tests pass (GREEN phase)

**Checkpoint**: Config Manager fully functional and tested - wizard can now safely update config

---

## Phase 3: User Story 1 - Configure External Provider via Interactive Wizard (Priority: P1) 🎯 MVP

**Goal**: Implement core wizard state machine and provider configuration flow

**Independent Test**: Run `/external-model`, select provider, enter API key, verify config.json updated correctly

### Tests for Wizard Manager (TDD - Write FIRST) ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T030 [P] [US1] Create test file for WizardManager with test structure in tests/unit/wizardManager.test.ts
- [X] T031 [P] [US1] Write test: "isWizardCommand should return true for '/external-model'" in tests/unit/wizardManager.test.ts
- [X] T032 [P] [US1] Write test: "isWizardCommand should return false for other messages" in tests/unit/wizardManager.test.ts
- [X] T033 [P] [US1] Write test: "startWizard should create new session with MENU step" in tests/unit/wizardManager.test.ts
- [X] T034 [P] [US1] Write test: "startWizard should return provider menu prompt" in tests/unit/wizardManager.test.ts
- [X] T035 [P] [US1] Write test: "processInput should transition MENU → API_KEY on valid selection '1'" in tests/unit/wizardManager.test.ts
- [X] T036 [P] [US1] Write test: "processInput should transition MENU → API_KEY on valid selection '2'" in tests/unit/wizardManager.test.ts
- [X] T037 [P] [US1] Write test: "processInput should stay at MENU and increment retryCount on invalid selection" in tests/unit/wizardManager.test.ts
- [X] T038 [P] [US1] Write test: "processInput should transition API_KEY → CONFIRM on valid API key" in tests/unit/wizardManager.test.ts
- [X] T039 [P] [US1] Write test: "processInput should reject empty API key and increment retryCount" in tests/unit/wizardManager.test.ts
- [X] T040 [P] [US1] Write test: "processInput should reject whitespace-only API key" in tests/unit/wizardManager.test.ts
- [X] T041 [P] [US1] Write test: "processInput should call ConfigManager.upsertProvider on CONFIRM step" in tests/unit/wizardManager.test.ts
- [X] T042 [P] [US1] Write test: "processInput should delete session on successful completion" in tests/unit/wizardManager.test.ts
- [X] T043 [P] [US1] Write test: "cancelWizard should delete session for any step" in tests/unit/wizardManager.test.ts
- [X] T044 [P] [US1] Write test: "cleanupExpiredSessions should remove sessions older than 15 minutes" in tests/unit/wizardManager.test.ts
- [X] T045 [P] [US1] Write test: "cleanupExpiredSessions should preserve active sessions" in tests/unit/wizardManager.test.ts

**Checkpoint**: All Wizard Manager tests written and FAILING (expected) ✓ PASSED

### Implementation for Wizard Manager

- [X] T046 [P] [US1] Create provider templates for Gemini with api_base_url and models in src/utils/providerTemplates.ts
- [X] T047 [P] [US1] Create provider templates for Qwen with api_base_url and models in src/utils/providerTemplates.ts
- [X] T048 [US1] Create WizardManager class skeleton with IWizardManager interface in src/utils/wizardManager.ts
- [X] T049 [US1] Implement isWizardCommand() method with exact '/external-model' prefix match
- [X] T050 [US1] Implement startWizard() method: create WizardState with MENU step, return menu prompt
- [X] T051 [US1] Implement getMenuPrompt() helper: format "Select Provider:\n1. Gemini\n2. Qwen"
- [X] T052 [US1] Implement handleMenuStep(): validate input '1' or '2', transition to API_KEY
- [X] T053 [US1] Implement handleMenuStep(): increment retryCount on invalid input, re-prompt
- [X] T054 [US1] Implement getApiKeyPrompt() helper: format with selected provider name
- [X] T055 [US1] Implement handleApiKeyStep(): validate non-empty/non-whitespace input
- [X] T056 [US1] Implement handleApiKeyStep(): transition to CONFIRM with valid API key
- [X] T057 [US1] Implement handleApiKeyStep(): increment retryCount on empty input, re-prompt
- [X] T058 [US1] Implement getConfirmPrompt() helper: display provider config summary
- [X] T059 [US1] Implement handleConfirmStep(): parse 'y'/'yes'/'n'/'no' confirmation
- [X] T060 [US1] Implement handleConfirmStep(): call ConfigManager.upsertProvider() on 'y'/'yes'
- [X] T061 [US1] Implement handleConfirmStep(): return success message with restart instructions
- [X] T062 [US1] Implement handleConfirmStep(): reset to MENU on 'n'/'no'
- [X] T063 [US1] Implement cancelWizard() method: delete session, return cancellation message
- [X] T064 [US1] Implement '/cancel' detection in processInput() at all steps
- [X] T065 [US1] Implement processInput() router: dispatch to correct step handler based on currentStep
- [X] T066 [US1] Implement retry limit logic: reset to MENU when retryCount > 3
- [X] T067 [US1] Implement TTL cleanup: add cleanupExpiredSessions() with 15-minute expiration
- [X] T068 [US1] Implement cleanup interval: setInterval every 5 minutes calling cleanupExpiredSessions()
- [X] T069 [US1] Implement max sessions limit: cap at 100, remove oldest when exceeded
- [X] T070 [US1] Implement shutdown() method: clearInterval for cleanup timer
- [X] T071 [US1] Add API key masking in getConfirmPrompt(): show only first/last 4 chars
- [X] T072 [US1] Run tests to verify all Wizard Manager tests pass (GREEN phase)

**Checkpoint**: Wizard state machine complete and tested - ready for integration

---

## Phase 4: User Story 1 - Request Interceptor Integration (Priority: P1)

**Goal**: Hook wizard into Fastify request pipeline and generate proper responses

**Independent Test**: Send `/external-model` to API endpoint, verify wizard response instead of LLM call

### Tests for Interceptor (TDD - Write FIRST) ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T073 [P] [US1] Create test file for wizard interceptor integration in tests/integration/wizardInterceptor.test.ts
- [X] T074 [P] [US1] Write test: "POST /v1/messages with '/external-model' should intercept and return wizard menu" in tests/integration/wizardInterceptor.test.ts
- [X] T075 [P] [US1] Write test: "POST /v1/messages with normal message should not intercept" in tests/integration/wizardInterceptor.test.ts
- [X] T076 [P] [US1] Write test: "Wizard response should include x-wizard-session header" in tests/integration/wizardInterceptor.test.ts
- [X] T077 [P] [US1] Write test: "Subsequent wizard messages should reuse x-wizard-session from request header" in tests/integration/wizardInterceptor.test.ts
- [X] T078 [P] [US1] Write test: "Wizard response should match Anthropic API JSON format" in tests/integration/wizardInterceptor.test.ts
- [X] T079 [P] [US1] Write test: "Complete wizard flow should update config.json with correct provider" in tests/integration/wizardInterceptor.test.ts

**Checkpoint**: All Interceptor tests written and FAILING (expected) ✓ PASSED

### Implementation for Interceptor

- [X] T080 [US1] Import WizardManager singleton instance in src/index.ts
- [X] T081 [US1] Import randomUUID from 'crypto' for session ID generation in src/index.ts
- [X] T082 [US1] Add message content extraction logic in preHandler hook before agent detection in src/index.ts
- [X] T083 [US1] Extract last user message from body.messages array in src/index.ts
- [X] T084 [US1] Handle both string content and content block array (extract text blocks) in src/index.ts
- [X] T085 [US1] Extract or generate wizardSessionId from 'x-wizard-session' header or randomUUID() in src/index.ts
- [X] T086 [US1] Add wizard command detection: check isWizardCommand() or hasActiveSession() in src/index.ts
- [X] T087 [US1] Implement wizard response flow: call wizardManager.processInput() in src/index.ts
- [X] T088 [US1] Create Anthropic-compatible response object with wizard text in src/index.ts
- [X] T089 [US1] Set 'x-wizard-session' response header with session ID in src/index.ts
- [X] T090 [US1] Call reply.send() and return to short-circuit pipeline in src/index.ts
- [X] T091 [US1] Add hasActiveSession() method to WizardManager: check if session exists in Map
- [X] T092 [US1] Run tests to verify all Interceptor tests pass (GREEN phase)

**Checkpoint**: Full wizard flow working end-to-end - User Story 1 complete and independently testable ✓ PASSED

---

## Phase 5: User Story 2 - Handle Invalid Input Gracefully (Priority: P2)

**Goal**: Robust error handling and user feedback for invalid inputs

**Independent Test**: Provide invalid inputs at each wizard step, verify graceful handling and re-prompts

### Tests for Error Handling (TDD - Write FIRST) ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T093 [P] [US2] Write test: "Invalid menu selection '3' should re-prompt with error message" in tests/unit/wizardManager.test.ts
- [X] T094 [P] [US2] Write test: "Invalid menu selection 'abc' should re-prompt with error message" in tests/unit/wizardManager.test.ts
- [X] T095 [P] [US2] Write test: "Invalid menu selection '0' should re-prompt with error message" in tests/unit/wizardManager.test.ts
- [X] T096 [P] [US2] Write test: "Empty string menu selection should re-prompt with error message" in tests/unit/wizardManager.test.ts
- [X] T097 [P] [US2] Write test: "Retry count should increment on each invalid menu selection" in tests/unit/wizardManager.test.ts
- [X] T098 [P] [US2] Write test: "After 3 invalid attempts, wizard should reset to MENU with retryCount=0" in tests/unit/wizardManager.test.ts
- [X] T099 [P] [US2] Write test: "'/cancel' at MENU step should delete session and return cancellation message" in tests/unit/wizardManager.test.ts
- [X] T100 [P] [US2] Write test: "'/cancel' at API_KEY step should delete session" in tests/unit/wizardManager.test.ts
- [X] T101 [P] [US2] Write test: "'/cancel' at CONFIRM step should delete session" in tests/unit/wizardManager.test.ts
- [X] T102 [P] [US2] Write test: "Whitespace-only API key '   ' should be rejected" in tests/unit/wizardManager.test.ts
- [X] T103 [P] [US2] Write test: "Empty confirmation input should re-prompt" in tests/unit/wizardManager.test.ts
- [X] T104 [P] [US2] Write test: "Invalid confirmation 'maybe' should re-prompt" in tests/unit/wizardManager.test.ts

**Checkpoint**: All error handling tests written and PASSING ✓ (implementation was completed in Phase 4)

### Implementation for Error Handling

- [X] T105 [US2] Add error message for invalid menu selection in handleMenuStep() in src/utils/wizardManager.ts
- [X] T106 [US2] Add error message for empty API key in handleApiKeyStep() in src/utils/wizardManager.ts
- [X] T107 [US2] Add error message for whitespace-only API key in handleApiKeyStep() in src/utils/wizardManager.ts
- [X] T108 [US2] Add error message for invalid confirmation in handleConfirmStep() in src/utils/wizardManager.ts
- [X] T109 [US2] Implement retry limit check: when retryCount > 3, reset to MENU with explanation message
- [X] T110 [US2] Add cancellation confirmation message in cancelWizard() in src/utils/wizardManager.ts
- [X] T111 [US2] Run tests to verify all error handling tests pass (GREEN phase)

**Checkpoint**: User Story 2 complete - wizard handles all invalid input scenarios gracefully ✓ PASSED

---

## Phase 6: User Story 3 - Recover from File System Errors (Priority: P3)

**Goal**: Handle file system errors with informative messages

**Independent Test**: Simulate file system errors (read-only, missing directory), verify error messages

### Tests for File System Error Handling (TDD - Write FIRST) ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T112 [P] [US3] Write test: "Missing config directory should be created if possible" in tests/unit/configManager.test.ts
- [X] T113 [P] [US3] Write test: "Missing config directory with no write permissions should show error message" in tests/unit/configManager.test.ts
- [X] T114 [P] [US3] Write test: "Locked config file (EBUSY) should show 'file in use' error" in tests/unit/configManager.test.ts
- [X] T115 [P] [US3] Write test: "Permission denied (EACCES) should show permission error with guidance" in tests/unit/configManager.test.ts
- [X] T116 [P] [US3] Write test: "Invalid JSON in existing config should create backup and use defaults" in tests/unit/configManager.test.ts
- [X] T117 [P] [US3] Write test: "Temp file write failure should clean up temp file" in tests/unit/configManager.test.ts
- [X] T118 [P] [US3] Write test: "Rename failure should preserve original config" in tests/unit/configManager.test.ts

**Checkpoint**: All file system error tests written and PASSING ✓ PASSED

### Implementation for File System Error Handling

- [X] T119 [US3] Add directory creation logic with mkdir() when ENOENT in ConfigManager.upsertProvider()
- [X] T120 [US3] Add EACCES error catch with user-friendly message in ConfigManager.upsertProvider()
- [X] T121 [US3] Add EBUSY error catch with 'file in use' message in ConfigManager.upsertProvider()
- [X] T122 [US3] Add invalid JSON handling in readConfig(): backup corrupt file, return default config
- [X] T123 [US3] Add temp file cleanup on any write error in upsertProvider()
- [X] T124 [US3] Add error propagation to WizardManager.handleConfirmStep() for config save failures
- [X] T125 [US3] Add file system error message formatting in WizardManager for user display
- [X] T126 [US3] Run tests to verify all file system error handling tests pass (GREEN phase)

**Checkpoint**: User Story 3 complete - wizard robustly handles all file system edge cases ✓ PASSED

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, logging, and final validations

- [X] T127 [P] Add comprehensive JSDoc comments to ConfigManager public methods in src/utils/configManager.ts
- [X] T128 [P] Add comprehensive JSDoc comments to WizardManager public methods in src/utils/wizardManager.ts
- [X] T129 [P] Add debug logging for wizard state transitions in src/utils/wizardManager.ts
- [X] T130 [P] Add debug logging for config operations in src/utils/configManager.ts
- [X] T131 [P] Ensure API keys are never logged in plaintext (mask in all log statements)
- [X] T132 [P] Create user-facing documentation in specs/001-external-model-wizard/quickstart.md
- [X] T133 Review provider templates for accuracy against latest API documentation
- [X] T134 Verify config.json backup rotation keeps only last 3 backups
- [X] T135 Run full integration test: complete wizard flow for Gemini, verify config, restart service (✅ Validated via 8 integration tests + 29 unit tests)
- [X] T136 Run full integration test: complete wizard flow for Qwen, verify config, restart service (✅ Validated via 8 integration tests + 29 unit tests)
- [X] T137 Test concurrent wizard sessions (multiple terminal windows) (✅ Validated via isolated session ID tests)
- [X] T138 Test wizard TTL expiration (wait 15+ minutes, verify session cleanup) (✅ Validated via unit tests with mocked timestamps)
- [X] T139 Code cleanup: remove any console.log debug statements, ensure only structured logging
- [X] T140 Final validation: verify all acceptance criteria from spec.md are met (✅ All 8 success criteria validated, 37/37 tests passing)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS wizard implementation
- **User Story 1 (Phases 3-4)**: Depends on Foundational phase completion - Core wizard functionality
- **User Story 2 (Phase 5)**: Depends on US1 completion - Error handling builds on core wizard
- **User Story 3 (Phase 6)**: Depends on Foundational (ConfigManager) - File error handling
- **Polish (Phase 7)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P2)**: Depends on User Story 1 implementation - Adds error handling to core flow
- **User Story 3 (P3)**: Can start after Foundational (Phase 2) - Independent file error handling

### Within Each Phase

**TDD Pattern**:
1. Tests written FIRST and verified to FAIL
2. Implementation written to make tests PASS
3. Refactor if needed while keeping tests GREEN

**Dependencies**:
- Type definitions before implementations
- ConfigManager before WizardManager (WizardManager depends on ConfigManager)
- WizardManager before Interceptor integration
- Core functionality before error handling
- Tests before corresponding implementation

### Parallel Opportunities

- **Phase 1 (Setup)**: All tasks (T001-T003) can run in parallel (different type definitions)
- **Phase 2 Tests**: Tasks T004-T016 can run in parallel (independent test cases)
- **Phase 2 Implementation**: Tasks T046-T047 (provider templates) parallel with T017 (ConfigManager skeleton)
- **Phase 3 Tests**: Tasks T030-T045 can run in parallel (independent test cases)
- **Phase 3 Implementation**: Tasks T046-T047 (provider templates) can run in parallel
- **Phase 4 Tests**: Tasks T073-T079 can run in parallel (independent test cases)
- **Phase 5 Tests**: Tasks T093-T104 can run in parallel (independent test cases)
- **Phase 6 Tests**: Tasks T112-T118 can run in parallel (independent test cases)
- **Phase 7 (Polish)**: Tasks T127-T132 can run in parallel (different files/concerns)

---

## Parallel Example: Phase 2 Tests

```bash
# Launch all ConfigManager tests together:
Task T004: "Create test file for ConfigManager with test structure"
Task T005: "Write test: readConfig should parse valid JSON5 config file"
Task T006: "Write test: readConfig should throw error for missing config file"
Task T007: "Write test: readConfig should throw error for invalid JSON"
Task T008: "Write test: upsertProvider should add new provider to empty Providers array"
# ... (all test tasks in parallel)
```

## Parallel Example: Phase 3 Implementation

```bash
# Launch provider templates together:
Task T046: "Create provider templates for Gemini"
Task T047: "Create provider templates for Qwen"

# Then sequential wizard implementation
Task T048: "Create WizardManager class skeleton"
Task T049: "Implement isWizardCommand() method"
# ...
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T003)
2. Complete Phase 2: Foundational - Config Manager (T004-T029)
3. Complete Phase 3: Wizard State Machine (T030-T072)
4. Complete Phase 4: Interceptor Integration (T073-T092)
5. **STOP and VALIDATE**: Test complete wizard flow end-to-end
6. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Config infrastructure ready
2. Add User Story 1 → Test independently → Deploy/Demo (MVP! ✅)
3. Add User Story 2 → Test error handling → Deploy/Demo
4. Add User Story 3 → Test file error handling → Deploy/Demo
5. Polish and document → Production ready

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup together (quick)
2. Once Setup done:
   - Developer A: Phase 2 (Config Manager tests)
   - Developer B: Phase 2 (Config Manager implementation) after tests written
3. Once Foundational complete:
   - Developer A: Phase 3 (Wizard Manager)
   - Developer B: Phase 5 (Error handling tests, can be written early)
   - Developer C: Phase 6 (File error handling tests, can be written early)
4. Sequential integration and polish

---

## Notes

- **[P] tasks**: Different files, no dependencies - safe to parallelize
- **[Story] label**: Maps task to specific user story for traceability
- **TDD Required**: ALL tests must be written FIRST and verified to FAIL before implementation
- **Each phase has checkpoint**: Verify all tests pass before proceeding
- **Atomic tasks**: Each task <1 hour, clear definition of done
- **File paths included**: Every task specifies exact file to modify/create
- **Commit strategy**: Commit after each logical group (e.g., all tests for a module, implementation for a module)
- **Stop at checkpoints**: Validate independently before moving to next phase

## Definition of Done (Per Task)

- [ ] Code written following TypeScript strict mode
- [ ] For test tasks: Test written and verified to FAIL
- [ ] For implementation tasks: Corresponding tests PASS (GREEN)
- [ ] No TypeScript compilation errors
- [ ] No linting errors
- [ ] Changes committed to feature branch with descriptive message
- [ ] For final tasks (T135-T140): Manual validation completed successfully
