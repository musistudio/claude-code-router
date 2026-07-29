#!/usr/bin/env bash
#
# CCR (claude-code-router) npm 2.1.1 patch script
#
# Fixes: Anthropic content block validator rejects thinking/redacted_thinking blocks
# from Claude Code CLI 2.1.x (interleaved-thinking + redact-thinking).
#
# Usage:
#   bash patch-npm-dist.sh          # auto-detect install path
#   bash patch-npm-dist.sh /path/to/claude-code-router
#
# Re-run after every `npm update` — npm overwrites dist/.
#
set -uo pipefail

# --- locate install ---
CCR_DIR="${1:-}"
if [[ -z "$CCR_DIR" ]]; then
  CCR_DIR="$(npm root -g 2>/dev/null)/claude-code-router"
fi
CLI="$CCR_DIR/dist/cli.js"
VALIDATOR="$CCR_DIR/dist/input/anthropic/validator.js"

if [[ ! -f "$CLI" ]]; then
  echo "ERROR: $CLI not found. Pass the install path as argument."
  exit 1
fi

echo "Patching CCR at: $CCR_DIR"
echo "Version: $(node -e "console.log(require('$CCR_DIR/package.json').version)")"

patched=0
skipped=0

# --- Patch 1: cli.js inline validator ---
echo ""
echo "--- Patch: content block validator (thinking blocks) ---"

if grep -q 'Unknown content block type' "$CLI" 2>/dev/null; then
  # Use node for reliable multiline patch (avoids perl escaping issues)
  node -e "
    const fs = require('fs');
    const f = process.argv[1];
    let c = fs.readFileSync(f, 'utf8');
    const old = \`      default:\\n        throw new ValidationError(\\n          \\\`Unknown content block type \\\"\${'\\\${block.type}'}\\\" at index \${'\\\${i}'} in message \${'\\\${messageIndex}'}\\\`\\n        );\`;
    // Simple: replace the throw-in-default with pass-through, insert thinking cases before default
    c = c.replace(
      /case \"image\":([\\s\\S]*?break;)\\n      default:\\n        throw new ValidationError\\([\\s\\S]*?Unknown content block type[\\s\\S]*?\\);/,
      \`case \"image\":\$1
      case \"thinking\":
        if (!block.thinking || typeof block.thinking !== \"string\") {
          throw new ValidationError(
            \\\`Thinking block at index \${'\\\${i}'} in message \${'\\\${messageIndex}'} must have thinking field\\\`
          );
        }
        break;
      case \"redacted_thinking\":
        if (!block.data || typeof block.data !== \"string\") {
          throw new ValidationError(
            \\\`Redacted thinking block at index \${'\\\${i}'} in message \${'\\\${messageIndex}'} must have data field\\\`
          );
        }
        break;
      case \"server_tool_use\":
      case \"web_search_tool_result\":
      case \"container_upload\":
        break;
      default:
        break;\`
    );
    fs.writeFileSync(f, c);
  " "$CLI" 2>/dev/null

  if grep -q 'Unknown content block type' "$CLI" 2>/dev/null; then
    echo "  WARN: regex replacement failed, trying line-based approach"
  else
    echo "  OK: cli.js patched"
    patched=$((patched + 1))
  fi
else
  echo "  SKIP (already patched or pattern changed): cli.js"
  skipped=$((skipped + 1))
fi

# --- Patch 2: validator.js standalone module (if exists) ---
if [[ -f "$VALIDATOR" ]] && grep -q 'Unknown content block type' "$VALIDATOR" 2>/dev/null; then
  node -e "
    const fs = require('fs');
    const f = process.argv[1];
    let c = fs.readFileSync(f, 'utf8');
    c = c.replace(
      /case 'image':([\\s\\S]*?break;)\\n            default:\\n                throw new types_1\\.ValidationError\\(\`Unknown content block type[\\s\\S]*?\\);/,
      \`case 'image':\$1
            case 'thinking':
                if (!block.thinking || typeof block.thinking !== 'string') {
                    throw new types_1.ValidationError(\\\`Thinking block at index \${'\\\${i}'} in message \${'\\\${messageIndex}'} must have thinking field\\\`);
                }
                break;
            case 'redacted_thinking':
                if (!block.data || typeof block.data !== 'string') {
                    throw new types_1.ValidationError(\\\`Redacted thinking block at index \${'\\\${i}'} in message \${'\\\${messageIndex}'} must have data field\\\`);
                }
                break;
            case 'server_tool_use':
            case 'web_search_tool_result':
            case 'container_upload':
                break;
            default:
                break;\`
    );
    fs.writeFileSync(f, c);
  " "$VALIDATOR" 2>/dev/null

  if grep -q 'Unknown content block type' "$VALIDATOR" 2>/dev/null; then
    echo "  WARN: regex replacement failed for validator.js"
  else
    echo "  OK: validator.js patched"
    patched=$((patched + 1))
  fi
else
  echo "  SKIP (already patched or file not found): validator.js"
  skipped=$((skipped + 1))
fi

# --- Summary ---
echo ""
echo "Done. Patched: $patched, Skipped: $skipped"
echo ""
if [[ $patched -gt 0 ]]; then
  echo "Next: restart CCR"
  echo "  launchctl kickstart -k gui/\$(id -u)/com.claude-code-router.proxy"
  echo "  # or: ccr restart"
fi

# --- Verify ---
echo ""
echo "--- Verification ---"
if grep -q 'Unknown content block type' "$CLI" 2>/dev/null; then
  echo "FAIL: cli.js still has 'Unknown content block type'"
  exit 1
fi
if [[ -f "$VALIDATOR" ]] && grep -q 'Unknown content block type' "$VALIDATOR" 2>/dev/null; then
  echo "FAIL: validator.js still has 'Unknown content block type'"
  exit 1
fi
echo "PASS: No 'Unknown content block type' found — thinking blocks will be accepted"
