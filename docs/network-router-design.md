# 设计文档：网络状态感知的 LLM Provider 自动切换

## 一、功能概述

在华为内网办公场景下，根据 xgate VPN 连接状态（通过 DNS 解析 `w3.huawei.com` 是否返回 `10.x.x.x` 内网地址来判断），自动切换 Router 配置。

- 内网时优先使用内网部署的模型服务
- 外网时使用外部模型服务
- 切换在服务端内存中完成，对上层调用者完全透明
- UI 页面可配置网络感知路由规则，并实时显示当前网络状态

## 二、核心设计思路

**关键发现：** 现有 `router.ts` 中 `configService.get("Router")` 在每次请求时被调用。因此只需在检测到网络状态变化时，通过 `configService.set("Router", newConfig)` 更新内存中的 Router 值，即可实现无感知切换——**无需修改 Router 逻辑本身**。

## 三、配置格式设计（config.json 扩展）

在现有 `config.json` 中新增 `NetworkRouter` 顶层字段：

```jsonc
{
  // 现有配置保持不变
  "Providers": [ /* ... */ ],
  "Router": {
    "default": "openrouter,anthropic/claude-sonnet-4",
    "background": "openrouter,anthropic/claude-3.5-sonnet"
  },

  // ===== 新增：网络感知路由 =====
  "NetworkRouter": {
    "enabled": true,
    "checkInterval": 30,                    // 检测间隔（秒），默认 30
    "hostname": "w3.huawei.com",            // DNS 检测域名，默认 w3.huawei.com
    "intranetPattern": "^10\\.",            // 内网 IP 匹配正则，默认 ^10\.
    "states": {
      "intranet": {                         // xgate 已连接
        "Router": {
          "default": "volcengine,deepseek-v3-250324",
          "background": "volcengine,deepseek-v3-250324",
          "think": "volcengine,deepseek-r1-250528",
          "longContext": "volcengine,deepseek-v3-250324",
          "webSearch": "volcengine,deepseek-v3-250324"
        }
      },
      "external": {                         // xgate 未连接
        "Router": {
          "default": "openrouter,anthropic/claude-sonnet-4",
          "background": "openrouter,anthropic/claude-3.5-sonnet",
          "think": "openrouter,anthropic/claude-sonnet-4",
          "longContext": "openrouter,anthropic/claude-sonnet-4",
          "webSearch": "openrouter,anthropic/claude-3.5-sonnet"
        }
      }
    }
  }
}
```

**兼容性保证：**
- 如果 `NetworkRouter` 不存在或 `enabled` 为 `false`，行为与现在完全一致
- 顶层 `Router` 作为默认配置，网络检测启动前使用此值

## 四、数据流

```
config.json
    │
    │ loadConfig()
    ▼
ConfigService  ──── Router: { default: "openrouter,..." }
    │
    ├──────────────────────────────────┐
    │                                  │
    ▼                                  ▼
NetworkDetector                     router() (每次请求)
    │                                  │
    │ DNS resolve w3.huawei.com        │ configService.get("Router")
    │                                  │ → 自动拿到最新配置
    │ state changed?                   │
    │  YES → set("Router", ...)        │
    ▼                                  ▼
 内存中 Router 配置更新          请求使用新的 Provider/Model
```

## 五、文件变更清单

### 5.1 后端变更

| # | 文件路径 | 操作 | 说明 |
|---|----------|------|------|
| 1 | `packages/core/src/services/networkDetector.ts` | **新建** | NetworkDetector 类：DNS 检测、状态管理、定时器、配置热切换 |
| 2 | `packages/core/src/server.ts` | **修改** | 集成 NetworkDetector（import、成员变量、构造函数、start、shutdown） |
| 3 | `packages/server/src/server.ts` | **修改** | 新增 `GET /api/network-state` API（返回当前网络状态） |

### 5.2 前端变更

| # | 文件路径 | 操作 | 说明 |
|---|----------|------|------|
| 4 | `packages/ui/src/types.ts` | **修改** | 添加 NetworkRouterConfig、NetworkState 类型 |
| 5 | `packages/ui/src/components/NetworkRouter.tsx` | **新建** | 网络感知路由配置组件 |
| 6 | `packages/ui/src/App.tsx` | **修改** | Dashboard 布局中嵌入 NetworkRouter 组件 |
| 7 | `packages/ui/src/lib/api.ts` | **修改** | 添加 `getNetworkState()` 方法 |
| 8 | `packages/ui/src/locales/zh.json` | **修改** | 中文翻译 |
| 9 | `packages/ui/src/locales/en.json` | **修改** | 英文翻译 |

### 5.3 无需修改的文件

| 文件 | 原因 |
|------|------|
| `packages/core/src/utils/router.ts` | 通过 configService 自动获取最新配置 |
| `packages/core/src/services/config.ts` | 已有 get/set 方法 |
| `packages/core/src/api/routes.ts` | fallback 通过 configService 读取 |
| `packages/cli/*` | CLI 无需变更 |

## 六、详细实现方案

### 6.1 新建 `packages/core/src/services/networkDetector.ts`

```typescript
import { resolve4 } from 'dns/promises';

export type NetworkState = 'intranet' | 'external' | 'unknown';

export interface NetworkRouterState {
  Router?: Record<string, string>;
  fallback?: Record<string, string[]>;
}

export interface NetworkRouterConfig {
  enabled?: boolean;
  checkInterval?: number;        // 秒，默认 30
  hostname?: string;             // 默认 w3.huawei.com
  intranetPattern?: string;      // 默认 ^10\.
  states?: {
    intranet?: NetworkRouterState;
    external?: NetworkRouterState;
  };
}

export class NetworkDetector {
  private currentState: NetworkState = 'unknown';
  private timer: NodeJS.Timer | null = null;
  private networkConfig: NetworkRouterConfig = {};
  private originalRouter: any;
  private originalFallback: any;

  constructor(
    private readonly configService: any,
    private readonly logger: any
  ) {}

  async start(): Promise<void> {
    this.networkConfig = this.configService.get<NetworkRouterConfig>('NetworkRouter');
    if (!this.networkConfig?.enabled) return;

    // 保存原始配置用于恢复
    this.originalRouter = this.configService.get('Router');
    this.originalFallback = this.configService.get('fallback');

    this.logger.info(
      `NetworkRouter enabled, monitoring ${this.networkConfig.hostname || 'w3.huawei.com'} ` +
      `every ${this.networkConfig.checkInterval || 30}s`
    );

    // 首次检测
    await this.check();

    // 定时检测
    const interval = (this.networkConfig.checkInterval || 30) * 1000;
    this.timer = setInterval(async () => {
      try { await this.check(); } catch (e: any) {
        this.logger.error(`Network detection error: ${e.message}`);
      }
    }, interval);

    // 防止定时器阻止进程退出
    if (this.timer && 'unref' in (this.timer as any)) {
      (this.timer as any).unref();
    }
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer as any);
      this.timer = null;
    }
    // 恢复原始配置
    if (this.originalRouter !== undefined) {
      this.configService.set('Router', this.originalRouter);
    }
    if (this.originalFallback !== undefined) {
      this.configService.set('fallback', this.originalFallback);
    }
  }

  getState(): NetworkState { return this.currentState; }

  private async check(): Promise<void> {
    const newState = await this.detect();
    if (newState !== this.currentState) {
      this.logger.info(`Network state changed: ${this.currentState} -> ${newState}`);
      this.currentState = newState;
      this.applyState(newState);
    }
  }

  private async detect(): Promise<NetworkState> {
    const hostname = this.networkConfig.hostname || 'w3.huawei.com';
    const pattern = new RegExp(this.networkConfig.intranetPattern || '^10\\.');
    try {
      const addresses = await resolve4(hostname);
      return addresses.some(addr => pattern.test(addr)) ? 'intranet' : 'external';
    } catch {
      // DNS 解析失败 → xgate 未连接 → 外网
      return 'external';
    }
  }

  private applyState(state: NetworkState): void {
    const stateConfig = this.networkConfig.states?.[state];
    if (stateConfig?.Router) {
      this.configService.set('Router', stateConfig.Router);
      this.logger.info(`Applied ${state} Router: ${JSON.stringify(stateConfig.Router)}`);
    }
    if (stateConfig?.fallback) {
      this.configService.set('fallback', stateConfig.fallback);
    } else if (this.originalFallback !== undefined) {
      this.configService.set('fallback', this.originalFallback);
    }
  }
}
```

### 6.2 修改 `packages/core/src/server.ts`

**A. 添加 import（第 33 行附近）：**
```typescript
import { NetworkDetector } from "./services/networkDetector";
```

**B. 添加成员变量（第 74 行附近）：**
```typescript
networkDetector?: NetworkDetector;
```

**C. 构造函数中创建实例（第 101 行之后）：**
```typescript
this.networkDetector = new NetworkDetector(this.configService, this.app.log);
```

**D. `start()` 方法中启动（第 214 行 `registerNamespace('/')` 之后）：**
```typescript
if (this.networkDetector) {
  await this.networkDetector.start();
}
```

**E. shutdown 中停止（第 249 行 shutdown 函数内）：**
```typescript
this.networkDetector?.stop();
```

### 6.3 修改 `packages/server/src/server.ts`

新增 API 端点：
```typescript
app.get("/api/network-state", async (req, reply) => {
  const server = (globalThis as any).__CCR_SERVER;
  return {
    state: server?.networkDetector?.getState() ?? 'unknown',
    enabled: !!server?.networkDetector
  };
});
```

### 6.4 新建 `packages/ui/src/components/NetworkRouter.tsx`

**组件设计：**

```
┌─────────────────────────────────────────────┐
│  网络感知路由                          [开关] │
├─────────────────────────────────────────────┤
│  当前状态: 🟢 内网 (xgate 已连接)             │
│                                             │
│  检测域名: [w3.huawei.com        ]          │
│  检测间隔: [30                  ] 秒         │
│                                             │
│  ┌──────────────────┐  ┌──────────────────┐ │
│  │ 内网路由 (Intranet)│  │ 外网路由 (External)│ │
│  │                  │  │                  │ │
│  │ 默认: [下拉选择]   │  │ 默认: [下拉选择]   │ │
│  │ 后台: [下拉选择]   │  │ 后台: [下拉选择]   │ │
│  │ 思考: [下拉选择]   │  │ 思考: [下拉选择]   │ │
│  │ 长上下文: [下拉选择]│  │ 长上下文: [下拉选择]│ │
│  │ 搜索: [下拉选择]   │  │ 搜索: [下拉选择]   │ │
│  └──────────────────┘  └──────────────────┘ │
└─────────────────────────────────────────────┘
```

**核心逻辑：**
- 复用现有 `<Combobox>` 组件选择模型（与 Router.tsx 一致）
- 使用 `api.getNetworkState()` 获取并定时刷新当前状态
- 开关控制 `NetworkRouter.enabled`
- 左右两栏分别编辑 intranet/external 的 Router 配置

### 6.5 修改 `packages/ui/src/App.tsx`

**布局调整：** 在 Dashboard 右侧栏的 Router 组件下方嵌入 NetworkRouter：

```tsx
// 右侧栏布局调整
<div className="flex w-2/5 flex-col gap-4">
  <div className="h-2/5">
    <Router />
  </div>
  <div className="flex-1 overflow-hidden">
    <NetworkRouter />
  </div>
</div>
```

### 6.6 修改 `packages/ui/src/lib/api.ts`

新增方法：
```typescript
async getNetworkState(): Promise<{ state: string; enabled: boolean }> {
  return this.get('/network-state');
}
```

### 6.7 国际化翻译

**zh.json 新增：**
```json
"network_router": {
  "title": "网络感知路由",
  "enabled": "启用",
  "current_state": "当前状态",
  "intranet": "内网 (xgate 已连接)",
  "external": "外网 (xgate 未连接)",
  "unknown": "未知",
  "hostname": "检测域名",
  "check_interval": "检测间隔（秒）",
  "intranet_router": "内网路由",
  "external_router": "外网路由",
  "not_configured": "未配置，将使用默认路由",
  "selectModel": "选择一个模型...",
  "searchModel": "搜索模型...",
  "noModelFound": "未找到模型."
}
```

**en.json 新增：**
```json
"network_router": {
  "title": "Network-Aware Router",
  "enabled": "Enabled",
  "current_state": "Current State",
  "intranet": "Intranet (xgate connected)",
  "external": "External (xgate disconnected)",
  "unknown": "Unknown",
  "hostname": "Detection Hostname",
  "check_interval": "Check Interval (seconds)",
  "intranet_router": "Intranet Router",
  "external_router": "External Router",
  "not_configured": "Not configured, will use default router",
  "selectModel": "Select a model...",
  "searchModel": "Search model...",
  "noModelFound": "No model found."
}
```

## 七、兼容性

| 场景 | 行为 |
|------|------|
| 无 `NetworkRouter` 配置 | 完全不变 |
| `enabled: false` | 跳过检测 |
| DNS 不可用 | 安全降级为 external |
| 网络短暂抖动 | 下次检测自动恢复 |
| 项目级 Router 配置 | 不受影响，优先级更高 |
| UI 未配置 NetworkRouter | 不显示网络感知路由面板 |

## 八、配置热重载

### 现状问题

当前 UI 修改配置后必须**重启服务**才能生效。`POST /api/config` 只写文件，不更新内存中的 `ConfigService`。

### 方案

新增 `POST /api/reload` 端点 + UI "热重载"按钮。

#### 8.1 后端：新增 reload API

**`packages/server/src/server.ts` 新增：**
```typescript
app.post("/api/reload", async (req, reply) => {
  const server = (globalThis as any).__CCR_SERVER;
  try {
    // 1. 重新加载 config.json 到内存
    server.configService.reload();
    
    // 2. 重新注册 providers（新配置中的 Provider 需要生效）
    const providers = server.configService.get('Providers') || [];
    server.providerService.loadProviders(providers);
    
    // 3. 重启 NetworkDetector（应用新的 NetworkRouter 配置）
    server.networkDetector?.stop();
    await server.networkDetector?.start();
    
    return { success: true, message: "Config reloaded successfully" };
  } catch (error: any) {
    return { success: false, message: error.message };
  }
});
```

需要在 `packages/server/src/index.ts` 中将 server 实例挂到 `globalThis`：
```typescript
(globalThis as any).__CCR_SERVER = serverInstance;
```

#### 8.2 UI：新增"热重载"按钮

**`packages/ui/src/lib/api.ts` 新增方法：**
```typescript
async reloadConfig(): Promise<{ success: boolean; message: string }> {
  return this.post('/reload');
}
```

**`packages/ui/src/App.tsx` header 工具栏新增按钮：**

在"保存"和"保存并重启"之间添加"热重载"按钮：
```tsx
<Button onClick={reloadConfig} variant="outline">
  <Zap className="mr-2 h-4 w-4" />
  {t('app.reload')}
</Button>
```

#### 8.3 国际化

**zh.json `app` 中新增：**
```json
"reload": "热重载",
"reload_success": "配置热重载成功",
"reload_failed": "配置热重载失败"
```

**en.json `app` 中新增：**
```json
"reload": "Hot Reload",
"reload_success": "Config reloaded successfully",
"reload_failed": "Config reload failed"
```

### 变更文件补充

| # | 文件路径 | 操作 | 说明 |
|---|----------|------|------|
| 10 | `packages/server/src/index.ts` | **修改** | `globalThis.__CCR_SERVER = serverInstance` |
| 11 | `packages/server/src/server.ts` | **修改** | 新增 `POST /api/reload` 端点 |
| 12 | `packages/ui/src/lib/api.ts` | **修改** | 新增 `reloadConfig()` 方法 |
| 13 | `packages/ui/src/App.tsx` | **修改** | header 新增"热重载"按钮 |
| 14 | `packages/ui/src/locales/zh.json` | **修改** | 热重载中文翻译 |
| 15 | `packages/ui/src/locales/en.json` | **修改** | 热重载英文翻译 |

## 九、验证方案

1. **后端日志验证：** 启动后查看日志 `Network state changed: unknown -> intranet`
2. **UI 验证：** 打开 `ccr ui`，右侧栏出现网络感知路由面板，显示当前状态
3. **切换验证：** 连接/断开 xgate，UI 状态指示器自动更新，请求路由到对应 provider
4. **兼容验证：** 移除 NetworkRouter 配置，确认服务正常使用顶层 Router
5. **热重载验证：** 修改 Provider/Router 配置后点"热重载"，不重启服务即生效
