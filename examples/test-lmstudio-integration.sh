#!/bin/bash

echo "🧪 Testing LM Studio Integration with Claude Code Router"
echo "=================================================="

# Check if LM Studio is running
echo "1. Testing LM Studio API directly..."
if curl -s -f http://localhost:1234/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "google/gemma-3n-e4b",
    "messages": [
      { "role": "user", "content": "Hello, respond with just: LM Studio is working!" }
    ],
    "temperature": 0.7,
    "max_tokens": 50,
    "stream": false
  }' > /tmp/lmstudio_test.json 2>/dev/null; then
  echo "✅ LM Studio API is responding"
  echo "Response: $(cat /tmp/lmstudio_test.json | grep -o '"content":"[^"]*"' | head -1)"
else
  echo "❌ LM Studio API is not responding on http://localhost:1234"
  echo "   Make sure LM Studio is running with the model loaded"
  exit 1
fi

echo ""
echo "2. Checking CCR configuration..."
if [ -f "$HOME/.claude-code-router/config.json" ]; then
  echo "✅ CCR config exists at $HOME/.claude-code-router/config.json"
  if grep -q "lmstudio" "$HOME/.claude-code-router/config.json"; then
    echo "✅ LM Studio provider found in config"
  else
    echo "⚠️  LM Studio provider not found in config"
    echo "   Run ./setup-lmstudio.sh to configure"
  fi
else
  echo "❌ CCR config not found"
  echo "   Run ./setup-lmstudio.sh to create configuration"
  exit 1
fi

echo ""
echo "3. Testing CCR status..."
if ccr status 2>/dev/null | grep -q "running"; then
  echo "✅ CCR is running"
elif ccr status 2>/dev/null | grep -q "stopped"; then
  echo "🔄 Starting CCR..."
  ccr start
  sleep 3
  if ccr status 2>/dev/null | grep -q "running"; then
    echo "✅ CCR started successfully"
  else
    echo "❌ Failed to start CCR"
    exit 1
  fi
else
  echo "❌ CCR command not found or error occurred"
  echo "   Make sure @musistudio/claude-code-router is installed globally"
  exit 1
fi

echo ""
echo "4. Testing CCR with LM Studio integration..."
echo "   Sending test prompt to CCR..."

# Test CCR integration
TEST_RESPONSE=$(ccr code "Just respond with: CCR + LM Studio integration working!" 2>&1)

if echo "$TEST_RESPONSE" | grep -q "working"; then
  echo "✅ CCR + LM Studio integration is working!"
  echo "Response preview: $(echo "$TEST_RESPONSE" | head -3)"
else
  echo "❌ CCR + LM Studio integration test failed"
  echo "Response: $TEST_RESPONSE"
  echo ""
  echo "Troubleshooting steps:"
  echo "1. Verify LM Studio has the correct model loaded"
  echo "2. Check CCR logs: tail -f ~/.claude-code-router/claude-code-router.log"
  echo "3. Verify configuration: cat ~/.claude-code-router/config.json"
  exit 1
fi

echo ""
echo "🎉 All tests passed! LM Studio integration is working correctly."
echo ""
echo "You can now use Claude Code with LM Studio:"
echo "  ccr code 'Your prompt here'"
echo ""
echo "To switch models dynamically:"
echo "  /model lmstudio,your-model-name"

# Clean up
rm -f /tmp/lmstudio_test.json