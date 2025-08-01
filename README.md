# Qlaude - Claude Code Router Agent

## What This Is

Qlaude is an agent that bridges the gap between Claude Code's REPL tools and VS Code's extension API. It's designed to work with the Claude Code Router system to intelligently route requests between different AI providers while maintaining access to both local CLI tools and IDE-specific functionality.

## The Problem It Solves

When working with AI coding assistants, you typically have to choose between:
- CLI-based tools (like Claude Code) that excel at file operations and terminal commands
- IDE-integrated assistants that understand your workspace but lack broader system access

Qlaude eliminates this choice by understanding both contexts and routing appropriately.

## How It Works

### Core Architecture
Built on Qwen3:8B with tool calling capabilities, Qlaude has embedded knowledge of 35 different tools split across two domains:

**Claude Code Tools (14 tools):** File operations, terminal execution, web research, task management
**VS Code Tools (21 tools):** Semantic search, code analysis, workspace management, extension integration

### The Router Integration
When used with Claude Code Router, Qlaude becomes part of a larger system that can:
- Route complex reasoning tasks to external models (GPT-4, Claude, etc.)
- Handle background processing locally with Ollama
- Switch between providers dynamically based on task requirements
- Maintain tool access across different model contexts

### Tool Routing Logic
Qlaude automatically selects the appropriate tool based on context:
- File system operations → Claude Code tools (`read`, `write`, `edit`)
- Code analysis → VS Code tools (`semantic_search`, `list_code_usages`)
- Terminal commands → Claude Code `bash` tool
- Workspace navigation → VS Code `file_search`, `grep_search`

## Why This Matters

### For Local Development
- Processes entirely on your machine with Ollama
- No external API calls for basic file and terminal operations
- Understands your full development context (files + workspace)

### For Complex Tasks
- Can escalate to more powerful models when needed
- Maintains tool access even when routed to external providers
- Provides consistent interface regardless of underlying model

### For Workflow Integration
- Works seamlessly in VS Code via extensions
- Compatible with Claude Code's REPL environment
- Bridges CLI and IDE workflows without context switching

## Technical Implementation

The model embeds complete tool definitions directly in its system prompt, giving it full awareness of available capabilities without requiring external tool discovery. This approach ensures consistent tool usage regardless of how the model is invoked.

The Claude Code Router handles the orchestration layer, deciding when to use local processing vs external models, while Qlaude provides the tool-aware interface that works across all contexts.

https://github.com/musistudio/claude-code-router
