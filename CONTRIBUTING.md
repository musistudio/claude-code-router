# 开发规范

## 1. 分支管理

### 分支命名

| 类型 | 格式 | 示例 |
|------|------|------|
| 功能开发 | `feature/<name>` | `feature/network-aware-router` |
| Bug 修复 | `fix/<name>` | `fix/proxy-auth-error` |
| 重构 | `refactor/<name>` | `refactor/config-service` |
| 测试 | `test/<name>` | `test/network-detector` |

### 开发流程

1. 从 `main` 创建功能分支
2. 开发 + 测试
3. 推送到远程，创建 PR 合并到 `main`
4. 至少一人 Code Review 后合并

```bash
git checkout main
git pull origin main
git checkout -b feature/network-aware-router
# 开发...
git push origin feature/network-aware-router
# 创建 PR
```

## 2. 开发路径与部署路径分离

### 目录约定

```
~/.claude-code-router/           # 生产环境（ccr start 使用）
├── config.json                  # 生产配置
├── logs/                        # 生产日志
└── presets/                     # 生产预设

~/.claude-code-router-dev/       # 开发环境
├── config.json                  # 开发配置
├── logs/                        # 开发日志
└── presets/                     # 开发预设
```

### 端口分离

| 环境 | 默认端口 | 配置方式 |
|------|---------|---------|
| 生产 | 3456 | `config.json` 中 `PORT` |
| 开发 | 13456 | 环境变量 `SERVICE_PORT=13456` |
| 测试 | 23456 | 环境变量 `SERVICE_PORT=23456` |

### 开发启动

```bash
# 方式 1：使用开发目录 + 开发端口
SERVICE_PORT=13456 pnpm dev:server

# 方式 2：开发 CLI
pnpm dev:cli start

# 方式 3：开发 UI
pnpm dev:ui
```

> 注意：开发环境需创建 `~/.claude-code-router-dev/config.json` 并在其中设置 `PORT: 13456`，
> 或通过环境变量 `SERVICE_PORT=13456` 指定。

## 3. TDD 开发流程

### 红-绿-重构循环

```
1. 写失败测试（Red）
2. 写最小实现代码使测试通过（Green）
3. 重构，确保测试仍通过（Refactor）
```

### 每个特性的开发顺序

```
1. 理解需求 → 写设计文档
2. 写接口测试（集成测试级别）
3. 写单元测试
4. 实现代码
5. 重构
6. 写冒烟测试
```

## 4. 分层测试体系

### 4.1 测试分层

```
┌─────────────────────────────────┐
│         冒烟测试 (Smoke)         │  ← 验证核心功能端到端可用
│     端口: 23456                  │
├─────────────────────────────────┤
│       集成测试 (Integration)     │  ← 验证模块间协作
│     端口: 23456                  │
├─────────────────────────────────┤
│        单元测试 (Unit)           │  ← 验证单个函数/类
│     无需启动服务                  │
└─────────────────────────────────┘
```

### 4.2 测试框架

- **vitest** — 单元测试 + 集成测试
- 测试文件放各 package 的 `tests/` 目录下

```
packages/core/
├── src/
└── tests/
    ├── unit/                    # 单元测试
    │   └── networkDetector.test.ts
    └── integration/             # 集成测试
        └── router.integration.test.ts

packages/server/
├── src/
└── tests/
    ├── integration/
    └── smoke/                   # 冒烟测试
        └── api.smoke.test.ts
```

### 4.3 测试命名规范

```typescript
describe('NetworkDetector', () => {
  describe('detect()', () => {
    it('should return intranet when DNS resolves to 10.x.x.x', async () => { ... })
    it('should return external when DNS resolution fails', async () => { ... })
  })
})
```

### 4.4 测试脚本

根 `package.json` 新增：

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:unit": "vitest run --project unit",
    "test:integration": "vitest run --project integration",
    "test:smoke": "vitest run --project smoke",
    "test:coverage": "vitest run --coverage"
  }
}
```

### 4.5 测试环境配置

集成测试和冒烟测试使用独立的测试配置：

```
tests/
├── vitest.config.ts             # 根级 vitest 配置
├── fixtures/
│   ├── config.test.json         # 测试用配置（端口 23456）
│   └── config.intranet.json     # 模拟内网场景配置
└── helpers/
    └── server.ts                # 测试服务器启动/停止工具
```

### 4.6 各层测试职责

| 层级 | 范围 | 示例 |
|------|------|------|
| **单元测试** | 单个类/函数，mock 所有外部依赖 | NetworkDetector.detect() 的 DNS 解析逻辑 |
| **集成测试** | 多模块协作，启动真实服务（测试端口） | 完整请求流程：请求 → Router → Transformer → mock Provider |
| **冒烟测试** | 端到端，使用真实 Provider（如可用） | 启动服务 → 发送请求 → 收到响应 → 状态正确 |

## 5. 代码规范

### TypeScript

- 严格模式（项目已启用 `strict: true`）
- 优先使用 `interface` 定义类型，`type` 用于联合类型
- 导出显式类型，不使用 `any`（测试中除外）

### 提交信息

使用 Conventional Commits：

```
feat: add network-aware router
fix: fix DNS detection timeout
test: add unit tests for NetworkDetector
docs: update design document
refactor: extract config reload logic
chore: setup vitest
```

### 依赖管理

- 生产依赖安装到具体 package
- 开发/测试依赖安装到根目录或具体 package
- 使用 pnpm workspace 协议引用内部包：`"@CCR/shared": "workspace:*"`

## 6. 构建与发布

```bash
# 完整构建
pnpm build

# 单个 package 构建
pnpm build:core
pnpm build:server

# 发布
pnpm release
```
