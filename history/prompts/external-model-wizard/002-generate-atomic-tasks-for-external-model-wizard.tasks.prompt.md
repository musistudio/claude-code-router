---
id: 002
title: Generate atomic tasks for external model wizard
stage: tasks
date: 2025-12-06
surface: agent
model: claude-sonnet-4-5
feature: external-model-wizard
branch: 001-external-model-wizard
user: Muhammad Fasih
command: /sp.tasks
labels: ["task-generation", "tdd", "wizard", "config-manager"]
links:
  spec: specs/001-external-model-wizard/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - specs/external-model-wizard/tasks.md
tests:
 - Manual validation pending (no test framework)
---

## Prompt

```text
My implementation plan is at specs/external-model-wizard/plan.md.

Please decompose this plan into atomic tasks.
Each task must:
1. Be implementable in < 1 hour.
2. Follow the TDD pattern (Test First -> Implement).
3. Have clear "Definition of Done".

Breakdown strategy:
- Separate Config Manager tasks (Infrastructure)
- Separate Wizard Logic tasks (State Machine)
- Separate Integration tasks (Interceptor)

Please generate the @specs/external-model-wizard/tasks.md file.
```

## Response snapshot

Generated comprehensive atomic task breakdown with 140 tasks organized into 7 phases following TDD pattern:

**Phase 1: Setup** (T001-T003)
- TypeScript type definitions for wizard entities

**Phase 2: Foundational - Config Manager** (T004-T029)
- 13 TDD tests for ConfigManager (atomic writes, validation, backups)
- 13 implementation tasks for atomic config operations
- Critical infrastructure that blocks all wizard work

**Phase 3: User Story 1 - Wizard State Machine** (T030-T072)
- 16 TDD tests for WizardManager (state transitions, validation)
- 27 implementation tasks for wizard logic
- Provider templates for Gemini and Qwen

**Phase 4: User Story 1 - Request Interceptor** (T073-T092)
- 7 TDD integration tests for Fastify interceptor
- 13 implementation tasks for request pipeline integration

**Phase 5: User Story 2 - Error Handling** (T093-T111)
- 12 TDD tests for invalid input scenarios
- 7 implementation tasks for graceful error handling

**Phase 6: User Story 3 - File System Errors** (T112-T126)
- 7 TDD tests for file system edge cases
- 8 implementation tasks for robust file operations

**Phase 7: Polish & Cross-Cutting** (T127-T140)
- Documentation, logging, API key masking
- Integration testing and validation

All tasks include:
- Exact file paths
- Clear acceptance criteria
- [P] markers for parallelizable tasks
- [US#] labels for user story traceability
- Strict TDD pattern (tests FIRST, verify FAIL, then implement)

## Outcome

- ✅ Impact: Created immediately executable task plan with 140 atomic tasks (<1 hour each)
- 🧪 Tests: TDD pattern enforced - 55 test tasks that MUST be written first and verified to FAIL
- 📁 Files: 1 file created (tasks.md)
- 🔁 Next prompts: Begin Phase 1 (T001-T003: Type definitions) or review task breakdown with stakeholder
- 🧠 Reflection: Task breakdown strictly follows user's requested strategy (Config Manager → Wizard Logic → Integration), with clear separation and TDD discipline. All tasks are independently verifiable and include explicit file paths.

## Evaluation notes (flywheel)

- Failure modes observed: None - task generation completed successfully
- Graders run and results (PASS/FAIL): Manual review pending
- Prompt variant (if applicable): Standard /sp.tasks template with TDD emphasis
- Next experiment (smallest change to try): User to validate task granularity meets <1 hour constraint
