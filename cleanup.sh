#!/bin/bash

# Script pentru închiderea completă a proceselor Claude Code Router

echo "🛑 Stopping all Claude Code Router processes..."

# 1. Reset reference count first
echo "🗑️  Resetting reference count..."
rm -f /tmp/claude-code-reference-count.txt 2>/dev/null || true

# 2. Oprește procesele cu ccr
echo "📋 Stopping ccr processes..."
pkill -f "ccr" 2>/dev/null || true

# 3. Oprește procesele claude-code-router
echo "📋 Stopping claude-code-router processes..."
pkill -f "claude-code-router" 2>/dev/null || true

# 4. Oprește procesele pe portul 3456
echo "📋 Stopping processes on port 3456..."
lsof -ti:3456 | xargs kill -9 2>/dev/null || true

# 5. Curăță PID files
echo "🧹 Cleaning up PID files..."
rm -f ~/.claude-code-router/.claude-code-router.pid 2>/dev/null || true
rm -f /tmp/claude-code-router.pid 2>/dev/null || true

# 6. Verifică dacă mai sunt procese active
echo "✅ Checking remaining processes..."
REMAINING=$(ps aux | grep -E "(ccr|claude-code-router)" | grep -v grep | wc -l)

if [ "$REMAINING" -eq 0 ]; then
    echo "✅ All processes successfully stopped!"
    echo "💡 You can now safely start with: ccr code"
else
    echo "⚠️  Some processes might still be running:"
    ps aux | grep -E "(ccr|claude-code-router)" | grep -v grep
    echo ""
    echo "🔥 If needed, try manual force kill:"
    echo "   sudo pkill -9 -f claude"
fi

echo "🏁 Cleanup complete!"
