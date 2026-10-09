---
title: 自部署 OpenAI 兼容模型
pageTitle: 自部署模型
eyebrow: 快速开始
lead: 把自己部署的模型（vLLM、SGLang、Ollama、LM Studio）接入 CCR：填写本地 API 端点、选择 OpenAI Chat 协议、填入部署时的模型名，并开启 Agent 需要的工具调用与上下文长度。
---

## 适用范围

任何提供 OpenAI Chat Completions 接口的推理服务都可以作为普通供应商接入 CCR，包括在自己机器或 GPU 服务器上部署的 DeepSeek-V3、Qwen、GLM、Llama 等开源模型。CCR 没有为自部署服务提供预设，选择 **其他 / 自定义 API 端点**，把地址指向推理服务监听的端口即可。

Claude Code 等 Agent 依赖函数调用和长提示词。大多数自部署服务默认不开启工具调用，上下文上限也远低于 Agent 实际发送的长度，因此[部署模型](#部署模型)中的启动参数与 CCR 侧的配置同样重要。

## 部署模型

以 vLLM 部署 DeepSeek-V3 为例：

```bash
vllm serve deepseek-ai/DeepSeek-V3 \
  --served-model-name deepseek-v3 \
  --host 0.0.0.0 --port 8000 \
  --api-key ccr-local \
  --max-model-len 131072 \
  --enable-auto-tool-choice --tool-call-parser deepseek_v3
```

| 参数 | 对 CCR 的意义 |
| --- | --- |
| `--served-model-name` | CCR 向上游发送、并在路由中展示的模型 ID。不指定时模型 ID 是完整模型路径，例如 `deepseek-ai/DeepSeek-V3`。 |
| `--host` / `--port` | CCR 与 GPU 机器不在同一台主机时必须使用 `--host 0.0.0.0`，API 端点随之填写局域网地址。 |
| `--api-key` | 设置 vLLM 校验的密钥。不加该参数时 vLLM 接受任意请求，只要端口在本机之外可达就建议设置密钥。 |
| `--max-model-len` | 限制提示词与生成的总 token 数。Agent 请求包含系统提示词、工具定义和文件上下文，窗口过小时不会在连通性检查阶段暴露，而是在会话中途失败。 |
| `--enable-auto-tool-choice` 与 `--tool-call-parser` | 把模型的工具语法转换成 OpenAI `tool_calls`。不开启时上游只返回纯文本，Agent 的工具调用不会执行。解析器需匹配模型系列，例如 `deepseek_v3`、`hermes`、`llama3_json`、`mistral`。 |
| `--reasoning-parser` | 推理模型下分离思考内容与正式回答，例如 `deepseek_r1`。 |

SGLang（`python -m sglang.launch_server --model-path <model> --host 0.0.0.0 --port 30000 --tool-call-parser deepseek-v3`）、Ollama（`http://127.0.0.1:11434/v1`）和 LM Studio（`http://127.0.0.1:1234/v1`）提供同一套协议，在 CCR 中的配置方式完全相同，只有端点和模型 ID 不同。

接入 CCR 前先确认服务本身可用：

```bash
curl -H "Authorization: Bearer ccr-local" http://127.0.0.1:8000/v1/models
```

## 在 CCR 中添加供应商

1. 打开 **供应商**，点击 **添加供应商**。
2. 在 **选择预设供应商** 中选择 **其他 / 自定义 API 端点**。
3. **名称** 填写便于识别的名字，例如 `vLLM 本地`。
4. **API 端点** 填写包含 `/v1` 的服务地址，例如 `http://127.0.0.1:8000/v1`。省略协议头的回环或内网地址（例如 `192.168.1.10:8000/v1`）会补全为 `http://`，公网域名补全为 `https://`。
5. **API 密钥** 填写 `--api-key` 的值。服务端不校验密钥时可填任意占位值，CCR 只负责转发。
6. CCR 会探测端点、识别协议，并从 `/v1/models` 拉取模型列表，从中勾选部署的模型。如果没有拉取到模型，在 **自定义模型** 中按 `--served-model-name` 的写法手动填入模型 ID。
7. 点击 **检查连接**，用一次真实请求同时验证端点、密钥、协议和模型 ID。

如果协议识别结果不对，在高级设置中关闭自动识别并手动选择 **OpenAI Chat**。只有服务端实现了 Responses 接口时才选择 **OpenAI Responses**；vLLM、SGLang、Ollama、LM Studio 提供的是 Chat Completions。

## 让 CCR 访问到推理服务

| CCR 所在位置 | 推理服务所在位置 | API 端点 |
| --- | --- | --- |
| 同一台机器 | 同一台机器 | `http://127.0.0.1:8000/v1` |
| 桌面版或 CLI | 局域网中的 GPU 机器 | 推理服务使用 `--host 0.0.0.0`，端点填 `http://192.168.1.10:8000/v1` |
| CCR 运行在 Docker | 推理服务在 Docker 宿主机 | `http://host.docker.internal:8000/v1`；Linux 上没有该别名时填宿主机局域网地址 |
| CCR 运行在宿主机 | 推理服务在 Docker | 发布推理服务端口后填 `http://127.0.0.1:8000/v1` |

容器内的 `127.0.0.1` 指向容器自身，因此回环地址无法访问宿主机上的推理服务。

## 把 Agent 流量路由到该模型

打开 **路由**，为需要本地承载的路由选择 `<供应商名称>/<模型 ID>`。自部署模型通常与托管模型混用：可以先只把后台或长上下文路由指向本地模型，默认路由保持托管模型，验证稳定后再全部切换为本地模型以实现完全离线。可用路由见[路由配置](../../configuration/routing/)。

随后从 CCR 启动 Agent 并发送一次请求。在 **设置 → 日志与观测** 中开启请求日志后，可以看到每次请求实际解析到的模型、发往上游的请求体以及上游返回的错误。

## 排查

| 现象 | 原因与处理 |
| --- | --- |
| 连通性检查在任何模型响应前就失败 | CCR 访问不到该端点。在 CCR 所在机器上用 `curl` 验证地址，确认 `--host 0.0.0.0`，并检查防火墙规则。 |
| 模型 ID 返回 `404` | 上游提供的 ID 与 CCR 发送的不一致。对比 `/v1/models` 的输出与模型列表，按 `--served-model-name` 对齐。 |
| 上游返回 `401` | API 密钥与 `--api-key` 不一致。 |
| Agent 只回复文字、从不调用工具 | 上游没有开启工具调用。使用 `--enable-auto-tool-choice` 并指定匹配模型的解析器重新启动。 |
| 长会话进行几轮后失败 | 提示词超过 `--max-model-len`。提高该值，或把长上下文路由指向其他模型。 |
| 内网地址保存后变成 `https://` | 地址带了显式的 `https://` 前缀，或该主机不属于内网地址段。显式填写 `http://`。 |
