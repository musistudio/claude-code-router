---
id: cli/start
title: ccr start
sidebar_position: 1
---

# ccr start

启动 Claude Code Router 服务器。

## 用法

```bash
ccr start [选项]
```

## 选项

| 选项 | 别名 | 说明 |
|------|------|------|
| `--port <number>` | `-p` | 监听端口号（默认：3456） |
| `--config <path>` | `-c` | 配置文件路径 |
| `--daemon` | `-d` | 作为守护进程运行（后台进程） |
| `--log-level <level>` | `-l` | 日志级别（fatal/error/warn/info/debug/trace） |

## 示例

### 使用默认设置启动

```bash
ccr start
```

### 在自定义端口启动

```bash
ccr start --port 3000
```

### 使用自定义配置启动

```bash
ccr start --config /path/to/config.json
```

### 作为守护进程启动

```bash
ccr start --daemon
```

### 启用调试日志

```bash
ccr start --log-level debug
```

## 环境变量

您也可以使用环境变量配置服务器：

| 变量 | 说明 |
|------|------|
| `PORT` | 监听端口号 |
| `CONFIG_PATH` | 配置文件路径 |
| `LOG_LEVEL` | 日志级别 |
| `CUSTOM_ROUTER_PATH` | 自定义路由器函数路径 |
| `HOST` | 绑定主机地址（默认：0.0.0.0） |

## 输出

启动成功后，您将看到：

```
Claude Code Router is running on http://localhost:3456
API endpoint: http://localhost:3456/v1
```

## 相关命令

- [ccr stop](/zh/docs/cli/other-commands#ccr-stop) - 停止服务器
- [ccr restart](/zh/docs/cli/other-commands#ccr-restart) - 重启服务器
- [ccr status](/zh/docs/cli/other-commands#ccr-status) - 检查服务器状态
