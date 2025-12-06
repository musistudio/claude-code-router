# Feature Specification: External Model Configuration Wizard

**Feature Branch**: `001-external-model-wizard`
**Created**: 2025-12-06
**Status**: Draft
**Input**: User description: "Feature: External Model Configuration Wizard - I want to add a feature that allows users to configure external LLM providers (Gemini, Qwen) directly through the chat interface using a slash command."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Configure External Provider via Interactive Wizard (Priority: P1)

A user wants to configure an external LLM provider (Gemini or Qwen) to use with the Claude Code Router without manually editing configuration files. They prefer an interactive, guided experience.

**Why this priority**: This is the core value proposition - simplifying provider configuration through an interactive wizard reduces user friction and errors compared to manual config editing.

**Independent Test**: Can be fully tested by running `/external-model`, selecting a provider, entering an API key, and verifying the config.json contains correct provider settings. Delivers immediate value as a standalone configuration tool.

**Acceptance Scenarios**:

1. **Given** the user is in the chat interface, **When** they type `/external-model`, **Then** the router intercepts the command (does not send to LLM) and presents a numbered menu: "Select Provider: 1. Gemini, 2. Qwen"

2. **Given** the provider menu is displayed, **When** the user replies with "1" (Gemini), **Then** the router prompts for the Gemini API key

3. **Given** the API key prompt is shown, **When** the user pastes their API key, **Then** the router updates `~/.claude-code-router/config.json` with the correct `api_base_url` and `models` list for Gemini

4. **Given** the config has been updated successfully, **When** the wizard completes, **Then** the router confirms success and informs the user to restart/reload the application

5. **Given** the provider menu is displayed, **When** the user replies with "2" (Qwen), **Then** the router prompts for the Qwen API key and follows the same flow with Qwen-specific configuration

---

### User Story 2 - Handle Invalid Input Gracefully (Priority: P2)

A user makes a mistake during the wizard (invalid menu selection, cancels mid-stream, or provides malformed input). They expect clear feedback and the ability to retry or exit cleanly.

**Why this priority**: Error handling ensures reliability and good user experience but is secondary to the happy path functionality.

**Independent Test**: Can be tested independently by providing invalid inputs at each wizard step and verifying graceful handling.

**Acceptance Scenarios**:

1. **Given** the provider menu is displayed, **When** the user enters an invalid selection (e.g., "3" or "abc"), **Then** the router displays a friendly error message and re-prompts with the menu

2. **Given** the user is at any step in the wizard, **When** they type `/cancel`, **Then** the wizard exits cleanly without modifying config.json and displays a cancellation confirmation

3. **Given** the API key prompt is shown, **When** the user provides an empty input or whitespace-only input, **Then** the router displays an error message and re-prompts for the API key

---

### User Story 3 - Recover from File System Errors (Priority: P3)

A user runs the wizard but encounters file system issues (missing config directory, locked file, permission errors). They expect informative error messages that help them resolve the issue.

**Why this priority**: File system errors are edge cases that impact reliability but are less common than user input errors.

**Independent Test**: Can be tested by simulating various file system error conditions (read-only filesystem, missing directory) and verifying appropriate error messages.

**Acceptance Scenarios**:

1. **Given** the config directory `~/.claude-code-router/` does not exist, **When** the wizard attempts to save configuration, **Then** the router creates the directory (if possible) or displays an error message with guidance

2. **Given** the `config.json` file is locked by another process, **When** the wizard attempts to save, **Then** the router displays an error message indicating the file is in use and suggests retrying

3. **Given** the user lacks write permissions to the config directory, **When** the wizard attempts to save, **Then** the router displays a permission error message with guidance on resolving permissions

---

### Edge Cases

- What happens when the user enters numeric input as text (e.g., "one" instead of "1")?
- How does the system handle very long API keys (e.g., 1000+ characters)?
- What happens if config.json exists but contains invalid JSON?
- How does the system handle the user entering the same provider configuration multiple times?
- What happens if the user's input contains special characters or escape sequences?
- How does the wizard behave if interrupted mid-atomic-write (power loss, process kill)?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST intercept the `/external-model` slash command and prevent it from being sent to the LLM

- **FR-002**: System MUST present an interactive numbered menu with exactly two provider options: "1. Gemini" and "2. Qwen"

- **FR-003**: System MUST validate user menu selections and only accept "1" or "2" as valid inputs

- **FR-004**: System MUST re-prompt the user with the menu if an invalid selection is entered

- **FR-005**: System MUST prompt for an API key/token specific to the selected provider after a valid menu selection

- **FR-006**: System MUST validate that the API key input is non-empty and non-whitespace-only

- **FR-007**: System MUST update the `~/.claude-code-router/config.json` file using atomic write operations to prevent corruption

- **FR-008**: System MUST configure the correct `api_base_url` for the selected provider:
  - Gemini: appropriate Google AI Studio API endpoint
  - Qwen: appropriate Alibaba Cloud/Qwen API endpoint

- **FR-009**: System MUST configure the correct `models` list for the selected provider with default model identifiers

- **FR-010**: System MUST preserve existing configuration settings not related to the external model provider being configured

- **FR-011**: System MUST recognize the `/cancel` command at any wizard step and exit without modifying configuration

- **FR-012**: System MUST display a success confirmation message after successfully updating config.json

- **FR-013**: System MUST inform the user that a restart/reload is required for changes to take effect

- **FR-014**: System MUST mask or redact the API key in any chat logs or console output to prevent accidental exposure

- **FR-015**: System MUST handle file system errors gracefully (missing directory, locked file, permission errors) with informative error messages

- **FR-016**: System MUST create the `~/.claude-code-router/` directory if it does not exist (subject to permissions)

- **FR-017**: System MUST validate that config.json contains valid JSON before attempting updates, and handle parse errors appropriately

### Key Entities

- **Provider Configuration**: Represents an external LLM provider setup with attributes:
  - Provider name (string: "gemini" or "qwen")
  - API base URL (string: provider-specific endpoint)
  - Models list (array of strings: available model identifiers)
  - API key/token (string: user-provided authentication credential)

- **Configuration File**: Represents the persistent `~/.claude-code-router/config.json` file containing:
  - External model provider settings
  - Other router configuration (preserved during updates)
  - Must maintain valid JSON structure at all times

- **Wizard State**: Represents the current step in the interactive wizard flow:
  - Current step (menu selection, API key input, confirmation)
  - Selected provider (Gemini or Qwen, or null if not yet selected)
  - User input buffer (current input being processed)
  - Cancellation flag (whether user invoked /cancel)

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can complete the entire provider configuration workflow (from `/external-model` to confirmation) in under 60 seconds for the happy path

- **SC-002**: The `config.json` file contains the exact correct `api_base_url` and at least one valid model identifier for the selected provider after wizard completion

- **SC-003**: Invalid menu selections (any input other than "1" or "2") result in a re-prompt without crashing or exiting the wizard

- **SC-004**: API keys are never displayed in plaintext in chat logs or console output (masked with `***` or similar)

- **SC-005**: The wizard successfully handles at least 3 consecutive invalid inputs before allowing the user to proceed, demonstrating error tolerance

- **SC-006**: Config file updates are atomic - either the entire update succeeds or no changes are made (no partial/corrupt state)

- **SC-007**: 100% of file system errors (missing directory, locked file, permission denied) produce user-friendly error messages that explain the issue and suggest remediation

- **SC-008**: The `/cancel` command successfully exits the wizard from any step without modifying config.json in 100% of test cases

### Assumptions

- Users have Node.js/npm access to install and run the Claude Code Router application
- Users have obtained valid API keys from Gemini or Qwen providers before running the wizard
- The standard config location is `~/.claude-code-router/config.json` (consistent with router conventions)
- Users understand that a restart/reload is required after configuration changes
- The router application has appropriate file system permissions in the user's home directory
- API endpoints for Gemini and Qwen are stable and publicly documented
- Default model identifiers for each provider are known and can be hardcoded in the wizard
