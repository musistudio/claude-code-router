# 2026 年 10 月未处理 bug 修复记录

当前分支：`feat/v3.1.3`。范围是 10 月 issue 审查中尚未修复的问题；当前分支已合入的 #1858、#1865、#1866 保持现有实现。

每项新修复均先增加复现测试，记录失败，然后修改生产代码并验证通过。#1861 按作者要求先验证真实归属，未添加掩盖上游归属的响应 model 改写。

| 条目 | 修改前的复现 | 修复及最终结果 |
| --- | --- | --- |
| #1851 | Pi dispatch 参数测试和 Windows wrapper 生成测试均失败；selector 会被传入客户端。 | Windows Pi wrapper 复用现有 CLI 参数处理与 Windows 命令转义；只消费 profile/surface 分隔参数，保留提示词与 CLI 参数。独立 wrapper 中输入 `Pi` 仍是正常提示词。 |
| #1852 | 原生 Anthropic 虚拟模型 SSE 只有 message_start、message_delta、message_stop，缺少全部 content_block 事件；跨协议对照场景已通过。 | 同协议原生流使用现有透传路径；跨协议保持转换。源码回归保留思考、签名、文本、工具与用量；实际打包产物通过 JSON/SSE、计费开关和 UTF-8 分片测试。 |
| #1867 | 扫描接管与上传并发时上传得到 ENOENT/503；扫描间隔短于静默等待期时损坏 bundle 不过期；阻塞 sink 时 20 个 capture 全部排队；意外退出不重启。合并复核又复现：已开始的恢复任务在手动 stop/start 之后完成，覆盖手动操作。 | 接管与保留操作共享串行队列；不重写相同 manifest，继续 fsync；producer 最多保留 uploaderConcurrency × 3 个 capture，超过时跳过 body capture 并记录原因；重试结束释放容量；core 意外退出以 1、2、4…30 秒退避重启。手动 stop/start 取消待执行恢复，并等待已开始的恢复结束后再清理或启动，两个新增竞态测试先失败后通过。真实进程终止后能恢复健康状态并轮换内部鉴权。 |
| #1868 | 构造脚本输入会在主线程 JSON.parse 整个 2 MB body。 | 保留一次 JSON 快照，把字符串发送到 worker，移除主线程整包 parse/深拷贝和 worker 的重复 stringify；仍保持原始快照、冻结、超时及脚本能力隔离。没有增加预过滤配置或新规则类型。 |
| #1869 | 没有消费者时仍对完整对话执行两次 token 正则扫描。合并复核又复现：脚本未保留 custom router 设置或缓存的 tokenCount。 | request.tokenCount 惰性计算并缓存；尚未计算的值由脚本在 worker 首次读取时计算，已有值直接传递，保留显式 0 和自定义覆盖。新增兼容性测试先失败后通过。保留条件别名、custom router、已有 provider 路由设置、客户插件的 token 输入及 count_tokens。没有消费者时路由诊断 tokenCount 为 0。 |
| #1861 | 在实际 host → core → 两个独立模拟上游路径中检查请求目的地、最终响应和 SQLite。 | Chat Completions / Responses × JSON / SSE 均返回、记录 Backup/backup；未复现独立的响应 model 错误，当前实现无需新响应改写。保留回归测试。 |
| #1847（关联 PR） | 核验 #1861 时发现 Responses 的 primary 请求被裸 provider ID shortcut 送到 Chat 路径；既有 PR 的九个协议/credential 场景中七个失败。 | 裸 provider ID 通过协议和 credential 选择；已完整指定的内部 selector 保持有效。更新现有 executor 的公开名称断言为配置的 runtime ID。37 个相关测试通过，真实 fallback 两条腿的协议也正确。 |

## 最终验证

- 合并复核后的 CCR 定向回归（增加已运行恢复取消、token 覆盖兼容性，以及全部 router-builtins 场景）：272 项，270 通过，2 项 Windows 原生命令执行测试在 macOS 上跳过，0 失败。
- Gateway 定向回归：163 项全部通过；直接迁入上游后，全量回归为 938 项，931 通过、7 项既有跳过、0 失败。
- CCR 打包产物实际 HTTP / SQLite / managed core 进程回归：4 项全部通过。每项包含多个 JSON/SSE、协议或计费组合断言。
- 按 CCR 定向、gateway 全量和打包产物集成回归计（不重复计算 gateway 定向测试）：1214 项，1205 通过、9 跳过、0 失败。
- CCR 与 gateway 的生产 TypeScript 检查及 gateway 包含测试的完整 TypeScript 检查通过；gateway build 与 CCR `build:assets` 通过。
- 所有 gateway 修复及测试已直接迁入 `/Users/jinhuilee/products/next-ai/gateway`；CCR 直接消费上游源码及构建产物。发布 composite action 固定构建上游修复提交 `0a2c0abd48d2144ed0ac2ce4d954a661c51ffcb1` 并验证回归测试。

## 重现构建

按 [上游 gateway 开发与发布](./ai-gateway-development.md) 直接构建 gateway，再使用：

```sh
npm run build:assets
node build/test.mjs core
CCR_TEST_GATEWAY_ENTRY=/absolute/path/to/claude-code-router/packages/core/dist/main/next-ai-gateway.js npm run test:core
```

本次定向运行使用项目安装的 Electron Node runtime，匹配 better-sqlite3 的 ABI；本机系统 Node 的 ABI 与已安装 SQLite 模块不匹配。HTTP 测试仅使用 loopback 模拟上游，没有真实 API 付费调用。Windows wrapper 生成和参数处理已在 macOS 验证；两个原生 cmd.exe 测试需要 Windows 环境。没有进行数小时线上 OOM 压测。

## 合并建议

除 #1851 的 Windows 原生命令路径外，当前定向回归及构建未发现剩余阻塞问题。整批合并前应在 Windows 实际运行 Pi dispatch 参数测试与两个 cmd.exe 测试；现有 Windows 发布 job 只构建发布，不会自动运行这些测试。其余修改可以先合并，需要分别提交上游 gateway 修复和 CCR 修改，发布前先推送上游修复，确保构建消费正确版本。

## 直接迁入上游的验证

先迁入 routes 和 raw-trace 复现测试，在上游原始生产源码上得到 5 项失败、155 项通过；随后直接修改生产源码并迁入工具 ID 测试，三个回归套件共 163 项全部通过。上游全量测试 931 通过、7 跳过、0 失败；生产与包含测试的完整 TypeScript 检查以及构建通过。

CCR 默认构建解析到 `/Users/jinhuilee/products/next-ai/gateway`，没有设置源码覆盖路径。使用这个上游构建的最终 CCR 产物，4 项实际 HTTP / SSE / SQLite / core 进程回归全部通过。两库 diff 检查通过，发布 YAML、action shell 语法和各平台 gateway artifact 引用一致。全仓依赖维护配置和文档检查通过，均采用直接构建上游源码的方式。

上游修复已包含在提交 `0a2c0ab` 中，10 个源码及回归文件与受测版本一致。CCR 修复、复现测试、发布依赖和维护记录随本记录一并提交。本次未执行推送或 GitHub 关闭、合并、评论。
