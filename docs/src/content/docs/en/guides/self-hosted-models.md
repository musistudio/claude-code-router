---
title: Self-hosted OpenAI-compatible models
pageTitle: Self-hosted models
eyebrow: Quick start
lead: "Connect a model you serve yourself — vLLM, SGLang, Ollama, or LM Studio — to CCR: enter the local API endpoint, pick the OpenAI Chat protocol, add the served model name, and enable the tool calling and context length that agents require."
---

## Scope

Any runtime that exposes the OpenAI Chat Completions API can be added as a normal CCR provider, including DeepSeek-V3, Qwen, GLM, Llama, or any other open-weight model served from your own machine or GPU host. There is no dedicated preset: choose **Other / custom API endpoint** and point CCR at the address your runtime listens on.

Agents such as Claude Code rely on function calling and long prompts. Most self-hosted defaults do not enable tool calling and cap context far below what an agent sends, so the runtime flags in [Serve the model](#serve-the-model) matter as much as the CCR side.

## Serve the model

vLLM example for DeepSeek-V3:

```bash
vllm serve deepseek-ai/DeepSeek-V3 \
  --served-model-name deepseek-v3 \
  --host 0.0.0.0 --port 8000 \
  --api-key ccr-local \
  --max-model-len 131072 \
  --enable-auto-tool-choice --tool-call-parser deepseek_v3
```

| Flag | Why it matters for CCR |
| --- | --- |
| `--served-model-name` | The model ID CCR sends upstream and shows in routing. Without it, the ID is the full model path, such as `deepseek-ai/DeepSeek-V3`. |
| `--host` / `--port` | `--host 0.0.0.0` is required when CCR runs on a different machine than the GPU host. The API endpoint then uses the LAN address. |
| `--api-key` | Sets the key vLLM requires. vLLM accepts any request when the flag is omitted, so a key is recommended whenever the port is reachable outside the host. |
| `--max-model-len` | Caps prompt plus completion tokens. Agent requests carry system prompts, tool definitions, and file context, so a small window fails mid-session rather than at connection time. |
| `--enable-auto-tool-choice` and `--tool-call-parser` | Turn the model's tool syntax into OpenAI `tool_calls`. Without them the upstream answers in plain text and agent tool calls never execute. Pick the parser that matches the model family, such as `deepseek_v3`, `hermes`, `llama3_json`, or `mistral`. |
| `--reasoning-parser` | Separates reasoning content from the answer for reasoning models, such as `deepseek_r1`. |

SGLang (`python -m sglang.launch_server --model-path <model> --host 0.0.0.0 --port 30000 --tool-call-parser deepseek-v3`), Ollama (`http://127.0.0.1:11434/v1`), and LM Studio (`http://127.0.0.1:1234/v1`) expose the same protocol and are configured identically in CCR; only the endpoint and model IDs differ.

Confirm the runtime answers before moving to CCR:

```bash
curl -H "Authorization: Bearer ccr-local" http://127.0.0.1:8000/v1/models
```

## Add the provider in CCR

1. Open **Providers** and click **Add Provider**.
2. Under **Select preset provider**, choose **Other / custom API endpoint**.
3. Set **Name** to something recognizable, such as `vLLM local`.
4. Set **API endpoint** to the runtime address including `/v1`, such as `http://127.0.0.1:8000/v1`. A schemeless loopback or private address, such as `192.168.1.10:8000/v1`, is completed with `http://`; public hostnames are completed with `https://`.
5. Enter the **API key** from `--api-key`. When the runtime enforces no key, any placeholder works, because CCR only forwards it.
6. CCR probes the endpoint, detects the protocol, and lists models from `/v1/models`. Select the served model. If discovery returns nothing, add the ID under **Custom models** exactly as `--served-model-name` spells it.
7. Click **Check Connection** to send a real request and confirm endpoint, key, protocol, and model ID together.

If protocol detection picks the wrong protocol, disable it in Advanced settings and select **OpenAI Chat** manually. Use **OpenAI Responses** only when the runtime implements the Responses API; vLLM, SGLang, Ollama, and LM Studio serve Chat Completions.

## Reach the runtime from CCR

| CCR location | Runtime location | API endpoint |
| --- | --- | --- |
| Same machine | Same machine | `http://127.0.0.1:8000/v1` |
| Desktop or CLI | GPU host on the LAN | `http://192.168.1.10:8000/v1` with `--host 0.0.0.0` on the runtime |
| CCR in Docker | Runtime on the Docker host | `http://host.docker.internal:8000/v1`, or the host LAN address on Linux without that alias |
| CCR on the host | Runtime in Docker | Publish the runtime port, then use `http://127.0.0.1:8000/v1` |

`127.0.0.1` inside a container is the container itself, so a loopback endpoint never reaches a runtime on the host.

## Route agent traffic to it

Open **Routing** and select `<provider name>/<model id>` for the routes you want served locally. Self-hosted models are commonly mixed with hosted ones: keep the local model on background or long-context routes and leave the default route on a hosted model until the local setup is verified, or select it everywhere for a fully offline path. See the [routing reference](../../configuration/routing/) for the available routes.

Then start the agent from CCR and send one request. **Settings → Logs & Observability** with request logs enabled shows the resolved model, the upstream request body, and the upstream error for each attempt.

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| Connection check fails before any model responds | The endpoint is unreachable from CCR. Verify the address from the CCR machine with `curl`, check `--host 0.0.0.0`, and review firewall rules. |
| `404` on the model ID | The upstream serves a different ID than CCR sends. Compare `/v1/models` output with the model list and align it with `--served-model-name`. |
| `401` from the upstream | The API key does not match `--api-key`. |
| The agent replies in prose and never calls tools | Tool calling is off upstream. Serve with `--enable-auto-tool-choice` and the parser for the model family. |
| Long sessions fail after a few turns | The prompt exceeds `--max-model-len`. Raise it, or route long-context traffic elsewhere. |
| `https://` appears in the saved endpoint for a LAN host | The address was typed with an explicit `https://` prefix, or the host is not a private address. Enter `http://` explicitly. |
