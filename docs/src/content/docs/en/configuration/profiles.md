---
title: Agent Config
pageTitle: Agent Config
eyebrow: Detailed configuration
lead: Create reusable launch configs for Claude Code, Codex, OpenCode, Grok CLI, Kimi CLI, ZCode, and WorkBuddy, and open independent agent instances from different configs. Use this page to run multiple agents side by side or pin different models to different purposes.
---

> For a detailed, field-by-field setup guide to a single agent, open its page under **Agents** in the sidebar — for example, [Claude Code](/en/configuration/agents/claude-code/), [Codex](/en/configuration/agents/codex/), or [Grok CLI](/en/configuration/agents/grok/).

## Configuration flow

1. Add at least one usable provider and model in **Provider Config**, or create the Fusion model you want to use.
2. Open **Agent Config** and click **Add profile**.
3. Choose the agent type, name the config, then choose the effect scope and entry mode.
4. Select a model. The value is usually `Provider name/model name`, and Fusion models can be selected too.
5. If the entry mode includes App, optionally bind the Bot used by AgentClaw and choose whether to forward agent messages or enable handoff.
6. Save the config, then open it from the Agent Config card: the terminal button copies the CLI command, and the play button starts the App instance.

During trial, prefer **Only opened from CCR** and always open the agent from CCR. That keeps the config limited to CCR-launched instances and avoids changing the Claude Code, Codex, Grok CLI, Kimi CLI, ZCode, or WorkBuddy setup you open directly from the system.

## Multi-instance

Each Agent Config is a separate launch profile. Create multiple profiles when you want different models, scopes, Bots, or App windows for the same agent. Reopening an already-running profile activates its existing window when that agent supports only one active App window.

## Common options

| Option | Applies to | Description |
| --- | --- | --- |
| Agent | All | Claude Code, Codex, OpenCode, Grok CLI, Kimi CLI, ZCode, or WorkBuddy. Grok CLI and Kimi CLI support CLI only; ZCode and WorkBuddy support App only. |
| Config name | All | Identifies the config in CCR. Desktop commands use `ccr-app <config-name>`; CLI commands use `ccr <config-name>`. Names can contain spaces; copied commands are quoted automatically. |
| Enabled | All | Disabled configs are not exposed as active launch entries and are not applied as effective startup configs. |
| Effect scope | All | **Only opened from CCR** limits changes to CCR launches; **System default** also affects the agent when opened directly. Only one enabled system-default config is allowed per agent. |
| Entry mode | Claude Code, Codex, OpenCode, Grok CLI, Kimi CLI | `CLI & APP` exposes both CLI and App entry points; `CLI only` only generates a CLI command; `App only` only exposes the App entry point. Grok CLI and Kimi CLI are fixed to `CLI only`; ZCode and WorkBuddy are fixed to `App only`. |
| Model | All | Default model for the opened agent, either a provider model or Fusion model. For Claude Code, leaving it empty keeps the Claude Code default. |
| Available models | Kimi CLI | Models exposed by Kimi's `/model` command. The default model is always included. |
| Bot | App entry | The IM entry used by AgentClaw. Bot forwarding only works for App mode opened from CCR; CLI does not forward Bot messages yet. See [AgentClaw](/en/agentclaw/) for the full setup. |
| Environment variables | All | Optional advanced overrides; leave empty for normal use. |

## Per-agent options

### Claude Code

| Option | What it does |
| --- | --- |
| Model override | Default model for this profile. Leave it empty to keep Claude Code's own default model. |
| Small fast model | Optional model for Claude Code lightweight tasks. Leave it empty to keep the Claude Code default. |
| Settings file | Used for the system-default Claude Code profile. |
| Environment variables | Optional advanced overrides; leave empty for normal use. |
| Bot | Applies only to the Claude App entry. Select a saved Bot, then choose AgentClaw message forwarding or handoff. |

After Claude Code CLI is opened from CCR, it uses CCR gateway model discovery. In Claude Code CLI, enter `/model` to view and switch the models exposed by CCR, including normal provider models and visible Fusion models.

If Claude App is already running, restart it or reopen it from CCR when prompted.

Claude App and Claude Code CLI expose models differently:

| Entry | Model list source | Notes |
| --- | --- | --- |
| Claude Code CLI | CCR gateway model discovery | Use `/model` in the CLI to view the list; selected requests still go through CCR providers, routing, and Fusion. |
| Claude App | CCR model list | Open Claude App from CCR to use the model list for this profile. |

### OpenCode

| Option | What it does |
| --- | --- |
| Provider ID | Provider reference for this OpenCode profile, defaulting to `claude-code-router`. |
| Provider name | Display name shown in OpenCode, defaulting to `Claude Code Router`. |
| OpenCode model | Default model for OpenCode CLI and App. It can be a provider model or Fusion model. |
| Config file | Used for the system-default OpenCode profile. |
| Environment variables | Optional advanced overrides; leave empty for normal use. |
| Bot | Applies to the OpenCode App entry opened from CCR. |

With a Bot bound, OpenCode can relay conversations through the selected IM channel.

### Codex

| Option | What it does |
| --- | --- |
| Provider ID | Provider reference for this Codex profile. Keep it stable and use only letters, numbers, dots, underscores, or hyphens. |
| Provider name | Display name shown in Codex, defaulting to `Claude Code Router`. |
| Codex model | Default Codex model. It can be a provider model or Fusion model; if left empty, CCR uses the first available default model. |
| Show all sessions | Lets Codex show all sessions. |
| Config file | Used for the system-default Codex profile. |
| Environment variables | Optional advanced overrides; leave empty for normal use. |
| Bot | Applies only to the ChatGPT app entry. |

After saving, use the terminal button on the desktop config card to copy the Codex CLI command, for example `ccr-app "Codex - Work"`. For CLI, run: `ccr "Codex - Work"`. Use the play button to open ChatGPT.

### Grok CLI

Grok CLI profiles are fixed to **Only opened from CCR** and **CLI only**. After saving, run the profile command: desktop `ccr-app "Grok - Work"`, or CLI `ccr "Grok - Work"`. Inside Grok CLI, use `/model` to switch among the provider and Fusion models returned by CCR.

### Kimi CLI

Kimi CLI profiles are fixed to **Only opened from CCR** and **CLI only**. Select one default model and one or more available models. Kimi's `/model` command can switch among the models you selected.

### ZCode

| Option | What it does |
| --- | --- |
| Provider ID | Provider reference for this ZCode profile, defaulting to `claude-code-router`. |
| Provider name | Display name shown in ZCode, defaulting to `Claude Code Router`. |
| ZCode model | Default model when ZCode App opens. It can be a provider model or Fusion model. |
| Config file | Used for the system-default ZCode profile. |
| Environment variables | Optional advanced overrides; leave empty for normal use. |
| Bot | Applies only to the ZCode App entry. |

ZCode supports App only, so its entry mode is fixed to `App only`. The `Show all sessions` option is hidden for ZCode.

### WorkBuddy

| Option | What it does |
| --- | --- |
| Provider ID | Provider reference for this WorkBuddy profile, defaulting to `claude-code-router`. |
| Provider name | Display name used by the generated profile, defaulting to `Claude Code Router`. |
| WorkBuddy model | Default model when WorkBuddy App opens. It can be a provider model or Fusion model. |
| Allowed model list | Models visible in WorkBuddy; empty means every CCR model. |
| APP_PATH | Optional WorkBuddy executable path when auto-detection does not find the App. |
| Config file | Used for the system-default WorkBuddy profile. |
| Environment variables | Optional advanced overrides; leave empty for normal use. |
| Bot | Applies only to the WorkBuddy App entry. |

WorkBuddy supports App only, so its entry mode is fixed to `App only`.

## CLI and App modes

| Mode | How to open | Best for | Key differences |
| --- | --- | --- | --- |
| CLI | Desktop: click the terminal button and run `ccr-app <config-name>`; CLI: run `ccr <config-name>` | Working inside a project directory, shell workflows, scripting | Opens the selected profile in the terminal; Bot forwarding support is pending. |
| App | Click the play button in the CCR desktop app | Desktop windows, Bot forwarding, handoff | Reopening the same config activates the existing window. Multi-instance behavior depends on the Agent; OpenCode Desktop is single-instance, so CCR stops the managed instance before switching OpenCode profiles. |
| CLI & APP | One config exposes both CLI and App entry points | Reusing the same model config in both terminal and desktop App workflows | Both entries share the config name, model, effect scope, and environment variables, but launch differently. |

## Agent differences

### Claude Code

Claude Code supports CLI and App. Create separate profiles when you want different models, scopes, or Bots.

With a Bot bound, Claude App can relay conversations through the selected IM channel.

### Codex

Codex supports CLI and App. Use the terminal button for Codex CLI and the play button for ChatGPT.

With a Bot bound, ChatGPT can relay conversations through the selected IM channel.

### OpenCode

OpenCode supports CLI and App. OpenCode Desktop is single-instance, so switch profiles from CCR rather than launching a second App.

With a Bot bound, OpenCode can relay conversations through the selected IM channel.

### Grok CLI

Grok CLI supports CLI only. Use `/model` inside Grok CLI to switch among CCR models.

### Kimi CLI

Kimi CLI supports CLI only. Select one default model and any additional models you want in `/model`.

### ZCode

ZCode supports App only. Open it with the play button.

With a Bot bound, ZCode can relay conversations through the selected IM channel. Closing ZCode App immediately takes the relay offline.

### WorkBuddy

WorkBuddy supports App only. Open it with the play button.

With a Bot bound, WorkBuddy can relay conversations through the selected IM channel. Closing WorkBuddy takes the relay offline.

## Multi-instance suggestions

1. Create one Agent Config for each agent instance that should run independently.
2. While testing, prefer **Only opened from CCR** to avoid changing the system default agent.
3. To keep desktop windows side by side, use `App only` or `CLI & APP`, then open the App from CCR.
4. If the same config is already running, opening it again activates the existing window. Create another Agent Config when you need a second instance.
