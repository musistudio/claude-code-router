# Implementation Plan: Port Configuration Fix

## Overview

实现端口配置修复功能，将运行时状态与持久化配置分离，确保端口信息在各组件间保持一致。

## Tasks

- [x] 1. 创建运行时状态管理模块
  - [x] 1.1 创建 `src/utils/runtimeState.ts` 文件
    - 定义 `RuntimeState` 接口
    - 实现 `saveRuntimeState()` 函数
    - 实现 `getRuntimeState()` 函数
    - 实现 `cleanupRuntimeState()` 函数
    - 实现 `getRuntimePort()` 辅助函数
    - _Requirements: 1.1, 1.2, 1.3_
  - [x] 1.2 在 `src/constants.ts` 中添加 `RUNTIME_FILE` 常量
    - _Requirements: 1.2_
  - [x] 1.3 编写 runtimeState 模块的单元测试
    - **Property 1: Runtime state persistence round-trip**
    - **Validates: Requirements 1.1, 1.2**

- [x] 2. 修改服务启动和停止逻辑
  - [x] 2.1 修改 `src/index.ts` 在启动时保存运行时状态
    - 在确定最终端口后调用 `saveRuntimeState()`
    - _Requirements: 1.1_
  - [x] 2.2 修改 `src/index.ts` 在停止时清理运行时状态
    - 在 SIGINT/SIGTERM 处理中调用 `cleanupRuntimeState()`
    - _Requirements: 1.3_
  - [x] 2.3 修改 `src/cli.ts` stop 命令清理运行时状态
    - _Requirements: 1.3_
  - [x] 2.4 编写运行时状态清理的属性测试
    - **Property 2: Runtime state cleanup on stop**
    - **Validates: Requirements 1.3**

- [x] 3. 修改 processCheck 模块
  - [x] 3.1 修改 `src/utils/processCheck.ts` 中的 `getServiceInfo()` 函数
    - 优先从 runtime 文件读取端口
    - 添加 `configPort` 和 `isRuntimePort` 字段
    - _Requirements: 2.1, 2.2, 2.3_
  - [x] 3.2 编写 getServiceInfo 端口优先级的属性测试
    - **Property 3: Status command port consistency**
    - **Validates: Requirements 2.1, 2.2**

- [x] 4. Checkpoint - 确保后端运行时状态功能正常
  - 运行所有测试，确保通过
  - 手动测试：`SERVICE_PORT=12345 ccr start` 然后 `ccr status` 应显示 12345

- [x] 5. 修改 API 端点
  - [x] 5.1 修改 `src/server.ts` 中的 GET `/api/config` 端点
    - 返回 `runtimePort` 和 `runtimeHost` 字段
    - _Requirements: 3.1_
  - [x] 5.2 修改 `src/server.ts` 中的 POST `/api/config` 端点
    - 如果请求中没有 PORT 字段，保留现有值
    - _Requirements: 4.3_
  - [x] 5.3 编写 API 端点的属性测试
    - **Property 4: API config includes runtime port**
    - **Property 5: Config save preserves unmodified PORT**
    - **Validates: Requirements 3.1, 4.3**

- [x] 6. 修改 Auth 中间件支持自定义 CORS origins
  - [x] 6.1 修改 `src/middleware/auth.ts` 支持 `ALLOWED_ORIGINS` 配置
    - 合并默认 origins 和自定义 origins
    - _Requirements: 5.1, 5.2, 5.3, 5.4_
  - [x] 6.2 编写 CORS origin 验证的属性测试
    - **Property 6: CORS allows configured origins**
    - **Property 7: CORS denies unconfigured origins**
    - **Validates: Requirements 5.2, 5.3**

- [x] 7. Checkpoint - 确保后端所有功能正常
  - 运行所有测试，确保通过
  - 手动测试 CORS 配置

- [x] 8. 修改 UI 组件
  - [x] 8.1 修改 `ui/src/types.ts` 添加 `runtimePort` 类型定义
    - _Requirements: 3.1_
  - [x] 8.2 修改 `ui/src/components/ConfigProvider.tsx`
    - 添加 `runtimePort` 状态
    - 添加 `modifiedFields` 追踪用户修改
    - _Requirements: 3.2, 4.1, 4.2_
  - [x] 8.3 修改 `ui/src/components/SettingsDialog.tsx`
    - 显示运行时端口
    - 追踪端口字段修改
    - _Requirements: 3.2, 3.3, 4.1_
  - [x] 8.4 修改保存逻辑，排除未修改的端口字段
    - _Requirements: 4.1, 4.2_

- [x] 9. Final Checkpoint - 完整功能验证
  - 运行所有测试，确保通过
  - 端到端测试：
    1. `SERVICE_PORT=58073 ccr start`
    2. 访问 UI，验证设置中显示 58073
    3. 修改其他设置并保存，验证 PORT 未被覆盖
    4. 配置 `ALLOWED_ORIGINS`，验证自定义域名可访问

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- 优先实现后端功能（任务 1-6），确保核心逻辑正确
- UI 修改（任务 8）可以在后端稳定后进行
- 每个 Checkpoint 都应该验证当前阶段的功能完整性
