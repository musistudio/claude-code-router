# Design Document: Port Configuration Fix

## Overview

本设计解决 claude-code-router 中端口配置的多个问题。核心思路是将运行时状态（如实际使用的端口）与持久化配置分离，通过独立的 runtime 状态文件来追踪服务的实际运行参数。

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      CCR Service                             │
├─────────────────────────────────────────────────────────────┤
│  启动时:                                                     │
│  1. 读取 config.json (PORT)                                  │
│  2. 检查 SERVICE_PORT 环境变量                               │
│  3. 确定最终端口: SERVICE_PORT > config.PORT > 3456          │
│  4. 写入 .runtime 文件 { port: actualPort }                  │
│                                                              │
│  停止时:                                                     │
│  1. 清理 .runtime 文件                                       │
│  2. 清理 PID 文件                                            │
└─────────────────────────────────────────────────────────────┘

┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   config.json   │     │    .runtime     │     │   .pid file     │
│                 │     │                 │     │                 │
│ - PORT (配置值) │     │ - port (实际值) │     │ - process id    │
│ - HOST          │     │ - host          │     │                 │
│ - APIKEY        │     │ - startTime     │     │                 │
│ - ALLOWED_ORIGINS│    │                 │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

## Components and Interfaces

### 1. Runtime State Manager (`src/utils/runtimeState.ts`)

新增模块，负责管理运行时状态文件。

```typescript
interface RuntimeState {
  port: number;
  host: string;
  startTime: string;  // ISO 8601 格式
}

// 保存运行时状态
function saveRuntimeState(state: RuntimeState): void;

// 读取运行时状态
function getRuntimeState(): RuntimeState | null;

// 清理运行时状态
function cleanupRuntimeState(): void;

// 获取运行时端口（带 fallback）
function getRuntimePort(configPort: number): number;
```

### 2. Modified Process Check (`src/utils/processCheck.ts`)

修改 `getServiceInfo()` 函数，优先从 runtime 文件读取端口。

```typescript
async function getServiceInfo() {
  const pid = getServicePid();
  const running = isServiceRunning();
  const config = await readConfigFile();
  const runtimeState = getRuntimeState();
  
  // 优先使用运行时端口
  const port = runtimeState?.port || config.PORT || 3456;
  
  return {
    running,
    pid,
    port,
    configPort: config.PORT || 3456,  // 新增：配置文件中的端口
    isRuntimePort: !!runtimeState,     // 新增：标识是否为运行时端口
    endpoint: `http://127.0.0.1:${port}`,
    pidFile: PID_FILE,
    referenceCount: getReferenceCount()
  };
}
```

### 3. Modified Server Startup (`src/index.ts`)

在服务启动时保存运行时状态。

```typescript
async function run(options: RunOptions = {}) {
  // ... existing code ...
  
  const port = config.PORT || 3456;
  const servicePort = process.env.SERVICE_PORT
    ? parseInt(process.env.SERVICE_PORT)
    : port;
  
  // 保存运行时状态
  saveRuntimeState({
    port: servicePort,
    host: HOST,
    startTime: new Date().toISOString()
  });
  
  // ... rest of startup code ...
}
```

### 4. Modified Auth Middleware (`src/middleware/auth.ts`)

支持自定义 CORS origins。

```typescript
export const apiKeyAuth = (config: any) => async (req, reply, done) => {
  // ... existing public endpoint check ...
  
  const apiKey = config.APIKEY;
  if (!apiKey) {
    const defaultOrigins = [
      `http://127.0.0.1:${config.PORT || 3456}`,
      `http://localhost:${config.PORT || 3456}`,
    ];
    
    // 合并自定义 origins
    const customOrigins = config.ALLOWED_ORIGINS || [];
    const allowedOrigins = [...defaultOrigins, ...customOrigins];
    
    if (req.headers.origin && !allowedOrigins.includes(req.headers.origin)) {
      reply.status(403).send("CORS not allowed for this origin");
      return;
    }
    // ... rest of CORS handling ...
  }
  // ... rest of auth logic ...
};
```

### 5. Modified API Config Endpoint (`src/server.ts`)

返回运行时端口信息。

```typescript
server.app.get("/api/config", async (req, reply) => {
  const config = await readConfigFile();
  const runtimeState = getRuntimeState();
  
  return {
    ...config,
    runtimePort: runtimeState?.port,  // 新增
    runtimeHost: runtimeState?.host,  // 新增
  };
});

server.app.post("/api/config", async (req, reply) => {
  const newConfig = req.body;
  const existingConfig = await readConfigFile();
  
  // 如果请求中没有 PORT 字段，保留现有值
  if (newConfig.PORT === undefined) {
    newConfig.PORT = existingConfig.PORT;
  }
  
  // ... rest of save logic ...
});
```

### 6. Modified UI Components

#### ConfigProvider.tsx

```typescript
// 新增字段追踪
interface ConfigContextType {
  config: Config | null;
  setConfig: Dispatch<SetStateAction<Config | null>>;
  runtimePort: number | null;  // 新增
  modifiedFields: Set<string>; // 新增：追踪用户修改的字段
  markFieldModified: (field: string) => void;  // 新增
  error: Error | null;
}
```

#### SettingsDialog.tsx

```typescript
// 显示运行时端口，并追踪用户修改
const { config, setConfig, runtimePort, markFieldModified } = useConfig();

// 端口输入框
<Input
  id="port"
  type="number"
  value={runtimePort || config.PORT}
  onChange={(e) => {
    markFieldModified('PORT');
    setConfig({ ...config, PORT: parseInt(e.target.value, 10) });
  }}
/>
{runtimePort && runtimePort !== config.PORT && (
  <span className="text-xs text-muted-foreground">
    (运行时端口，配置文件中为 {config.PORT})
  </span>
)}
```

## Data Models

### Runtime State File (`.runtime`)

```json
{
  "port": 58073,
  "host": "127.0.0.1",
  "startTime": "2025-12-26T10:30:00.000Z"
}
```

### Config File (`config.json`) - 新增字段

```json
{
  "PORT": 3456,
  "HOST": "127.0.0.1",
  "APIKEY": "",
  "ALLOWED_ORIGINS": [
    "http://ccr.local",
    "http://my-custom-domain.local"
  ],
  // ... other existing fields ...
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Runtime state persistence round-trip

*For any* valid port number provided via SERVICE_PORT environment variable, starting the service and then reading the runtime state file SHALL return the same port number.

**Validates: Requirements 1.1, 1.2**

### Property 2: Runtime state cleanup on stop

*For any* running service instance, stopping the service SHALL result in the runtime state file being removed.

**Validates: Requirements 1.3**

### Property 3: Status command port consistency

*For any* service started with a custom port (via SERVICE_PORT), the `ccr status` command SHALL display that exact port, not the config file port.

**Validates: Requirements 2.1, 2.2**

### Property 4: API config includes runtime port

*For any* running service, the `/api/config` endpoint response SHALL include a `runtimePort` field matching the actual listening port.

**Validates: Requirements 3.1**

### Property 5: Config save preserves unmodified PORT

*For any* config save request that does not include a PORT field, the existing PORT value in config.json SHALL be preserved unchanged.

**Validates: Requirements 4.3**

### Property 6: CORS allows configured origins

*For any* origin in the `ALLOWED_ORIGINS` config array, requests from that origin SHALL be allowed (not return 403).

**Validates: Requirements 5.2**

### Property 7: CORS denies unconfigured origins

*For any* origin NOT in the allowed origins list (default + custom), and when no APIKEY is set, requests from that origin SHALL return 403 Forbidden.

**Validates: Requirements 5.3**

## Error Handling

1. **Runtime file read failure**: 如果 `.runtime` 文件损坏或不可读，fallback 到 config.json 中的端口
2. **Runtime file write failure**: 记录警告日志，但不阻止服务启动
3. **Invalid SERVICE_PORT**: 如果环境变量不是有效数字，忽略并使用 config 端口
4. **ALLOWED_ORIGINS 格式错误**: 如果不是数组，忽略并只使用默认 origins

## Testing Strategy

### Unit Tests

- `runtimeState.ts`: 测试 save/read/cleanup 函数
- `processCheck.ts`: 测试 `getServiceInfo()` 的端口优先级逻辑
- `auth.ts`: 测试 CORS origin 验证逻辑

### Property-Based Tests

使用 fast-check 库进行属性测试：

1. **Runtime state round-trip**: 生成随机端口号，验证写入后读取一致
2. **CORS origin matching**: 生成随机 origin 列表，验证允许/拒绝逻辑正确

### Integration Tests

- 启动服务 → 检查 status → 验证端口一致
- 通过 UI 保存配置 → 验证 PORT 未被覆盖
- 配置 ALLOWED_ORIGINS → 验证自定义域名可访问
