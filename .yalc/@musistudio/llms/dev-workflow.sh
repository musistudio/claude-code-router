#!/bin/bash
# Development workflow script for rapid yalc iteration
# Use this for rapid development iteration to avoid npm cache issues

set -e

echo "🔧 Starting development workflow..."

# 1. Build the package
echo "📦 Building package..."
npm run build

# 2. Publish to yalc
echo "📤 Publishing to yalc..."
yalc publish

# 3. Push updates to all linked projects
echo "🚀 Pushing updates to linked projects..."
yalc push

echo "✅ Development workflow complete!"
echo ""
echo "📋 Next steps:"
echo "   1. Go to ccr-dev: cd /Users/fredrikbranstrom/ccr-dev"
echo "   2. Build CCR: npm run build"
echo "   3. Test your changes"
echo ""
echo "🔄 For subsequent changes, just run: ./dev-workflow.sh"