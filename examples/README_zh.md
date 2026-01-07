# Preset 示例说明

本目录包含 CCR 预设配置的示例文件。

## 示例文件

### 1. `simple-preset-example.json` - 简单示例
适合初学者，展示了基本的动态配置功能：
- 密码输入（API Key）
- 单选下拉框（选择模型）
- 确认框（是否使用代理）
- 条件显示（只有选择使用代理时才显示代理地址输入）

**使用场景**：快速配置单个 Provider

### 2. `preset-manifest-example.json` - 完整示例
展示了所有高级功能：
- 多种输入类型（password, select, confirm, number, multiselect）
- 动态选项（从 Providers 配置中提取）
- 复杂条件逻辑（when 条件）
- 模板变量替换（{{variable}}）
- 配置映射（configMappings）

**使用场景**：生产环境的完整配置

### 3. `dynamic-preset-example.json` - 多Provider示例
展示了如何在多个 Provider 之间切换：
- Provider 选择器
- 根据选择的 Provider 动态显示对应的模型选项
- 代理配置
- 高级功能开关

## 如何使用这些示例

### 方法1：直接复制到预设目录

```bash
# 创建预设目录
mkdir -p ~/.claude-code-router/presets/my-preset

# 复制示例文件
cp simple-preset-example.json ~/.claude-code-router/presets/my-preset/manifest.json

# 应用预设
ccr my-preset
```

### 方法2：修改后使用

1. 复制示例文件到本地
2. 根据需要修改配置
3. 使用 CLI 安装：

```bash
ccr preset install ./simple-preset-example.json --name my-preset
```

## Schema 字段类型说明

| 类型 | 说明 | 适用场景 |
|------|------|----------|
| `password` | 密码输入 | API Key、密钥等敏感信息 |
| `input` | 单行文本 | Base URL、端点地址 |
| `number` | 数字输入 | 超时时间、Token数量 |
| `select` | 单选 | Provider选择、模型选择 |
| `multiselect` | 多选 | 功能开关、标签选择 |
| `confirm` | 确认框 | 是否启用某功能 |
| `editor` | 多行文本 | 自定义配置、脚本 |

## 条件运算符

| 运算符 | 说明 | 示例 |
|--------|------|------|
| `eq` | 等于 | 当 provider == "openai" 时显示 |
| `ne` | 不等于 | 当 mode != "simple" 时显示 |
| `exists` | 字段存在 | 当 apiKey 有值时显示 |
| `gt/lt` | 大于/小于 | 当 timeout > 30 时显示 |

## 动态选项类型

### static - 静态选项
```json
"options": {
  "type": "static",
  "options": [
    {"label": "选项1", "value": "value1"},
    {"label": "选项2", "value": "value2"}
  ]
}
```

### providers - 从 Providers 配置提取
```json
"options": {
  "type": "providers"
}
```
自动从 `Providers` 数组中提取 name 作为选项。

### models - 从指定 Provider 的 models 提取
```json
"options": {
  "type": "models",
  "providerField": "{{selectedProvider}}"
}
```
根据用户选择的 Provider，动态显示该 Provider 的 models。

## 模板变量

使用 `{{变量名}}` 语法在 template 中引用用户输入：

```json
"template": {
  "Providers": [
    {
      "name": "{{providerName}}",
      "api_key": "{{apiKey}}"
    }
  ]
}
```

## 配置映射

对于复杂的配置需求，使用 `configMappings` 精确控制值的位置：

```json
"configMappings": [
  {
    "target": "Providers[0].api_key",
    "value": "{{apiKey}}"
  },
  {
    "target": "PROXY_URL",
    "value": "{{proxyUrl}}",
    "when": {
      "field": "useProxy",
      "operator": "eq",
      "value": true
    }
  }
]
```

## 最佳实践

1. **提供默认值**：为非必填项设置合理的 `defaultValue`
2. **清晰的标签**：使用用户友好的 `label` 和 `prompt`
3. **条件显示**：使用 `when` 避免显示无关选项
4. **输入验证**：使用 `validator` 或 `min/max` 确保输入有效
5. **分组配置**：相关字段使用相同的前缀（如 `proxy*`）
6. **版本管理**：在 metadata 中记录版本和变更

## 更多帮助

- 查看完整文档：[Presets 配置指南](../docs/docs/server/advanced/presets.md)
- 查看类型定义：[types.ts](../packages/shared/src/preset/types.ts)
