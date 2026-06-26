---
title: Provider Config
pageTitle: Provider Config
eyebrow: Detailed Configuration
lead: Configure upstream model services, credentials, protocols, base URLs, and model lists.
---

## Basic Concept

A provider is an upstream model service. CCR needs at least one provider with a valid protocol, Base URL, model list, and credential.

## Credentials

Credentials store API keys. Multiple credentials can rotate by priority and weight, and can switch when a key hits a limit or fails.

Use recognizable labels so failed keys are easy to identify in Logs.

## Provider Options

| Field | Description |
| --- | --- |
| Name | Internal display name in CCR; keep it short and recognizable |
| Base URL | Upstream service address; custom providers should include the correct API path |
| Protocol | OpenAI, Anthropic, Gemini, or compatible protocol |
| Models | Model list exposed to CCR selectors |
| Request headers | Extra headers required by some compatible services |
