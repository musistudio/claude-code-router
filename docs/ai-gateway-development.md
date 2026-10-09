# 直接使用上游 ai-gateway

Gateway 修复和对应测试直接维护在 `/Users/jinhuilee/products/next-ai/gateway`，当前分支为 `feat/v1.0.22`。CCR 直接使用这个上游目录的构建产物。

上游包含 Anthropic 工具 ID 及历史回放修复、Fusion 流日志与 HTTP 状态修复、raw trace 队列容量限制、原生 Anthropic 虚拟模型流透传，以及对应的三个回归测试文件。

## 本地构建和验证

先在上游目录运行：

```sh
cd /Users/jinhuilee/products/next-ai/gateway
npm run typecheck
npm run typecheck:all
npx vitest run src/gateway/routes.test.ts src/adapters/builtins/anthropic-tool-id.test.ts src/raw-trace.test.ts
npm run build
```

再在 CCR 目录运行：

```sh
cd /Users/jinhuilee/products/CCR/claude-code-router
npm run build:assets
node build/test.mjs core
CCR_TEST_GATEWAY_ENTRY="$PWD/packages/core/dist/main/next-ai-gateway.js" node build/run-tests.mjs core
```

本机已有构建逻辑默认优先使用 `../../next-ai/gateway`。其他目录布局可通过 `CCR_GATEWAY_SOURCE_DIR` 指定上游源码目录。Docker 的本地打包脚本同样直接构建这个上游目录。

## 发布顺序

先推送上游修复，再创建 CCR 发布。`prepare-release-gateway` 直接检出上游修复提交 `0a2c0abd48d2144ed0ac2ce4d954a661c51ffcb1`，检查回归测试文件存在，执行类型检查和三个回归套件，然后打包供桌面及 Docker 发布使用。修复由上游源码提供。

当前 npm 依赖范围仍为 `^1.0.21`；上游工作区修改不会自动进入注册表中的已发布包。通过 npm 发布 CCR 时，应显式使用修复后的上游源码构建；上游正式发布后再升级注册表依赖。

## 本次迁移验证

- 先迁入复现测试，在原上游源码上得到 5 项失败；修改生产源码后三个定向回归套件 163 项全部通过。
- 上游全量：931 项通过、7 项跳过、0 失败；生产类型检查、包含测试的类型检查及构建通过。
- CCR 无源码路径覆盖的默认构建通过，实际打包产物的 4 项 HTTP / SSE / SQLite / core 恢复回归全部通过。
- 发布 YAML、action shell 语法及各平台 artifact 引用检查通过；两个仓库的 diff 检查通过。
