---
title: Fusion Models
pageTitle: Fusion Models
eyebrow: Detailed Configuration
lead: Combine a base model with capability models or tools, turning a stable text model into an enhanced model that can see images, search the web, or call tools.
---

## How Fusion Works

Fusion keeps the base model's reasoning, writing, and coding behavior, then adds the missing capability layer. When needed, CCR calls the vision, search, or MCP tool, organizes the result into context, and lets the base model produce the final answer.

After saving, a Fusion model appears in routing and Agent Profiles like a normal model. Treat it as a reusable new model: upgrade a strong text model into a vision model, a stable coding model into a web-search model, or an Agent model into one that can call internal tools.

## Capabilities

- **Built-In Vision**: give a non-multimodal model visual ability, for example `GLM-5.2 + GLM-5V-Turbo = GLM-5.2V`.
- **Built-In Web Search**: give a model live retrieval capability and bring fresh information into context.
- **Custom MCP Tool**: wrap local scripts, internal systems, or remote services as model-callable tools.

## Composition Examples

Use names that make the capability source obvious:

- `GLM-5.2 + GLM-5V-Turbo = GLM-5.2V`
- `Coding model + Web Search = coding model with live retrieval`
- `General model + custom MCP tool = Agent model that can access internal systems`
