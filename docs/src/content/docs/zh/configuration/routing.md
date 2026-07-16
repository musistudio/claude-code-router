---
title: 路由配置
pageTitle: 路由配置
eyebrow: 详细配置
lead: 设置请求如何选择模型，并在失败时通过 Fallback 自动重试或切换到备用模型。
---

## 内置路由

### Claude Code

Claude Code 内置路由的作用是识别 Claude Code 发来的请求，并把主请求路由到 Claude Code Agent 配置中的模型。

Claude Code **主请求** 使用 Claude Code Agent 配置中的模型；如果未设置，该内置路由不会生效。CCR 也会自动删除 Claude Code 注入的第一条 `x-anthropic-billing-header` system 消息，避免这类计费辅助消息影响后续路由判断。Claude Code 创建的 Subagent、Task 或 Workflow 内部 Agent 可以继续用下面的标签机制自动选择不同模型。

#### Subagent / Workflow 自动路由

Claude Code 的 Agent / Task / Workflow 可以派生新的模型请求。CCR 使用标签注入来让这些派生请求选择更合适的 CCR 模型：

```text
<CCR-SUBAGENT-MODEL>供应商/模型</CCR-SUBAGENT-MODEL>
```

完整流程如下：

1. Claude Code 主请求命中内置路由后，CCR 会检查当前工具列表。
2. 如果至少有一个模型配置了 **Description**，CCR 会把可用模型及其说明注入到 `Agent` / `Task` 工具说明和 `prompt` 字段说明里。
3. 如果工具列表里有 `Workflow`，CCR 会给 Workflow 工具说明追加要求：workflow 内部创建 `Agent` / `Task` 时，每个派生 Agent 的 prompt 第一行都要带同样的模型标签。
4. Claude Code 调用 `Agent` / `Task`，或 Workflow 内部创建 Agent 时，prompt 第一行会携带 `<CCR-SUBAGENT-MODEL>供应商/模型</CCR-SUBAGENT-MODEL>`。
5. 派生请求进入 CCR 后，CCR 从 system 或前两条 user message 中提取并删除这个标签，然后把该请求路由到标签里的模型。

因此，Subagent / Workflow 的自动路由由 prompt 标签决定模型。`x-claude-code-agent-id` 等 Header 用于观测，模型选择以标签为准。

##### 与模型页配合

模型页里的 **Description** 是这套机制的开关和选择依据。没有任何模型 Description 时，CCR 不会注入 Agent / Task / Workflow 路由提示词，避免把空模型列表写进工具说明。

推荐配置步骤：

1. 在 **供应商** 中添加可用模型，确认模型 ID 可以真实请求。
2. 打开 **模型** 页面，为希望 Subagent 自动选择的模型填写 Description。说明要写清模型适合的任务、速度、成本和限制。
3. 在 **Agent配置** 中启用 Claude Code 配置，并设置主模型。这个模型负责 Claude Code 主会话。
4. 在 **路由** 页面确认 **Claude Code** 内置路由已启用。
5. 在 Claude Code 中使用 Agent、Task 或 Workflow。需要派生 Agent 时，Claude Code 会根据模型 Description 选择一个 CCR 模型并写入标签。

Description 建议写成任务导向，而不是只写模型厂商名。例如：

| 模型用途 | Description 示例 |
| --- | --- |
| 快速便宜模型 | 适合代码搜索、文件梳理、摘要、简单修改和低成本并行 Subagent。 |
| 强推理模型 | 适合复杂架构分析、大规模重构计划、跨文件推理和高风险代码审查。 |
| 长上下文模型 | 适合读取大量日志、长文档、仓库级上下文整理和 Workflow 汇总。 |

保存后，CCR 会把这些 Description 组织成 “Configured CCR gateway models” 注入给 Claude Code。Claude Code 选择模型后，CCR 会在派生请求上看到 `builtin:claude-code-subagent`，并把标签里的模型作为最终 `resolved model`。

### Codex

Codex 内置路由会为第三方或非 GPT 模型适配 Codex 的 `apply_patch` 文件编辑工具。目标是让这些模型通过 patch 工具完成文件修改，而不是生成 `cat >`、`sed -i`、`python`、`node` 等命令或脚本来编辑文件。

技术原理是做一次工具协议桥接：Codex 原生的 `apply_patch` 是 custom/freeform 工具，入参是原始 patch 文本；很多 OpenAI-compatible 三方模型更擅长普通 function tool。CCR 会在上游请求中把 `apply_patch` 转成 `virtual_apply_patch` function tool，并在工具说明里注入完整的 `apply_patch.lark` 语法，要求模型把 patch 写入 `patch` 字段。

模型返回 `virtual_apply_patch` 后，CCR 会把它转换回 Codex 期望的 `custom_tool_call`：`name = apply_patch`，`input = 原始 patch 文本`。CCR 不直接修改文件，真正执行 patch 的仍然是 Codex 客户端。这个适配跟随 **Codex** 内置路由启用或关闭，没有单独开关；GPT 命名模型继续使用 Codex 原生 freeform `apply_patch` 路径。

## 自定义路由

自定义路由在路由页的规则列表中配置。页面顶部的 **搜索路由规则** 可以按名称、条件、请求动作等文本过滤列表；右上角 **添加** 按钮打开 **添加路由规则** 弹窗。规则表格按 **名称**、**条件**、**请求动作**、**状态**、**操作** 展示每条规则。

自定义规则按列表顺序匹配，第一条命中的启用规则会改写请求。表格右侧的上移、下移按钮用来调整优先级，编辑按钮打开 **编辑路由规则**，删除按钮会先弹出确认框。**状态** 列的开关关闭后，规则保留在列表里，但不会参与匹配。

### 添加或编辑规则

弹窗里的字段和保存后的配置一一对应：

| UI 字段 | 填写方式 | 保存后的含义 |
| --- | --- | --- |
| **名称** | 填一个便于识别的规则名。该字段不能为空。 | 显示在列表 **名称** 列，也参与搜索。 |
| **条件** | 选择 `request.header` 或 `request.body`，填写字段名、操作符和值。 | 生成 `condition.left`、`condition.operator` 和 `condition.right`。 |
| **改写请求参数** | 至少保留一行 rewrite。每行选择操作、目标 key 和需要的值。 | 生成 `rewrites`，规则命中后按行改写请求。 |
| **启用** | 打开或关闭规则。 | 控制 `enabled`，关闭时不会匹配。 |
| **失败时** | 配置这条规则自己的 Fallback。 | 规则命中后覆盖页面顶部的 **默认失败处理**。 |

**添加** 或 **保存** 按钮只有在表单有效时才可点击：名称、条件字段、条件值都必须填写；每条 rewrite 都必须有 key。`删除` 操作只需要 key；`替换数组元素` 需要同时填写 **匹配值** 和 **值**；其他操作需要填写 **值**。

单个条件无法表达需求时，可把规则类型改成 **Node.js 脚本**。选择本地脚本文件后，脚本可以动态返回目标模型、rewrite 和 fallback。编辑器会在保存前读取并编译文件，并提供 JSON 测试请求，可在不发起真实上游模型请求的情况下试跑。

### Node.js 脚本规则

当普通条件无法表达多字段判断、灰度分流、外部策略查询或动态请求改写时，可以使用 Node.js 脚本规则。脚本在可复用的 Worker 中以异步 JavaScript 执行：读取完整请求，通过受控的 `api` 访问网络、文件系统和环境变量，最后返回“是否命中、目标模型、请求改写和失败处理”。

脚本按规则列表顺序执行。返回“不命中”时继续检查下一条规则；返回“命中”时使用脚本给出的路由结果。脚本异常、超时或返回值无效时采用 fail-open：记录路由诊断并继续下一条规则。

#### 创建脚本文件

1. 新建扩展名为 `.js`、`.mjs` 或 `.cjs` 的本地文件。
2. 在路由规则编辑器中把 **规则类型** 设为 **Node.js 脚本**。
3. 选择脚本文件，设置 10–30000 毫秒的超时时间，然后使用 **验证** 或 **测试脚本** 检查结果。
4. 保存规则。CCR 会在每次执行前重新读取文件，因此后续修改脚本内容不需要重新保存规则。

桌面版文件选择器保存绝对路径。Web UI 不能获得浏览器所选文件的真实路径，需要手动填写 CCR 服务所在机器上的绝对路径、相对路径或 `~/...` 路径；相对路径以 CCR 进程的工作目录为基准。单个脚本文件最大 64 KiB。

脚本文件是一个 **异步函数体**，不是 CommonJS 或 ES Module。直接使用已注入的 `input`、`api` 和 `return`：

```js
if (input.body.model !== "供应商/原模型") {
  return null;
}

return {
  model: "供应商/目标模型"
};
```

顶层可以使用 `await`。不要添加 `module.exports`、`export default` 或 `import`，也不能使用 `require`、`process`、`Buffer` 或原生 `fetch`；网络和文件操作使用下文的 `api`。`input` 和 `api` 都被冻结，脚本应通过返回 `rewrites` 改写请求，而不是直接修改 `input.body` 或 `input.headers`。

#### `input`：请求参数

每次执行都会收到独立的只读 `input` 对象：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `input.body` | `Record<string, unknown>` | 完整 JSON 请求体。 |
| `input.headers` | `Record<string, string \| string[]>` | 完整请求 Header；可能包含鉴权、Cookie、API Key 和 CCR 内部 Header。 |
| `input.method` | `string` | HTTP 方法，例如 `POST`。 |
| `input.url` | `string` | 网关内的请求 URL，例如 `/v1/messages`。 |
| `input.model` | `string \| undefined` | `input.body.model` 为字符串时的快捷字段。 |
| `input.tokenCount` | `number` | CCR 估算的输入 Token 数；无法估算时为 `0`。 |
| `input.sessionId` | `string \| undefined` | CCR 能解析到的会话 ID。 |
| `input.apiKeyId` | `string \| undefined` | `x-auth-api-key-id` Header 中的 CCR API Key 标识，不是原始密钥。 |
| `input.builtInSubagentModel` | `string \| undefined` | CCR 能识别到的内置子代理模型。 |
| `input.summary.lastUserText` | `string` | 最后一条用户消息的文本，最多 16 KiB 字符。 |
| `input.summary.systemText` | `string` | System 内容的文本，最多 8 KiB 字符。 |
| `input.summary.messageCount` | `number` | `body.messages` 的元素数量。 |
| `input.summary.toolNames` | `string[]` | 从 `body.tools` 提取的工具名，最多 128 个。 |
| `input.summary.hasImage` | `boolean` | 请求体中是否检测到图片内容。 |

Header 名通常应按小写读取。值可能是字符串数组，可按下面的方式兼容：

```js
const rawTenant = input.headers["x-tenant-id"];
const tenant = Array.isArray(rawTenant) ? rawTenant[0] : rawTenant;
```

#### 测试请求 JSON

规则编辑器中的 **测试请求 JSON** 用来构造一次脚本输入，不会发送真实的模型上游请求。`body` 必须是 JSON 对象，其他字段可选：

| 字段 | 类型 | 默认值 |
| --- | --- | --- |
| `body` | JSON 对象 | 必填 |
| `headers` | `Record<string, string \| string[]>` | `{}` |
| `method` | `string` | `POST` |
| `url` | `string` | `/v1/messages` |
| `sessionId` | `string` | 无 |
| `tokenCount` | `number` | `0` |

请求头和请求体可以同时定义：

```json
{
  "headers": {
    "authorization": "Bearer test-token",
    "x-tenant-id": "enterprise",
    "x-tags": ["review", "production"]
  },
  "body": {
    "model": "供应商/原模型",
    "messages": [
      { "role": "user", "content": "请审查这段代码" }
    ]
  },
  "method": "POST",
  "url": "/v1/messages",
  "sessionId": "test-session",
  "tokenCount": 1200
}
```

测试不会请求模型，但会真实执行脚本中的 `api.fetch`、文件读取和文件写入，因此测试有副作用的脚本时应使用专门的测试地址和测试文件。

#### `api.fetch`：网络访问

```js
const response = await api.fetch(url, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ tenant: "enterprise" })
});
```

- `url` 仅支持没有内嵌用户名或密码的 `http:` 和 `https:` URL，也可以访问本机或内网服务。
- `method` 默认为 `GET`；`headers` 只接受字符串值；`body` 必须是字符串。
- 不自动跟随重定向，所有网络操作都受当前脚本的总超时时间限制。
- 请求体最大 256 KiB，响应体最大 1 MiB。响应体始终作为 UTF-8 字符串返回，需要 JSON 时自行调用 `JSON.parse`。

返回对象结构如下：

```js
{
  ok: true,                  // HTTP 状态是否为 2xx
  status: 200,
  statusText: "OK",
  url: "https://example.com/policy",
  headers: { "content-type": "application/json" },
  body: "{\"model\":\"供应商/目标模型\"}",
  redirected: false
}
```

#### `api.fs`：文件系统访问

路径可以是绝对路径、相对路径或 `~/...`。访问范围不受白名单限制，但仍受 CCR 进程自身的操作系统权限约束。

| API | 返回值 | 说明 |
| --- | --- | --- |
| `await api.fs.exists(path)` | `boolean` | 文件或目录是否可访问。 |
| `await api.fs.readText(path)` | `string` | 以 UTF-8 读取文件。 |
| `await api.fs.readJson(path)` | `unknown` | 读取 UTF-8 文件并执行 `JSON.parse`。 |
| `await api.fs.list(path)` | `Array<{ name, isFile, isDirectory, isSymbolicLink }>` | 列出一层目录，最多 256 项。 |
| `await api.fs.stat(path)` | `{ size, modifiedAt, isFile, isDirectory }` | 返回字节大小、ISO 修改时间和文件类型。 |
| `await api.fs.writeText(path, value)` | `void` | 以 UTF-8 写入字符串；不会自动创建父目录。 |
| `await api.fs.writeJson(path, value)` | `void` | 以两空格缩进写入 JSON，并在末尾添加换行。 |

单次读取或写入的文件内容最大 1 MiB。

#### `api.env` 和 `api.hash`

| API | 返回值 | 说明 |
| --- | --- | --- |
| `api.env(name)` | `string \| undefined` | 读取 CCR 进程中的任意环境变量。 |
| `api.hash(value)` | `number` | 根据字符串形式返回稳定的 32 位无符号哈希，适合稳定灰度分桶；它不是加密哈希。 |

#### 返回值

除 `undefined` 外，脚本返回值必须可 JSON 序列化，最大 64 KiB。

| 返回值 | 路由行为 |
| --- | --- |
| `null`、`undefined`、`false` | 当前规则不命中，继续下一条规则。 |
| `{ match: false }` | 当前规则不命中；对象中的其他字段被忽略。 |
| `true` | 当前规则命中，使用规则或全局默认 fallback。 |
| `{ match?, model?, rewrites?, fallback? }` | 当前规则命中并使用对象中的动态决策。 |

动态决策对象支持：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `match` | `boolean` | 只有 `false` 有特殊含义，表示不命中。 |
| `model` | `string` | 目标模型选择器，必须是当前 CCR 已配置的模型。 |
| `rewrites` | `Rewrite[]` | 请求改写，最多 32 条，按数组顺序执行。 |
| `fallback` | `Fallback` | 覆盖该规则或全局默认失败处理。 |

字符串、数字或数组不能直接作为路由结果。未识别的对象字段不会参与路由。

##### Rewrite 结构

```js
{
  key: "request.body.temperature",
  operation: "set",
  value: 0.2
}
```

`key` 必须以 `request.body.`、`request.header.` 或 `request.headers.` 开头。Body 路径使用点号分段，数字段表示数组下标。Header 名会转成小写；Header 改写只应使用 `set` 或 `delete`，且 `set` 的值必须是字符串。

| `operation` | 必需字段 | 行为 |
| --- | --- | --- |
| `set` | `value` | 设置或创建字段；省略 `operation` 时默认为 `set`。 |
| `delete` | 无 | 删除字段或数组下标。 |
| `array-append` | `value` | 在数组末尾添加元素；原值不是数组时从空数组开始。 |
| `array-prepend` | `value` | 在数组开头添加元素。 |
| `array-remove` | `value` | 删除与 `value` 匹配的数组元素。 |
| `array-replace` | `match`、`value` | 把与 `match` 匹配的数组元素替换为 `value`。 |

Rewrite 的 `value` 和 `match` 必须是 JSON 值。`__proto__`、`constructor`、`prototype` 等不安全路径会被拒绝。脚本不能改写鉴权、Cookie、Host、Content-Length、连接控制 Header、`x-auth-*` 或 `x-ccr-*` 等受保护 Header。

##### Fallback 结构

```js
{
  mode: "model-chain",
  models: ["供应商/备用模型一", "供应商/备用模型二"],
  retryCount: 0
}
```

| `mode` | 行为 |
| --- | --- |
| `off` | 只尝试当前选中的模型。 |
| `retry` | 当前模型失败后重试 `retryCount` 次。 |
| `model-chain` | 当前模型失败后按 `models` 顺序尝试备用模型。 |

`mode` 必填。`models` 可选，默认为 `[]`，其中每一项都必须是已配置模型；`retryCount` 可选，默认为 `0`，必须是 0–9999 的整数。

#### 完整示例：租户策略、灰度分流与请求改写

下面的 `enterprise-route.js` 会读取租户 Header，从本地 JSON 和可选的远程接口取得策略，使用会话 ID 做稳定灰度分桶，然后返回模型、请求改写和备用模型链：

```js
const rawTenant = input.headers["x-tenant-id"];
const tenant = Array.isArray(rawTenant) ? rawTenant[0] : rawTenant;

// 没有租户信息时让后续规则继续处理。
if (!tenant) {
  return null;
}

// 本地文件示例：{ "enterprise": { "model": "供应商/主模型" } }
const policyFile = api.env("CCR_ROUTING_POLICY_FILE")
  ?? "~/.config/ccr/routing-policy.json";
let policy = {};
if (await api.fs.exists(policyFile)) {
  const policies = await api.fs.readJson(policyFile);
  policy = policies?.[tenant] ?? {};
}

// 如果配置了策略服务，用远程结果覆盖本地策略。
const policyUrl = api.env("CCR_ROUTING_POLICY_URL");
if (policyUrl) {
  const response = await api.fetch(policyUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${api.env("CCR_ROUTING_POLICY_TOKEN") ?? ""}`
    },
    body: JSON.stringify({
      tenant,
      model: input.model,
      sessionId: input.sessionId,
      tokenCount: input.tokenCount,
      lastUserText: input.summary.lastUserText
    })
  });

  if (!response.ok) {
    throw new Error(`Policy service returned HTTP ${response.status}`);
  }
  policy = { ...policy, ...JSON.parse(response.body) };
}

if (!policy.model || policy.enabled === false) {
  return { match: false };
}

// 相同会话会稳定落在同一个 0–99 分桶。
const bucketKey = input.sessionId ?? `${tenant}:${input.summary.lastUserText}`;
const bucket = api.hash(bucketKey) % 100;
const rolloutPercent = Number(policy.rolloutPercent ?? 100);
if (bucket >= rolloutPercent) {
  return null;
}

return {
  model: policy.model,
  rewrites: [
    {
      key: "request.body.temperature",
      operation: "set",
      value: Number(policy.temperature ?? 0.2)
    },
    {
      key: "request.header.x-route-policy",
      operation: "set",
      value: `tenant:${tenant}`
    }
  ],
  fallback: {
    mode: "model-chain",
    models: Array.isArray(policy.fallbackModels)
      ? policy.fallbackModels
      : ["供应商/备用模型"],
    retryCount: 0
  }
};
```

示例中的 `policy.model` 和 `policy.fallbackModels` 必须对应 CCR 中已经配置的模型，否则该规则会产生诊断并按“不命中”处理。

#### 保存配置与运行限制

规则保存后的配置结构如下。通常由 UI 生成，不需要手工编辑：

```json
{
  "id": "enterprise-policy",
  "name": "企业租户策略",
  "enabled": true,
  "type": "script",
  "script": {
    "apiVersion": 1,
    "file": "/Users/example/.config/ccr/enterprise-route.js",
    "language": "javascript",
    "timeoutMs": 2000
  }
}
```

| 限制 | 当前值 |
| --- | --- |
| 脚本文件 | 最大 64 KiB |
| 执行超时 | 10–30000 毫秒，默认 2000 毫秒 |
| Fetch 请求体 / 响应体 | 256 KiB / 1 MiB |
| 单次文件读取或写入 | 1 MiB |
| 单次目录列表 | 最多 256 项 |
| 动态 Rewrite | 最多 32 条 |
| 脚本返回值 | 最大 64 KiB，必须可 JSON 序列化 |

Worker 对堆内存、栈、等待队列和硬超时设有资源限制。同一规则在 60 秒内失败 3 次后会熔断 30 秒；脚本文件内容变化后会重新编译，并按新的脚本版本进行熔断计数。

Worker 隔离不是操作系统级安全沙箱。`api.fetch`、`api.fs` 和 `api.env` 没有白名单，脚本继承 CCR 进程可访问的网络、文件和环境变量权限，只应运行可信脚本。

旧配置中的内联 `source` 仍可继续运行；为规则选择脚本文件并保存后，会改为上述本地 `file` 结构。旧的 `readPaths`、`permissions` 和脚本规则静态 `rewrites` 不再需要，脚本需要改写请求时直接返回 `model` 或 `rewrites`。

### 条件

**条件** 区域有四个输入：来源、字段、操作符和值。

| 来源 | 字段示例 | 实际匹配路径 |
| --- | --- | --- |
| `request.header` | `user-agent`、`x-api-key`、`x-client-name` | `request.header.user-agent` |
| `request.body` | `model`、`messages`、`messages.0.role`、`tools` | `request.body.model` |

Header 名不区分大小写。Body 字段按点号路径读取，数字片段表示数组下标；例如 `messages.0.role` 读取第一条 message 的 role。对于 messages、tools 这类嵌套数组，通常用 `contains deep` 比固定下标更稳。

值输入框会按常见字面量解析：`true`、`false`、`null`、数字、JSON 对象或数组会按对应类型比较；其他内容按字符串处理。需要强制作为字符串时，可以写成 `"123"` 或 `'123'`。

| 操作符 | 用法 |
| --- | --- |
| `==` / `!=` | 比较实际值和输入值。数字会按数字比较，其他值按可比较文本比较。 |
| `>` / `>=` / `<` / `<=` | 两边都是数字时按数字比较，否则按文本顺序比较。 |
| `starts with` | 判断实际值是否以输入值开头，适合模型前缀分流。 |
| `contains` | 对字符串做包含判断；对数组只检查数组元素。 |
| `contains deep` | 递归检查对象和数组，适合在 `messages`、`tools` 中查找内容。 |
| `not contains` | `contains` 的反向判断。 |

### 改写请求参数

**改写请求参数** 区域默认给出一行 `request.body.model`。这也是最常用的模型路由写法：选择 **设置**，key 填 `request.body.model`，值填目标 `供应商/模型` 或 Fusion 模型。

点击 **添加参数** 可以追加多行 rewrite；垃圾桶按钮删除当前行，最后一行不能删除。规则命中后，CCR 会按列表顺序应用这些 rewrite。

| 操作 | 需要填写 | 行为 |
| --- | --- | --- |
| **设置** | key、值 | 设置请求里的字段，例如 `request.body.model = provider/model` 或 `request.body.temperature = 0.2`。 |
| **删除** | key | 删除请求字段。删除 `request.header.x-test` 会移除对应 Header；删除 `request.body.foo` 会移除 body 字段。 |
| **追加到数组** | key、值 | 把值追加到目标数组末尾。目标不是数组时按空数组开始。 |
| **插入到数组开头** | key、值 | 把值插到目标数组开头。 |
| **从数组移除** | key、值 | 从目标数组中移除等于该值的元素。 |
| **替换数组元素** | key、匹配值、值 | 把数组中匹配 **匹配值** 的元素替换为新值。 |

Rewrite 的值也会按字面量解析，所以 `0.2` 会变成数字，`true` 会变成布尔值，`{"type":"web_search"}` 会变成对象。只有 `request.body.model` 的值会额外按 CCR 的模型选择器格式规范化。

### 失败时

弹窗底部的 **失败时** 和页面顶部的 **默认失败处理** 是同一套控件。选择 **关闭** 时不降级；选择 **继续重试** 时会出现 **重试次数**；选择 **失败降级目标** 时会出现 **失败降级目标** 输入框和 **添加** 按钮。添加后的目标会以标签形式显示，标签上的上移、下移、移除按钮用于调整降级顺序。

规则命中时会使用这条规则自己的 **失败时** 设置；没有命中的请求才继续使用页面顶部的默认设置。

### 配置示例

| 目标 | 条件来源 | 字段 | 操作符 | 值 | 改写请求参数 |
| --- | --- | --- | --- | --- | --- |
| 按客户端 Header 分流 | `request.header` | `x-client-name` | `==` | `claude-code` | **设置** `request.body.model = 供应商/模型` |
| 按原始模型前缀分流 | `request.body` | `model` | `starts with` | `claude-` | **设置** `request.body.model = 供应商/模型` |
| 按消息内容分流到视觉模型 | `request.body` | `messages` | `contains deep` | `image` | **设置** `request.body.model = 视觉供应商/模型` |
| 删除调试 Header | `request.header` | `x-debug-route` | `==` | `1` | **删除** `request.header.x-debug-route` |

保存后，规则会出现在列表中。请求日志里的 `request model`、`resolved provider`、`resolved model` 和路由原因可以用来确认规则是否命中。

## Fallback 处理

Fallback 处理请求失败后的降级。第一次选模型由路由完成；当前模型或上游失败时，Fallback 决定是否继续尝试。

路由页面顶部的 **默认失败处理** 是全局 Fallback。每条路由规则里的 **失败时** 是规则级 Fallback：当某条规则命中时，规则级配置会覆盖全局配置。

## Fallback 模式

| 模式 | 行为 |
| --- | --- |
| 关闭 | 不做失败降级，只请求一次当前模型 |
| 继续重试 | 继续请求当前模型，最多重试 `Retries` 次 |
| 失败降级目标 | 先请求当前模型，失败后按配置顺序切换到备用模型 |

**继续重试** 适合上游偶发超时、限流或网络抖动。**失败降级目标** 适合主模型不可用时切到另一个模型或供应商。

## 失败触发条件

网络错误会进入下一次尝试。状态码是否触发 Fallback 取决于模式：

| 模式 | 触发状态码 |
| --- | --- |
| 继续重试 | `408`、`409`、`429`、`5xx` |
| 失败降级目标 | 任意 `4xx` 或 `5xx` |

进入下一次尝试前，CCR 会对每个触发 Fallback 的失败进行等待，包括网络错误。上游提供正数 `Retry-After` 时会优先遵守；否则使用从 1 秒开始、单次最多 30 秒的指数退避。

**失败降级目标** 对 `4xx` 也会切换，是因为模型不存在、鉴权或供应商侧拒绝等错误可能只影响当前目标。切换后如果备用模型可用，请求仍然可以成功。

## 如何配置

### 全局失败降级

在路由页面顶部配置 **默认失败处理**：

1. 选择 **继续重试** 或 **失败降级目标**。
2. 如果选择 **继续重试**，填写 `Retries`。
3. 如果选择 **失败降级目标**，按优先级添加备用模型。

全局 Fallback 会应用到没有单独配置 Fallback 的规则。

### 规则级失败降级

添加或编辑路由规则时，可以在 **失败时** 中配置这条规则自己的 Fallback。

规则级 Fallback 适合高风险或高成本模型。例如：图片任务先走 Fusion 视觉模型，失败后切到另一个多模态模型；复杂任务先走强模型，失败后切到稳定模型。

## 验证方式

保存后发一次请求，到请求日志里检查：

- `request model`：客户端原始请求模型。
- `resolved provider`：最终命中的供应商。
- `resolved model`：最终请求的模型。
- 状态码和错误信息。

如果发生了 Fallback，响应头里会带有 `x-ccr-fallback-attempts`、`x-ccr-fallback-failures`、延迟尝试的 `x-ccr-fallback-delays-ms`，以及最终命中的 `x-ccr-fallback-model`。请求日志详情里也会显示关联的重试尝试列表。
