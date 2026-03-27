#!/bin/bash
# Claude Code Router - 一键安装脚本
# https://github.com/w13263569508-crypto/claude-code-router

set -e

# ── 颜色 ─────────────────────────────────────────────────────────────────────
R="\033[0m" BOLD="\033[1m" DIM="\033[2m"
RED="\033[31m" GREEN="\033[32m" YELLOW="\033[33m" CYAN="\033[36m"
BCYAN="\033[1m\033[36m" BGREEN="\033[1m\033[32m"

# ── 工具函数 ─────────────────────────────────────────────────────────────────
ok()    { echo -e "${BGREEN}  ✓  $*${R}"; }
info()  { echo -e "${CYAN}  ›  $*${R}"; }
warn()  { echo -e "${YELLOW}  ⚠  $*${R}"; }
die()   { echo -e "${RED}  ✗  $*${R}"; exit 1; }
ask()   { echo -e "${YELLOW}  ?  $*${R}"; }
sep()   { echo -e "${BCYAN}─────────────────────────────────────────────${R}"; }
step()  { echo; sep; echo -e "${BCYAN}  $*${R}"; sep; echo; }

# ── 进度条 ───────────────────────────────────────────────────────────────────
progress() {
  local current=$1 total=$2 label=$3
  local width=30
  local filled=$(( current * width / total ))
  local bar=""
  for ((i=0; i<filled; i++)); do bar+="█"; done
  for ((i=filled; i<width; i++)); do bar+="░"; done
  printf "\r  ${CYAN}[${bar}]${R} ${DIM}%d/%d${R}  %s" "$current" "$total" "$label"
}

# ── Banner ───────────────────────────────────────────────────────────────────
clear
echo -e "${BCYAN}"
cat << 'BANNER'
   ██████╗ ██████╗██████╗
  ██╔════╝██╔════╝██╔══██╗
  ██║     ██║     ██████╔╝  Claude Code Router
  ██║     ██║     ██╔══██╗  一键安装脚本
  ╚██████╗╚██████╗██║  ██║
   ╚═════╝ ╚═════╝╚═╝  ╚═╝
BANNER
echo -e "${R}"
echo -e "  ${DIM}安装流程：环境检测 → Claude Code → CCR → 模型配置 → 启动服务${R}"
echo

# ══════════════════════════════════════════════════════════════════════════════
# 步骤 1/5：环境检测
# ══════════════════════════════════════════════════════════════════════════════
step "1/5  检测运行环境"
progress 1 5 "环境检测..."; echo

[[ "$(uname)" == "Darwin" ]] || die "仅支持 macOS，当前系统：$(uname)"
ok "macOS $(sw_vers -productVersion)"

# Node.js
if ! command -v node &>/dev/null; then
  warn "未找到 Node.js，尝试通过 Homebrew 安装..."
  command -v brew &>/dev/null || die "请先安装 Homebrew (https://brew.sh) 或手动安装 Node.js >= 20"
  brew install node
fi
NODE_MAJOR=$(node --version | sed 's/v//' | cut -d. -f1)
[[ "$NODE_MAJOR" -ge 20 ]] || die "需要 Node.js >= 20，当前 $(node --version)，请升级"
ok "Node.js $(node --version)  /  npm $(npm --version)"

# ══════════════════════════════════════════════════════════════════════════════
# 步骤 2/5：安装 Claude Code
# ══════════════════════════════════════════════════════════════════════════════
step "2/5  安装 Claude Code"
progress 2 5 "安装 Claude Code..."; echo

if command -v claude &>/dev/null; then
  ok "Claude Code 已安装 ($(claude --version 2>/dev/null || echo 'installed'))，跳过"
else
  info "安装 @anthropic-ai/claude-code ..."
  npm install -g @anthropic-ai/claude-code --silent
  ok "Claude Code 安装完成"
fi

# ══════════════════════════════════════════════════════════════════════════════
# 步骤 3/5：安装 Claude Code Router
# ══════════════════════════════════════════════════════════════════════════════
step "3/5  安装 Claude Code Router"
progress 3 5 "安装 CCR..."; echo

if command -v ccr &>/dev/null; then
  ok "CCR 已安装 ($(ccr --version 2>/dev/null || echo 'installed'))，跳过"
  info "如需更新：npm install -g @wangjibins/claude-code-router"
else
  info "安装 @wangjibins/claude-code-router ..."
  npm install -g @wangjibins/claude-code-router --silent
  ok "Claude Code Router 安装完成 → $(which ccr)"
fi

# ══════════════════════════════════════════════════════════════════════════════
# 安装 /ccr-model Skill（Claude Code 内置切换模型命令）
# ══════════════════════════════════════════════════════════════════════════════
SKILL_DIR="$HOME/.claude/skills/ccr-model"
mkdir -p "$SKILL_DIR"
cat > "$SKILL_DIR/SKILL.md" << 'SKILLEOF'
---
name: ccr-model
description: 切换 Claude Code Router 的模型。当用户想查看 CCR 可用模型列表、切换当前模型时使用。
argumenthint: "[provider,modelAlias] 或留空显示列表"
allowed-tools: Bash
---

请按以下步骤帮我查看和切换 Claude Code Router 的可用模型。

## 第一步：读取当前配置

\`\`\`bash
echo "=== CCR 配置 ===" && cat "$HOME/.claude-code-router/config.json" && echo "" && echo "=== 当前会话模型 ===" && cat "$HOME/.claude/settings.json"
\`\`\`

## 第二步：解析并展示模型列表

从 CCR 的 config.json 中解析 Providers 数组，按以下规则展示：
- 优先展示 alias 别名（用户友好名称），格式：provider,alias
- 没有别名的模型展示原始 model ID，格式：provider,modelId
- 对照 ~/.claude/settings.json 的 model 字段，标注当前正在使用的模型

展示格式示例：
```
📋 CCR 可用模型列表
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  1. claude,opus4.6        (ep-dknqnj-xxxx)
  2. claude,sonnet4.6      (ep-h67tra-xxxx)  ← 当前使用
  3. gemini,gemini2.5pro   (gemini-2.5-pro-preview)
  4. gemini,gemini2.5flash (gemini-2.5-flash-preview)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
当前模型: claude,sonnet4.6
```

## 第三步：处理参数或等待选择

如果用户传入了参数（$ARGUMENTS 非空），直接将 $ARGUMENTS 作为目标模型，跳到第四步。

否则，询问用户："请输入序号或模型名称来切换，或输入 q 取消："
支持输入序号（如 2）或完整模型名（如 claude,sonnet4.6）

## 第四步：告知用户如何切换

重要原理：
- /model 命令会直接更新 Claude Code 进程的内存状态，当前会话立即生效
- 通过 Bash 写文件的方式只能影响下一次会话，无法更新进程内存

因此，请告知用户直接在对话框输入以下命令来完成切换（当前对话立即生效，上下文完整保留）：

/model <用户选择的模型>

例如用户选择切换到 claude,opus4.6，告知用户：

> 请直接在输入框中执行：
> /model claude,opus4.6
> 这会立即切换当前会话的模型，上下文完整保留，无需重启。

## 第五步：补充说明

向用户说明：
1. /model 命令会更新进程内存，当前对话后续消息立即使用新模型
2. 同时自动写入 ~/.claude/settings.json，下次启动 Claude Code 默认使用该模型
3. CCR 路由器会自动将 provider,alias 解析为真实的模型 ID 进行转发，无需关心底层 endpoint
SKILLEOF
ok "/ccr-model skill 已安装 → 在 Claude Code 中输入 /ccr-model 即可切换模型"

# ══════════════════════════════════════════════════════════════════════════════
# 步骤 4/5：配置
# ══════════════════════════════════════════════════════════════════════════════
step "4/5  配置模型"
progress 4 5 "配置中..."; echo

CONFIG_DIR="$HOME/.claude-code-router"
CONFIG_FILE="$CONFIG_DIR/config.json"
mkdir -p "$CONFIG_DIR"
API_BASE_URL="https://wanqing-api.corp.kuaishou.com/api/gateway/v1/endpoints/chat/completions"

# 检测是否已有配置
if [[ -f "$CONFIG_FILE" ]]; then
  echo
  warn "检测到已有配置文件：$CONFIG_FILE"
  ask "是否重新配置？(y/N)："
  read -r RECONFIGURE
  if [[ ! "$RECONFIGURE" =~ ^[Yy]$ ]]; then
    ok "保留现有配置，跳过配置步骤"
    SKIP_CONFIG=true
  fi
fi

if [[ "$SKIP_CONFIG" != "true" ]]; then

  # ── 收集所有 Provider 数据（JSON 格式，供最后 python3 写入）──────────────
  ALL_PROVIDERS_JSON="["  # 累积所有 provider 的 JSON 片段
  ALL_MODEL_DISPLAY=()    # 所有模型显示名（跨 provider），用于路由选择
  ALL_MODEL_PROVIDER=()   # 对应每个模型属于哪个 provider
  PROVIDER_COUNT=0

  while true; do
    PROVIDER_COUNT=$((PROVIDER_COUNT + 1))
    echo
    sep
    echo -e "  ${BCYAN}配置 Provider $PROVIDER_COUNT${R}"
    sep
    echo

    # ── Provider 名称 ────────────────────────────────────────────────────────
    ask "Provider 名称 (默认: wanqing)："
    read -r PROVIDER_NAME < /dev/tty
    PROVIDER_NAME="${PROVIDER_NAME:-wanqing}"
    ok "Provider: $PROVIDER_NAME"

    # ── API Base URL & transformer 固定，无需用户配置 ──────────────────────
    CUSTOM_URL="$API_BASE_URL"
    info "API Endpoint: $CUSTOM_URL"
    info "Transformer:  openai（自动转换请求格式）"

    # ── API Key ──────────────────────────────────────────────────────────────
    echo
    echo -e "  ${DIM}API Key 用于鉴权，从平台控制台获取${R}"
    echo -e "  ${DIM}示例：sk-abc123xyz456...${R}"
    ask "API Key (必填)："
    while true; do
      read -r API_KEY < /dev/tty
      [[ -n "$API_KEY" ]] && break
      warn "API Key 不能为空，请重新输入："
    done
    ok "API Key: $API_KEY"

    # ── 模型列表 ─────────────────────────────────────────────────────────────
    echo
    echo -e "  ${BCYAN}配置模型${R}  ${DIM}(至少填一个，留空回车结束)${R}"
    echo -e "  ${DIM}Model ID 从平台端点页面获取，示例：ep-dknqnj-1774531541496556905${R}"
    echo -e "  ${DIM}别名是你给模型起的短名，用于 /model 命令，示例：opus4.6、sonnet4、gpt4o${R}"
    echo

    MODELS_JSON="[" ALIAS_JSON="[" MODEL_DISPLAY=() MODEL_COUNT=0

    while true; do
      echo -e "  ${DIM}示例：ep-dknqnj-1774531541496556905${R}"
      ask "模型 $((MODEL_COUNT+1)) ID (留空结束)："
      read -r MODEL_ID < /dev/tty
      if [[ -z "$MODEL_ID" ]]; then
        [[ $MODEL_COUNT -eq 0 ]] && { warn "至少需要一个模型！"; continue; }
        break
      fi
      echo -e "  ${DIM}示例：opus4.6 / sonnet4.6 / gemini2.5pro（留空则使用 Model ID）${R}"
      ask "  └ 别名 (可选)："
      read -r MODEL_ALIAS < /dev/tty

      [[ $MODEL_COUNT -gt 0 ]] && MODELS_JSON+=","
      MODELS_JSON+="\"$MODEL_ID\""

      if [[ -n "$MODEL_ALIAS" ]]; then
        [[ "$ALIAS_JSON" != "[" ]] && ALIAS_JSON+=","
        ALIAS_JSON+="{\"modelId\":\"$MODEL_ID\",\"alias\":\"$MODEL_ALIAS\"}"
        MODEL_DISPLAY+=("$MODEL_ALIAS")
        ok "  已添加：${CYAN}$MODEL_ALIAS${R} → ${DIM}$MODEL_ID${R}"
      else
        MODEL_DISPLAY+=("$MODEL_ID")
        ok "  已添加：${CYAN}$MODEL_ID${R}"
      fi
      MODEL_COUNT=$((MODEL_COUNT + 1))
    done

    MODELS_JSON+="]" ALIAS_JSON+="]"

    # 把本 provider 的模型追加到全局列表
    for m in "${MODEL_DISPLAY[@]}"; do
      ALL_MODEL_DISPLAY+=("$PROVIDER_NAME,$m")
      ALL_MODEL_PROVIDER+=("$PROVIDER_NAME")
    done

    # 追加本 provider JSON 片段
    [[ "$ALL_PROVIDERS_JSON" != "[" ]] && ALL_PROVIDERS_JSON+=","
    ALL_PROVIDERS_JSON+="{\"name\":\"$PROVIDER_NAME\",\"api_base_url\":\"$API_BASE_URL\",\"api_key\":\"$API_KEY\",\"models\":$MODELS_JSON,\"alias\":$ALIAS_JSON,\"transformer\":{\"use\":[\"openai\"]}}"

    # 展示本 provider 已配置模型
    echo
    echo -e "  ${BCYAN}Provider $PROVIDER_COUNT 已配置 $MODEL_COUNT 个模型：${R}"
    for i in "${!MODEL_DISPLAY[@]}"; do
      echo -e "  ${CYAN}  [$((${#ALL_MODEL_DISPLAY[@]} - MODEL_COUNT + i + 1))]${R} $PROVIDER_NAME,${MODEL_DISPLAY[$i]}"
    done

    # ── 是否继续添加 Provider ─────────────────────────────────────────────────
    echo
    ask "是否继续添加第 $((PROVIDER_COUNT+1)) 个 Provider？(y/N)："
    read -r ADD_MORE < /dev/tty
    [[ "$ADD_MORE" =~ ^[Yy]$ ]] || break
  done

  ALL_PROVIDERS_JSON+="]"
  TOTAL_MODEL_COUNT=${#ALL_MODEL_DISPLAY[@]}

  # ── 展示所有模型汇总（用于路由选择）─────────────────────────────────────
  echo
  echo -e "  ${BCYAN}所有可用模型（路由选择用）：${R}"
  for i in "${!ALL_MODEL_DISPLAY[@]}"; do
    echo -e "  ${CYAN}  [$((i+1))]${R} ${ALL_MODEL_DISPLAY[$i]}"
  done

  # ── 路由配置 ───────────────────────────────────────────────────────────────
  echo
  sep
  echo -e "  ${BCYAN}配置路由规则${R}"
  sep
  echo
  echo -e "  CCR 会根据请求类型自动选择不同模型，请为每种场景指定模型序号。"
  echo

  do_pick_router() {
    local label="$1" desc="$2"
    echo -e "  ${BCYAN}▸ $label${R}"
    echo -e "  ${DIM}$desc${R}"
    echo -e "  ${DIM}可用模型：${R}"
    for i in "${!ALL_MODEL_DISPLAY[@]}"; do
      echo -e "  ${CYAN}    [$((i+1))]${R} ${ALL_MODEL_DISPLAY[$i]}"
    done
    echo -e "  ${DIM}示例：输入 1 选择 ${ALL_MODEL_DISPLAY[0]}${R}"
    ask "请输入序号 (默认 1)："
    read -r _IDX < /dev/tty; _IDX="${_IDX:-1}"
    if [[ "$_IDX" =~ ^[0-9]+$ && $_IDX -ge 1 && $_IDX -le $TOTAL_MODEL_COUNT ]]; then
      PICKED_ROUTER="${ALL_MODEL_DISPLAY[$((_IDX - 1))]}"
    else
      warn "无效序号，使用默认 1"
      PICKED_ROUTER="${ALL_MODEL_DISPLAY[0]}"
    fi
    ok "已选择：$PICKED_ROUTER"
    echo
  }

  do_pick_router "Default — 默认模型" \
    "普通对话时使用的模型。大多数请求都走这个通道，建议选能力强且稳定的模型。"
  ROUTER_DEFAULT="$PICKED_ROUTER"

  do_pick_router "LongContext — 长上下文模型" \
    "当上下文超过 60K tokens 时自动切换。建议选支持长上下文窗口的模型，避免截断。"
  ROUTER_LONG="$PICKED_ROUTER"

  do_pick_router "WebSearch — 联网搜索模型" \
    "当请求携带 web_search 工具时使用。建议选支持联网搜索的模型。"
  ROUTER_SEARCH="$PICKED_ROUTER"

  echo
  sep
  echo -e "  ${BCYAN}路由规则汇总${R}"
  sep
  printf "  ${CYAN}%-16s${R} %s\n" "Default:"     "$ROUTER_DEFAULT"
  printf "  ${CYAN}%-16s${R} %s\n" "LongContext:" "$ROUTER_LONG"
  printf "  ${CYAN}%-16s${R} %s\n" "WebSearch:"   "$ROUTER_SEARCH"
  echo

  # ── 写入 config.json（通过环境变量传递数据，完全避免命令行参数转义问题）─
  _P="$ALL_PROVIDERS_JSON" \
  _RD="$ROUTER_DEFAULT" \
  _RL="$ROUTER_LONG" \
  _RS="$ROUTER_SEARCH" \
  _CF="$CONFIG_FILE" \
  python3 << 'PYEOF'
import json, os

providers_raw  = json.loads(os.environ['_P'])
router_default = os.environ['_RD']
router_long    = os.environ['_RL']
router_search  = os.environ['_RS']
config_file    = os.environ['_CF']

providers = []
for p in providers_raw:
    provider = {
        'name': p['name'],
        'api_base_url': p['api_base_url'],
        'api_key': p['api_key'],
        'models': p['models'],
    }
    if p.get('transformer'):
        provider['transformer'] = p['transformer']
    if p.get('alias'):
        provider['alias'] = p['alias']
    providers.append(provider)

config = {
    'PORT': 13456,
    'LOG': True,
    'LOG_LEVEL': 'info',
    'API_TIMEOUT_MS': 600000,
    'Providers': providers,
    'Router': {
        'default': router_default,
        'longContext': router_long,
        'webSearch': router_search
    }
}

with open(config_file, 'w') as f:
    json.dump(config, f, indent=2, ensure_ascii=False)
    f.write('\n')
PYEOF
  ok "配置已写入 $CONFIG_FILE"

  # ── 同步默认模型到 ~/.claude/settings.json ────────────────────────────────
  _RD="$ROUTER_DEFAULT" python3 << 'SETTINGSEOF'
import json, os

router_default = os.environ['_RD']
settings_path  = os.path.expanduser('~/.claude/settings.json')

try:
    with open(settings_path, 'r') as f:
        settings = json.load(f)
except (FileNotFoundError, json.JSONDecodeError):
    settings = {}

old_model = settings.get('model', '（未设置）')
settings['model'] = router_default

with open(settings_path, 'w') as f:
    json.dump(settings, f, indent=2, ensure_ascii=False)
    f.write('\n')

print(f'已同步 Claude Code 默认模型: {old_model} → {router_default}')
SETTINGSEOF
  ok "~/.claude/settings.json 已同步：model = $ROUTER_DEFAULT"
fi

# ══════════════════════════════════════════════════════════════════════════════
# 创建 /ccr-model skill
# ══════════════════════════════════════════════════════════════════════════════
SKILL_DIR="$HOME/.claude/skills/ccr-model"
mkdir -p "$SKILL_DIR"
cat > "$SKILL_DIR/SKILL.md" << 'SKILLEOF'
---
name: ccr-model
description: 切换 Claude Code Router 的模型。当用户想查看 CCR 可用模型列表、切换当前模型时使用。
argumenthint: "[provider,modelAlias] 或留空显示列表"
allowed-tools: Bash
---

你是一个模型切换助手，帮助用户查看和切换 Claude Code Router (CCR) 配置的模型。

## 第一步：读取 CCR 配置

使用 Bash 工具执行：
```bash
cat ~/.claude-code-router/config.json
```

## 第二步：解析并展示模型列表

从配置中提取所有 Provider 的模型信息，以表格形式展示：

```
可用模型列表：
┌─────┬──────────────────────┬──────────────────────────────────┐
│ 序号 │ 切换命令              │ Model ID                         │
├─────┼──────────────────────┼──────────────────────────────────┤
│  1  │ claude,opus4.6       │ ep-dknqnj-177453...              │
│  2  │ claude,sonnet4.6     │ ep-h67tra-177453...              │
└─────┴──────────────────────┴──────────────────────────────────┘
```

同时读取当前默认模型：
```bash
cat ~/.claude/settings.json | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('model','未设置'))"
```

## 第三步：处理用户切换请求

如果用户指定了要切换的模型（如 "切换到 sonnet" 或 "用 opus"），根据列表找到对应的切换命令。

## 第四步：告知用户如何切换

**重要原理**：
- `/model` 命令会直接更新 Claude Code 进程的内存状态，**当前会话立即生效**
- 通过 Bash 写文件的方式只能影响下一次会话，无法更新进程内存

因此，请直接在对话框输入以下命令来完成切换（将 `<切换命令>` 替换为实际命令）：

```
/model <切换命令>
```

例如切换到 sonnet4.6：
```
/model claude,sonnet4.6
```

切换后标题栏会立即更新显示新模型名称。
SKILLEOF
ok "/ccr-model skill 已创建：$SKILL_DIR/SKILL.md"

# ══════════════════════════════════════════════════════════════════════════════
# 完成
# ══════════════════════════════════════════════════════════════════════════════
echo
echo -e "${BGREEN}══════════════════════════════════════════════════════${R}"
echo -e "${BGREEN}  🎉  安装完成！请按以下步骤启动服务：${R}"
echo -e "${BGREEN}══════════════════════════════════════════════════════${R}"
echo
echo -e "  ${BOLD}Step 1${R}  启动 / 重启服务"
echo -e "  ${CYAN}  ccr restart${R}"
echo
echo -e "  ${BOLD}Step 2${R}  确认服务状态"
echo -e "  ${CYAN}  ccr status${R}"
echo
echo -e "  ${BOLD}Step 3${R}  开启 Claude Code"
echo -e "  ${CYAN}  ccr code${R}"
echo
sep
echo -e "  ${DIM}其他常用命令：${R}"
echo -e "  ${CYAN}ccr ui${R}         打开 Web UI 配置界面"
echo -e "  ${CYAN}ccr model${R}      终端交互式切换模型"
echo -e "  ${DIM}配置文件：$CONFIG_FILE${R}"
echo
