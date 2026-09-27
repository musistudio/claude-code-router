# 原 Issue 复现验收（2026-09-27）

本次重新读取此前 20 个 Issue 的正文和评论，从报告者的复现条件设计测试。下表的“通过”表示当前源码、指定网关补丁和受控测试环境通过该场景；不代表已发布，也不代表在报告者的真实账号或设备上复测。此前仅凭维护者回复或单元测试得出的结论，以本记录为准。

收尾核对日期：2026-09-28。

## 本次测试找到并补齐的遗漏

| 原 Issue | 补测前失败 | 本次修复与补测后结果 |
| --- | --- | --- |
| #1807 | 查询 worker 没有堆上限；并发启动可能创建多个查询 worker | 查询 worker 限制堆；等待写入 worker 后重新检查；提前退出拒绝挂起请求。真实 V8 OOM 后查询可恢复。写入 OOM 隔离一条 poison，100 条健康记录继续处理。 |
| #1801 | 普通模型 JSON 返回 HTTP 200，最终 SQLite 却为 0 | 第二份网关补丁沿普通转换、工具循环及解析重试传递实际响应状态和头。SQLite 验证为 200。 |
| #1808 | 新工具 ID 已净化，但旧的非法历史在原生 Anthropic 直通分支仍返回 400 | 第二份网关补丁在直通请求中成对映射调用和结果，保留 thinking 签名及其他内容。新会话和旧污染历史回放均通过。 |
| #1810 | “获取模型”中的 GET 已更新 token，后续协议探测仍发送占位 token；缓存未感知 token 变化 | 协议探测也经过实时认证；缓存 key 包含 token 哈希。同一网关 PID 内切换凭据，两次 models/protocol 请求都使用新 token，普通 API Key 保持正确。 |
| #1819 评论 | 主模型 429、第二次 404、最后模型解析 400，客户端只看到最后一次 | 汇总 CCR 回退历史到最终错误的 attempts、fallbackReason 和 message。新用例在旧实现中只得到 `[400]`，修复后得到 `[429,404,400]`，请求处理流水线验证客户端正文也保留三次失败。 |

## 逐项验收

测试路径均相对仓库根目录。对应原文链接可查看完整复现步骤。

| Issue | 依据原文构造的验收场景 | 测试与结论 |
| --- | --- | --- |
| [#1828](https://github.com/musistudio/claude-code-router/issues/1828) | 内置 marketplace URL 可公开访问；本地分发格式清楚 | 2026-09-27 再次访问原 raw URL，仍为 **404，未完全解决**。已有文档/Schema 只能解决格式说明，不能使远端仓库上线。 |
| [#1826](https://github.com/musistudio/claude-code-router/issues/1826) | A 持旧快照，B 增加 models/rules/fallback/capabilities，A 改无关设置 | `tests/e2e/recent-issues.spec.ts` 真实 RPC 返回 409 且 B 的修改保留；`unit/config/config-concurrency.test.mjs` 增加独立子进程写共享 SQLite。通过。 |
| [#1825](https://github.com/musistudio/claude-code-router/issues/1825) | POST saveConfig 添加 provider 后，旧客户端完整保存 | 同上，旧版本及无版本快照拒绝，新快照可保存。通过。 |
| [#1823](https://github.com/musistudio/claude-code-router/issues/1823) | compact 文本与最后 tool_result 同在一个 user message | `unit/agents/context-archive.test.mjs` 覆盖单调用、并行调用、错误结果、图片内容；独立 pending-call 检查要求正文前所有结果配对。通过。未调用真实 Gemini 账号。 |
| [#1822](https://github.com/musistudio/claude-code-router/issues/1822) | Jev 模型路由可行性建议 | `unit/routing/jev-example.test.mjs` 覆盖选择、低置信度、非法选项、关闭、显式模型、网络失败。**示例契约通过；真实准确率/延迟尚未评估，不能称生产功能完全验收。** |
| [#1819](https://github.com/musistudio/claude-code-router/issues/1819) | 同域不同协议路径；preset 不应遮蔽 detected；旧保存不丢能力；链尾错误不掩盖前因 | `unit/providers/provider-preset-utils.test.mjs` 验证排序与手动优先；`recent-issues-wire.test.mjs` 捕获真实 `/backup/api/v3/chat/completions` 与 `/anthropic/v1/messages`；RPC 验证能力保留；error-detail/request-pipeline-query 验证 `[429,404,400]`。通过所列场景。 |
| [#1810](https://github.com/musistudio/claude-code-router/issues/1810) | 运行后轮换凭据、不重启、不重新导入；获取模型也跟随 | `integration/gateway/recent-issues-wire.test.mjs` 加载实际静态插件和动态 hook，两次 HTTP 使用不同 token；models 与协议探测更新；普通 Key 对照通过。另有 Keychain 单测。未用真实 OAuth 账号做远端续期。 |
| [#1809](https://github.com/musistudio/claude-code-router/issues/1809) | Llama CPP 的 Qwen GGUF 别名能按供应商筛选并计费 | 同一 wire 测试：每次 100 输入/20 输出 token，自定义价格 2/6 美元每百万 token，SQLite 和概览供应商筛选得到每次 `$0.00032`；全供应商数量一致。通过。任意本地别名仍需明确配置价格；未补写历史记录。 |
| [#1808](https://github.com/musistudio/claude-code-router/issues/1808) | OpenAI 返回 `functions.Bash:0`，Claude 历史切到原生 Anthropic | JSON/SSE 出站 ID 正则有效；把净化 ID 和旧非法 ID 分别回放到会拒绝非法/不成对 ID 的原生模拟上游。通过，**依赖两份网关补丁，尚未发布依赖版本**。 |
| [#1807](https://github.com/musistudio/claude-code-router/issues/1807) | worker OOM、poison 批次反复重放、重启仍阻塞健康日志 | `integration/observability/request-log-runtime.test.mjs` 真实 OOM、堆上限、100 条健康尾部记录、恢复查询；`unit/observability/raw-trace-sync.test.mjs` 验证重启后预算与 dead letter。通过。未执行数小时生产流量压力测试，不能承诺任意负载无 OOM。 |
| [#1806](https://github.com/musistudio/claude-code-router/issues/1806) | 相同入口/上游的 direct/Fusion × JSON/SSE 四组，逐次查库 | wire 测试再交叉 billing true/false，共八组；每次客户端 200、SQLite 新增一条、120 token（usage 放在 finish_reason 后）、成本正确。通过，**需要网关补丁**。 |
| [#1805](https://github.com/musistudio/claude-code-router/issues/1805) | 同上，重复报告 | 同一四组×计费矩阵覆盖。 |
| [#1804](https://github.com/musistudio/claude-code-router/issues/1804) | 主模型配额 403 后真实网络是否访问备用上游/模型 | wire 测试加载 CCR 路由插件并运行回退执行器，JSON/SSE 均捕获 `primary/k3` 后访问 `backup/glm-5.3`。通过。 |
| [#1803](https://github.com/musistudio/claude-code-router/issues/1803) | 原文 `anthropic/claude-ccr-h467573696f6e2f474c4d20352e3320566973696f6e` 探测 ID | wire 测试保留额度耗尽的 Anthropic 供应商，发送该完整 ID，实际只访问选中的 Backup/glm-5.3 并成功。通过；未启动真实 Claude 桌面端。 |
| [#1801](https://github.com/musistudio/claude-code-router/issues/1801) | 成功显示 0/红色，真正传输/HTTP 错误应保留 | 八组 wire 测试确认新增行 200；日志/用量测试区分 unknown、传输错误和 HTTP 错误；UI 中性状态测试通过。历史 0 不伪造为 200。普通路径遗漏已补齐，**需要网关补丁**。 |
| [#1800](https://github.com/musistudio/claude-code-router/issues/1800) | 宽布局/改变尺寸时七行热力图不得被裁切 | `tests/e2e/recent-issues.spec.ts` 实际 Chrome 测量：首页 1200/1920/900/1440px；托盘构建产物 360/680/420px。七行、非零尺寸与裁切边界检查均通过。 |
| [#1799](https://github.com/musistudio/claude-code-router/issues/1799) | 262144 上下文，输入 230462、输出 32000 的原始 vLLM 错误 | `unit/gateway/error-detail.test.mjs` 使用原文错误并断言 Claude 可识别格式，同时覆盖 OpenAI/LiteLLM、最终尝试与无效数值。通过。未让真实 Claude CLI 执行自动 compact。 |
| [#1798](https://github.com/musistudio/claude-code-router/issues/1798) | Claude 写回 autoMode:true，重新生成仍导致 apiKeyHelper 失效 | `integration/profiles/profile-service.test.mjs` 生成真实 settings 文件→模拟会话写回→再次 apply，移除布尔 autoMode 并保留 helper；结构化设置保留。通过文件生命周期；未运行 Windows Claude CLI 登录。 |
| [#1797](https://github.com/musistudio/claude-code-router/issues/1797) | 含括号、%、^、引号的模型值经 .cmd 到子进程不失真 | `unit/platform/windows-batch.test.mjs` 生成测试通过，原生 cmd.exe 回读测试已有，**本机 macOS 跳过，不能判定 Windows 完全验收**。 |
| [#1795](https://github.com/musistudio/claude-code-router/issues/1795) | Fast Mode + 上游 requirements:null 触发桌面网络要求缺失 | 新增 `integration/agents/codex-cli-middleware-runtime.test.mjs` 真实 stdio 中间件用例。当前策略生成完整 `application.network`，并非原文建议的原样 null；验收该原始崩溃条件消失。未启动真实 ChatGPT 桌面端。 |

## 可复现命令

先按 [`patches/ai-gateway/README.md`](../../patches/ai-gateway/README.md) 应用两份补丁并构建网关。以下是本机 Electron ABI 对应的运行方式；其他环境可使用与 better-sqlite3 匹配的 Node。

```sh
node build/test.mjs core ui
node build/run-tests.mjs core
node build/run-tests.mjs ui
CCR_GATEWAY_SOURCE_DIR=/absolute/path/to/patched/gateway npm run build:assets
ELECTRON_RUN_AS_NODE=1 CCR_TEST_GATEWAY_ENTRY="$PWD/packages/core/dist/main/next-ai-gateway.js" \
  node_modules/electron/dist/Electron.app/Contents/MacOS/Electron --test \
  .test-dist/core/test/integration/gateway/recent-issues-wire.test.js
ELECTRON_RUN_AS_NODE=1 CCR_TEST_BROWSER_CHANNEL=chrome \
  node_modules/electron/dist/Electron.app/Contents/MacOS/Electron \
  node_modules/@playwright/test/cli.js test tests/e2e/recent-issues.spec.ts
```

wire 用例未设置 `CCR_TEST_GATEWAY_ENTRY` 时会明确跳过，避免普通单测悄悄使用未知网关版本。所有 token 均为测试字符串，所有上游都是回环模拟服务；未使用真实模型凭据或修改用户数据。

## 验证记录

| 检查 | 最终结果 |
| --- | --- |
| CCR TypeScript 检查、生产资源构建 | 通过；构建显式使用应用两份补丁的网关源码。 |
| 核心全量测试 | 1076 项：1068 通过、7 跳过、1 项既有失败（见下）。 |
| UI 单元测试 | 212 项通过。 |
| Chrome 浏览器回归 | 3 项通过：真实配置 RPC 并发保存、首页热力图、托盘热力图。 |
| 网关 TypeScript 检查、生产构建 | 通过。 |
| 网关 routes 与 tool ID 回归 | 158 项通过。 |
| HTTP / spool / SQLite 集成回归 | 单独启用后通过；分别验证网关自身构建产物，以及最终 CCR 生产包内的 `next-ai-gateway.js`。覆盖八组用量/成本矩阵及工具历史、回退、编码探测 ID、OAuth 轮换。 |
| 补丁可复现性 | 从网关基线 `f061ad4` 的干净快照依次应用两份补丁成功；关键生产文件与受测源码一致。 |

核心唯一失败为 `profile service writes a multi-model Kimi CLI home that points inference to CCR`：当前模型目录为 `DeepSeek/deepseek-v4-flash` 包含 `image_in`，旧断言要求没有该能力。此前已在未修改的 `86dfac1c` 快照复现相同失败，本轮未修改该行为或断言。7 项跳过包含需要显式指定网关构建产物的 wire 用例，该用例已另行执行通过；Windows 原生用例仍受平台限制。

结论：所列受控回归场景通过并补齐五处遗漏，不能将全部 20 个 Issue 标记为完全解决。远端 marketplace 仍为 404；Windows 原生执行、Jev 真实效果及表中注明的真实客户端/账号场景尚未验收；网关补丁也尚未发布到依赖版本。
