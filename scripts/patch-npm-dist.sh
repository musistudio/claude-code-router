#!/usr/bin/env bash
#
# CCR (claude-code-router) npm 2.1.1 patch script
#
# Fixes two bugs in the npm-published dist that affect Claude Code CLI 2.1.x:
#
#   1. Validator rejects thinking/redacted_thinking blocks
#      (interleaved-thinking + redact-thinking beta headers)
#
#   2. SSE streaming response never terminates properly
#      (stop_reason deleted, message_stop filtered → Claude Code retries
#       indefinitely, causing duplicate/repeated output)
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

# --- Patch 3: SSE streaming — filter provider framing events + restore stop_reason/message_stop ---
echo ""
echo "--- Patch: SSE streaming termination (stop_reason + message_stop) ---"

if grep -q 'Filtered out message_stop event to allow conversation continuation' "$CLI" 2>/dev/null; then
  node -e "
    const fs = require('fs');
    const f = process.argv[1];
    let c = fs.readFileSync(f, 'utf8');

    // Patch 3a: Filter provider's framing events instead of stripping stop_reason
    const old3a = \`        if (chunk.event === \\\"message_delta\\\" && chunk.data?.delta?.stop_reason) {
          const filteredData = { ...chunk.data };
          if (filteredData.delta) {
            filteredData.delta = { ...filteredData.delta };
            delete filteredData.delta.stop_reason;
            delete filteredData.delta.stop_sequence;
          }
          this.sendSSEEvent(reply, chunk.event, filteredData);
        } else if (chunk.event === \\\"message_stop\\\") {
          logger.debug(\\\"Filtered out message_stop event to allow conversation continuation\\\", {}, requestId, \\\"server\\\");
        } else {
          this.sendSSEEvent(reply, chunk.event, chunk.data);
        }\`;
    const new3a = \`        if (chunk.event === \\\"message_start\\\" || chunk.event === \\\"ping\\\" || chunk.event === \\\"message_delta\\\" || chunk.event === \\\"message_stop\\\") {
          logger.debug(\\\"Filtered framing event from provider\\\", { event: chunk.event }, requestId, \\\"server\\\");
        } else if ((chunk.event === \\\"content_block_start\\\" || chunk.event === \\\"content_block_stop\\\") && chunk.data?.index === 0) {
          logger.debug(\\\"Filtered duplicate text block framing from provider\\\", { event: chunk.event }, requestId, \\\"server\\\");
        } else {
          this.sendSSEEvent(reply, chunk.event, chunk.data);
        }\`;

    if (c.includes(old3a)) {
      c = c.replace(old3a, new3a);
      console.log('  OK: Patch 3a applied (filter framing events)');
    } else {
      console.log('  SKIP: Patch 3a pattern not found (already patched or version changed)');
    }

    // Patch 3b: Restore stop_reason and message_stop at end of stream
    const old3b = \`      this.sendSSEEvent(reply, \\\"message_delta\\\", {
        type: \\\"message_delta\\\",
        delta: {
          // stop_reason: stopReason, // 移除停止原因，但保持HTTP连接正常结束
          // stop_sequence: null      // 移除停止序列  
        },
        usage: {
          output_tokens: outputTokens
        }
      });
      reply.raw.end();\`;
    const new3b = \`      this.sendSSEEvent(reply, \\\"message_delta\\\", {
        type: \\\"message_delta\\\",
        delta: {
          stop_reason: \\\"end_turn\\\",
          stop_sequence: null
        },
        usage: {
          output_tokens: outputTokens
        }
      });
      this.sendSSEEvent(reply, \\\"message_stop\\\", {
        type: \\\"message_stop\\\"
      });
      reply.raw.end();\`;

    if (c.includes(old3b)) {
      c = c.replace(old3b, new3b);
      console.log('  OK: Patch 3b applied (restore stop_reason + message_stop)');
    } else {
      console.log('  SKIP: Patch 3b pattern not found (already patched or version changed)');
    }

    fs.writeFileSync(f, c);
  " "$CLI" 2>/dev/null
  patched=$((patched + 1))
else
  echo "  SKIP (already patched or pattern changed): SSE streaming"
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
if grep -q 'Filtered out message_stop event to allow conversation continuation' "$CLI" 2>/dev/null; then
  echo "FAIL: cli.js still strips message_stop (SSE streaming patch not applied)"
  exit 1
fi
echo "PASS: All patches verified — thinking blocks accepted, SSE streams terminate correctly"
