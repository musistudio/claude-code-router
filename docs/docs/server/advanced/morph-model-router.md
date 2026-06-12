---
sidebar_position: 2
---

# Morph Model Router

Use [Morph Model Router](https://docs.morphllm.com/sdk/components/router#router-multimodel)
as an optional bring-your-own-key custom router for Claude Code Router.

CCR still sends the final model request to the provider you configure. Morph only
receives the latest user text prompt and returns the single provider/model that
should handle it.

## How it works

1. CCR receives a Claude Code request.
2. CCR calls `CUSTOM_ROUTER_PATH` before its built-in scenario router.
3. The Morph router script sends the latest user text prompt to Morph's
   `/v1/router/multimodel` endpoint with your allowed models, allowed
   providers, and policy.
4. Morph returns a `{ provider, model }` decision.
5. The script maps that decision to a CCR route like `openai,gpt-5.5`.
6. CCR calls the selected provider using the provider keys in your CCR config.

The integration is fail-open. If Morph is disabled, missing a key, times out, or
returns a model that is not configured in CCR, the script returns a configured
fallback route or `null` so CCR falls back to its normal `Router` behavior.

## Install

Copy the example custom router from this repository:

```bash
mkdir -p ~/.claude-code-router
cp examples/morph-router.cjs ~/.claude-code-router/morph-router.cjs
```

Then set `CUSTOM_ROUTER_PATH` and `MORPH_ROUTER` in
`~/.claude-code-router/config.json`:

```json
{
  "CUSTOM_ROUTER_PATH": "/Users/you/.claude-code-router/morph-router.cjs",
  "MORPH_ROUTER": {
    "enabled": true,
    "api_key": "$MORPH_API_KEY",
    "policy": "balanced",
    "allowed_models": [
      "gpt-5.5",
      "claude-haiku-4-5-20251001",
      "claude-sonnet-4-6",
      "claude-opus-4-8"
    ],
    "allowed_providers": [],
    "default_model": "claude-sonnet-4-6",
    "fallback": "openai,gpt-4.1",
    "timeout_ms": 750,
    "provider_map": {
      "openai": "openai",
      "anthropic": "anthropic",
      "gemini": "gemini",
      "deepseek": "deepseek"
    },
    "model_map": {}
  },
  "Providers": [
    {
      "name": "openai",
      "api_base_url": "https://api.openai.com/v1/chat/completions",
      "api_key": "$OPENAI_API_KEY",
      "models": ["gpt-5.5", "gpt-4.1"]
    },
    {
      "name": "anthropic",
      "api_base_url": "https://api.anthropic.com/v1/messages",
      "api_key": "$ANTHROPIC_API_KEY",
      "models": [
        "claude-haiku-4-5-20251001",
        "claude-sonnet-4-6",
        "claude-opus-4-8"
      ],
      "transformer": {
        "use": ["Anthropic"]
      }
    }
  ],
  "Router": {
    "default": "openai,gpt-4.1",
    "background": "openai,gpt-4.1",
    "think": "openai,gpt-4.1",
    "longContext": "openai,gpt-4.1",
    "webSearch": "openai,gpt-4.1",
    "longContextThreshold": 60000
  }
}
```

You can also start from the copyable example:

```bash
cp examples/morph-router.config.example.json ~/.claude-code-router/config.json
```

Edit provider names, model names, and transformers to match the models your
accounts can call.

## Set keys

```bash
export MORPH_API_KEY="..."
export OPENAI_API_KEY="..."
export ANTHROPIC_API_KEY="..."
```

`MORPH_API_KEY` is only used to choose the route. CCR uses the provider keys
when it calls the selected model.

Keep keys in environment variables or your shell secret manager. The examples
use `$MORPH_API_KEY`, `$OPENAI_API_KEY`, and `$ANTHROPIC_API_KEY` instead of
hardcoding secrets.

## Start CCR

```bash
ccr restart
ccr status
ccr code
```

## Configuration reference

| Field | Default | Description |
|---|---:|---|
| `enabled` | `false` | Enables Morph routing when true. |
| `api_key` | `$MORPH_API_KEY` | Morph API key or environment variable reference. |
| `endpoint` | `https://api.morphllm.com/v1/router/multimodel` | Morph router endpoint. |
| `policy` | `balanced` | One of `balanced`, `cost_efficient`, `capability_heavy`, or `domain_skills`. |
| `allowed_models` | unset | Exact Morph model candidates. |
| `allowed_providers` | unset | Provider candidates, such as `openai`, `anthropic`, `gemini`, or `deepseek`. |
| `default_model` | unset | Model Morph returns for ambiguous prompts. |
| `fallback` | `null` | CCR route to use if Morph fails, such as `openai,gpt-4.1`. If unset, CCR's normal router handles fallback. |
| `timeout_ms` | `750` | Morph router timeout. |
| `max_input_chars` | `24000` | Character cap for the prompt sent to Morph. |
| `provider_map` | identity | Maps Morph providers to CCR provider names. |
| `model_map` | identity | Maps Morph model names to CCR model names. |
| `allow_unconfigured_routes` | `false` | Return Morph routes even when not present in CCR `Providers`. |

## Preserving CCR routes

The example preserves CCR's built-in routing by default for:

- explicit `/model provider,model` selections
- subagent `<CCR-SUBAGENT-MODEL>` directives
- thinking requests
- web-search requests
- long-context requests
- background Haiku requests

Set `route_thinking`, `route_web_search`, `route_long_context`, or
`route_background` to `true` in `MORPH_ROUTER` if you want Morph to override one
of those scenarios.

## Mapping model names

If Morph returns a model name that differs from your CCR provider config, map it:

```json
{
  "MORPH_ROUTER": {
    "model_map": {
      "gpt-5.5": "gpt-5.5-chat-latest",
      "anthropic:claude-sonnet-4-6": "claude-sonnet-4-20250514"
    }
  }
}
```

`provider:model` mappings take precedence over generic model mappings.

## Privacy and logs

The example sends only text prompt parts to Morph. It skips tool results,
images, and other non-text blocks, and removes Claude Code system reminders and
CCR subagent route directives before calling Morph.

If Morph returns an error, the script logs only the HTTP status, not the response
body, so an upstream error that echoes prompt text does not write that prompt to
CCR logs.

## Turn it off

Use either option:

```json
{
  "MORPH_ROUTER": {
    "enabled": false
  }
}
```

or remove `CUSTOM_ROUTER_PATH` from `config.json`.

Restart after changing config:

```bash
ccr restart
```

## Troubleshooting

- If Morph is not called, check `MORPH_ROUTER.enabled`,
  `MORPH_API_KEY`, `CUSTOM_ROUTER_PATH`, and that `ccr restart` was run.
- If Morph returns a model CCR cannot call, add it to the matching provider,
  add a `model_map`, or set a configured `fallback`.
- If CCR still uses its normal route, check whether the request is a preserved
  scenario such as thinking, web search, long context, background, explicit
  `/model`, or subagent routing.
