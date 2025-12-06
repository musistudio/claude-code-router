---
id: 001
title: create-external-model-wizard-spec
stage: spec
date: 2025-12-06
surface: agent
model: claude-sonnet-4-5-20250929
feature: 001-external-model-wizard
branch: 001-external-model-wizard
user: Muhammad Fasih <programmer.fasih.18@gmail.com>
command: /sp.specify
labels: ["spec", "wizard", "configuration", "external-model"]
links:
  spec: specs/001-external-model-wizard/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - specs/001-external-model-wizard/spec.md
  - specs/001-external-model-wizard/checklists/requirements.md
  - history/prompts/001-external-model-wizard/ (created)
tests:
  - Specification validation checklist (all items passed)
---

## Prompt

Feature: External Model Configuration Wizard

I want to add a feature that allows users to configure external LLM providers (Gemini, Qwen) directly through the chat interface using a slash command.

**User Journey:**
1. User types `/external-model`.
2. Router intercepts this (does not send to LLM).
3. Router presents a numbered menu: "Select Provider: 1. Gemini, 2. Qwen".
4. User replies "1" or "2".
5. Router asks for the API Key/Token for that provider.
6. User pastes the key.
7. Router updates `~/.claude-code-router/config.json` safely (Atomic Update).
8. Router confirms success and informs the user to restart/reload.

**Acceptance Criteria (SMART):**
- **Specific**: Must support exactly "gemini" and "qwen" templates initially.
- **Measurable**: The `config.json` must contain the correct `api_base_url` and `models` list for the selected provider after the wizard finishes.
- **Error Handling**: If the user enters an invalid selection (e.g., "3"), the wizard should re-prompt nicely.
- **Security**: The API key must be saved to the config file but masked in the chat logs if possible.

**Edge Cases to Cover:**
- User enters invalid menu option.
- Config file is missing or locked (permission error).
- User types `/cancel` to exit the wizard mid-stream.

Please generate the @specs/external-model-wizard/spec.md file.

## Response snapshot

Created comprehensive specification for External Model Configuration Wizard feature with the following structure:

1. **Branch Setup**: Created `001-external-model-wizard` branch with specs directory structure
2. **User Stories**: Defined 3 prioritized user stories:
   - P1: Configure External Provider via Interactive Wizard (core happy path)
   - P2: Handle Invalid Input Gracefully (error handling)
   - P3: Recover from File System Errors (edge cases)
3. **Requirements**: Documented 17 functional requirements (FR-001 to FR-017) covering:
   - Command interception and menu presentation
   - Input validation and error handling
   - Atomic config updates with correct provider settings
   - Security (API key masking)
   - File system error handling
4. **Success Criteria**: Defined 8 measurable, technology-agnostic outcomes (SC-001 to SC-008)
5. **Quality Validation**: Created and validated requirements checklist - all items passed

The spec is complete, testable, and ready for `/sp.clarify` or `/sp.plan`.

## Outcome

- ✅ Impact: Created complete, validated specification for external model configuration wizard feature
- 🧪 Tests: Specification quality checklist validation (all 13 items passed)
- 📁 Files: Created spec.md, requirements.md checklist, and prompts directory structure
- 🔁 Next prompts: User can run `/sp.clarify` for targeted clarification questions or `/sp.plan` to begin architectural planning
- 🧠 Reflection: The spec successfully captured all user requirements without [NEEDS CLARIFICATION] markers by making reasonable defaults (industry-standard patterns, standard config location, known provider endpoints). All requirements are testable and technology-agnostic.

## Evaluation notes (flywheel)

- Failure modes observed: Initial PowerShell script invocation failed due to parameter binding issues with multi-line description containing "prompts" word, but recovery was successful by directly writing to the existing branch/spec structure.
- Graders run and results (PASS/FAIL): Specification quality checklist PASS (13/13 items)
- Prompt variant (if applicable): Standard /sp.specify workflow
- Next experiment (smallest change to try): Consider auto-detecting provider API endpoints from popular documentation sources during planning phase to reduce hardcoded assumptions
