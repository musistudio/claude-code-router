# Requirements Document

## Introduction

修复 claude-code-router 中端口配置相关的多个问题。当前系统在使用环境变量 `SERVICE_PORT` 动态指定端口时，存在端口信息不一致、UI 显示错误、配置被意外覆盖等问题。

## Glossary

- **CCR**: Claude Code Router 服务
- **SERVICE_PORT**: 环境变量，用于在启动时动态指定服务端口
- **Config_File**: 位于 `~/.claude-code-router/config.json` 的配置文件
- **Runtime_Port**: 服务实际运行时使用的端口
- **UI**: Web 管理界面

## Requirements

### Requirement 1: 运行时端口信息持久化

**User Story:** As a developer, I want the actual runtime port to be persisted, so that other components can know the real port the service is running on.

#### Acceptance Criteria

1. WHEN CCR starts with `SERVICE_PORT` environment variable, THE CCR SHALL persist the runtime port to a separate runtime state file (not config.json)
2. THE Runtime_State_File SHALL be located at `~/.claude-code-router/.runtime` and contain JSON format data
3. WHEN CCR stops, THE CCR SHALL clean up the runtime state file

### Requirement 2: ccr status 显示正确端口

**User Story:** As a developer, I want `ccr status` to show the actual running port, so that I can verify the service is running on the expected port.

#### Acceptance Criteria

1. WHEN `ccr status` is executed and service is running, THE CLI SHALL read the runtime port from the runtime state file
2. WHEN runtime state file exists, THE CLI SHALL display the actual runtime port instead of the config file port
3. WHEN runtime state file does not exist, THE CLI SHALL fall back to displaying the config file port

### Requirement 3: UI 设置显示正确端口

**User Story:** As a developer, I want the UI settings modal to show the actual running port, so that I can see the current service configuration.

#### Acceptance Criteria

1. THE API `/api/config` endpoint SHALL include a `runtimePort` field indicating the actual running port
2. WHEN UI settings modal opens, THE UI SHALL display the runtime port (if available) instead of config file port
3. THE UI SHALL clearly indicate when the displayed port is from runtime vs config file

### Requirement 4: 防止意外覆盖端口配置

**User Story:** As a developer, I want to save other settings without accidentally overwriting the port configuration, so that my dynamic port setup is not disrupted.

#### Acceptance Criteria

1. WHEN saving config from UI, THE UI SHALL NOT include the port field if it was not explicitly modified by the user
2. IF the port field in UI matches the runtime port, THE UI SHALL exclude it from the save payload
3. WHEN config is saved via API, THE API SHALL preserve existing PORT value in config file if not explicitly provided in request

### Requirement 5: CORS 支持自定义域名

**User Story:** As a developer using a proxy, I want to access the UI via custom domain, so that I can use my preferred development setup.

#### Acceptance Criteria

1. THE Config_File SHALL support an optional `ALLOWED_ORIGINS` array field for custom CORS origins
2. WHEN `ALLOWED_ORIGINS` is configured, THE Auth_Middleware SHALL allow requests from those origins
3. WHEN no APIKEY is set and request origin is not in allowed list, THE Auth_Middleware SHALL return 403 Forbidden
4. THE default allowed origins SHALL include `http://127.0.0.1:{PORT}` and `http://localhost:{PORT}`
