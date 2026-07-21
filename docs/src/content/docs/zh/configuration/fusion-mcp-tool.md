---
title: 自定义 MCP 工具
pageTitle: 自定义 MCP 工具
eyebrow: Fusion
lead: 将内置工具、本地或远程 MCP 工具接入 Fusion 模型。
---

## 添加入口

在 Fusion 模型的 **Tools** 中选择内置工具，或点击 **Add custom MCP** 接入自定义服务。

自定义 MCP 支持：

- **stdio**：本地命令行工具。
- **streamable-http / sse**：远程 MCP 服务。
- **Discover tools**：读取 MCP server 暴露的工具。

## 图片生成与视频生成

媒体能力以 **图片生成** 和 **视频生成** 两个普通的 Fusion 内置工具提供，使用方式与内置搜索工具一致，不属于 ToolHub，也没有单独的 Fusion 配置板块。

Fusion 工具循环不再设置轮次上限或工具调用次数上限；请求超时和客户端取消仍然生效。

每个工具只配置一个模型：

- 选择 `供应商/模型` 时，CCR 将请求交给 ai-gateway；供应商地址、凭据、额外请求头和请求体都由网关统一应用。媒体工具不会再次要求输入 xAI API Key。
- 导入 Grok Agent 后会自动提供 `grok-imagine-image-quality` 和 `grok-imagine-video`。ai-gateway 复用已有 OAuth 登录态访问 `api.x.ai`，不会启动 Grok CLI。
- 图片模型和视频模型彼此独立；不同 Fusion 模型也可以选择不同的媒体模型。

配置步骤：

1. 在 **供应商** 页面配置支持图片/视频生成协议的供应商及模型，或导入已登录的 Grok Agent。
2. 新建或编辑 Fusion 模型，在 **Tools** 中添加 **图片生成**、**视频生成**，或同时添加两者。
3. 在对应工具下选择模型，保存 Fusion 模型。
4. 将该 Fusion 模型选为 Agent 模型或路由目标。

CCR 通过 ai-gateway 的通用媒体协议调用供应商：图片使用 `images/generations` 与 `images/edits`，视频使用 `videos/generations` 与 `videos/{id}`。模型选择器显示声明或检测到对应媒体能力的供应商模型，Grok API 只是其中一种实现。

## 运行时工具

保存 Fusion 模型后，CCR 为该模型生成独立的运行时工具名，防止多个 Fusion 配置之间的模型绑定互相覆盖。

| Fusion 工具 | 运行时能力 |
| --- | --- |
| 图片生成 | 生成图片；编辑 1–3 张本地图片。 |
| 视频生成 | 启动文本/图片/参考图生视频任务；查询或取消异步任务。 |

付费提交接受可选 `idempotency_key`。一次用户意图应复用稳定的 Key，避免网络重试产生重复计费。视频始终异步执行，启动调用会立即返回 Job ID。

API 后端支持生图、图片编辑、文生视频、图生视频和参考图生视频。媒体执行不会再启动嵌套 Agent 或 CLI 进程。

## 产物与安全

生成产物保存在 CCR 私有数据目录，结果包含本地路径、MIME、大小、SHA-256 和限时 URL；视频 URL 支持 HTTP Range。保留期、并发和超时是 CCR 的内部安全策略，不在 Fusion UI 中要求用户配置。

本地图片仍会校验真实路径、文件头和大小。CCR 默认允许范围明确的当前工作目录、系统临时目录和 CCR 配置目录；文件系统根目录、用户主目录及其上级目录不会被隐式信任。确实需要扩大范围时，请显式配置 `allowedInputRoots`。UI 不再显示“允许读取图片的目录”。

需要绕过 Fusion 直接接入 MCP 客户端时，可以连接：

```text
http://127.0.0.1:3456/__ccr/media/mcp
Authorization: Bearer <CCR API Key>
```

该端点使用 CCR API Key；产物 URL 使用独立限时 token。旧 `/__ccr/grok-media/*` 路径仍作为迁移兼容入口。
Fusion 内部通过随 Core 配置生成的 `stdio` MCP 代理注册这些工具；代理直接返回当前 Profile 的确定工具清单，再将实际调用转发到上述私有端点，避免 HTTP MCP 发现失败或启动时序导致工具缺失。

内部策略配置示例（通常不需要手动修改）：

```json
{
  "mediaTools": {
    "enabled": true,
    "artifactTtlHours": 24,
    "jobTimeoutMs": 600000,
    "maxImageConcurrency": 2,
    "maxVideoConcurrency": 1,
    "allowedInputRoots": []
  }
}
```

旧 `grokMedia` 配置会在读取时迁移到 `mediaTools`。旧 `grok-cli` 媒体绑定会解析到已导入的 Grok Agent 或已配置的 Grok API 模型，不会再启动 CLI。

## 验证建议

先使用一个测试 Fusion 模型验证供应商是否实现对应媒体端点，再用于生产路由。
