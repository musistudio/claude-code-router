---
title: ccr status
sidebar_position: 3
---

# ccr status

显示 Claude Code Router 服务器的当前状态。

## 用法

```bash
ccr status
```

## 输出

### 运行中的服务器

当服务器正在运行时：

```
Claude Code Router 状态: 运行中
版本: 2.0.0
PID: 12345
端口: 3456
运行时间: 2小时34分钟
配置: /home/user/.claude-code-router/config.json
```

### 已停止的服务器

当服务器未运行时：

```
Claude Code Router 状态: 已停止
```

## 退出代码

| 代码 | 说明 |
|------|------|
| 0 | 服务器正在运行 |
| 1 | 服务器已停止 |
| 2 | 检查状态时出错 |

## 示例

```bash
$ ccr status

Claude Code Router 状态: 运行中
版本: 2.0.0
PID: 12345
端口: 3456
运行时间: 2小时34分钟
```

## 相关命令

- [ccr start](/zh/docs/cli/start) - 启动服务器
- [ccr stop](/zh/docs/cli/other-commands#ccr-stop) - 停止服务器
- [ccr restart](/zh/docs/cli/other-commands#ccr-restart) - 重启服务器
