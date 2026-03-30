---
sidebar_position: 5
---

# ccr usage

查看 API 请求的 Token 使用统计。

## 概述

`ccr usage` 命令提供详细的 Token 消耗统计，帮助您监控成本、分析使用模式和优化配置。

## 用法

```bash
ccr usage                    # 显示今日用量
ccr usage --date YYYY-MM-DD  # 显示指定日期用量
ccr usage --start DATE --end DATE  # 显示日期范围用量
ccr usage export [选项]      # 导出用量数据
ccr usage cleanup [选项]     # 清理旧数据
```

## 命令

### 显示用量

显示指定时间段的使用统计。

```bash
# 今日用量
ccr usage

# 指定日期
ccr usage --date 2025-03-25

# 日期范围
ccr usage --start 2025-03-01 --end 2025-03-31
```

#### 选项

| 选项 | 描述 |
|------|------|
| `--date <日期>` | 显示指定日期的用量（YYYY-MM-DD 格式） |
| `--start <日期>` | 范围查询的起始日期 |
| `--end <日期>` | 范围查询的结束日期 |
| `--provider <名称>` | 按供应商筛选 |
| `--model <名称>` | 按模型筛选 |

#### 输出示例

```
═══════════════════════════════════════════════
Usage for 2025-03-25:
═══════════════════════════════════════════════

Summary:
  Total Requests:  150
  Success:         145
  Failed:          5

  Input Tokens:    125,000 (125K)
  Output Tokens:   45,000 (45K)
  Total Tokens:    170,000 (170K)

By Provider:
  zhipu:
    80 requests, 95,000 tokens
      - glm-4.6: 50 requests, 60,000 tokens
      - glm-4.7: 30 requests, 35,000 tokens
  deepseek:
    50 requests, 55,000 tokens
      - deepseek-v3.2: 50 requests, 55,000 tokens

By Model:
  glm-4.6 (zhipu):
    50 requests, 60,000 tokens
  deepseek-v3.2 (deepseek):
    50 requests, 55,000 tokens
```

### 导出用量

导出用量数据为 JSON 或 CSV 格式。

```bash
ccr usage export                    # 导出所有数据为 JSON
ccr usage export --format csv       # 导出为 CSV
ccr usage export --start 2025-03-01 --end 2025-03-31  # 导出指定范围
ccr usage export --output ./usage.json  # 指定输出文件
```

#### 选项

| 选项 | 描述 |
|------|------|
| `--format <格式>` | 导出格式：`json`（默认）或 `csv` |
| `--output <路径>` | 输出文件路径 |
| `--start <日期>` | 导出起始日期 |
| `--end <日期>` | 导出结束日期 |
| `--provider <名称>` | 按供应商筛选 |
| `--model <名称>` | 按模型筛选 |

### 清理旧数据

删除旧的用量记录以释放磁盘空间。

```bash
ccr usage cleanup                   # 删除 90 天前的记录
ccr usage cleanup --retention 30    # 删除 30 天前的记录
ccr usage cleanup --before 2025-01-01  # 删除指定日期前的记录
ccr usage cleanup --dry-run         # 预览模式
```

#### 选项

| 选项 | 描述 |
|------|------|
| `--retention <天数>` | 保留最近 N 天的记录（默认：90） |
| `--before <日期>` | 删除此日期之前的记录 |
| `--dry-run` | 预览模式，不实际删除 |

## 数据存储

用量数据存储在：

```
~/.claude-code-router/usage/
├── usage-2025-01.jsonl
├── usage-2025-02.jsonl
├── usage-2025-03.jsonl
└── ...
```

- **格式**：JSON Lines（每行一个 JSON 对象）
- **轮换**：每月创建新文件
- **保留期**：通过插件选项配置（默认：90 天）

## 插件配置

用量跟踪由 `usage-tracking` 插件提供。在 `config.json` 中配置：

```json
{
  "plugins": [
    {
      "name": "usage-tracking",
      "enabled": true,
      "options": {
        "retentionDays": 90
      }
    }
  ]
}
```

| 选项 | 默认值 | 说明 |
|----------|---------|-------------|
| `enabled` | `true` | 启用/禁用量跟踪 |
| `options.retentionDays` | `90` | 用量记录保留天数 |

禁用后，不收集任何用量数据，所有 `/api/usage/*` 端点返回 404。

## Web UI

用量统计也可在 Web UI 的 `/usage` 页面查看：

```bash
ccr ui
# 访问 http://localhost:3456/ui/usage
```

Web UI 提供：
- 交互式日期范围选择
- 可视化图表
- 供应商和模型筛选
- 导出功能
- 清理管理

## 相关

- [Web UI](/docs/server/intro#web-ui) - 通过 Web 界面查看用量统计
- [API 参考](/docs/server/api/usage-api) - 通过 HTTP API 查询用量