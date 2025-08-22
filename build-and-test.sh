#!/bin/bash
# CCR build and test script for yalc workflow
# Run this after pushing changes from llms-dev

set -e

echo "🔧 Building CCR with updated LLMS package..."

# 1. Build CCR
echo "📦 Building CCR..."
npm run build

# 2. Show yalc status
echo ""
echo "📋 Current yalc status:"
yalc check

# 3. Show the linked package info
echo ""
echo "📦 Linked package info:"
ls -la node_modules/@musistudio/llms/

echo ""
echo "✅ CCR build complete!"
echo "🚀 Ready for testing!"