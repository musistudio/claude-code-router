#!/bin/bash

# Script to publish ccr-next to npm

echo "🚀 Publishing ccr-next to npm..."

# Check if logged in to npm
npm whoami &> /dev/null
if [ $? != 0 ]; then
  echo "❌ You need to be logged in to npm"
  echo "Run: npm login"
  exit 1
fi

# Clean and build
echo "📦 Building package..."
npm run build

# Publish
echo "📤 Publishing to npm..."
npm publish

if [ $? == 0 ]; then
  echo "✅ Successfully published ccr-next!"
  echo "Install with: npm install -g ccr-next"
else
  echo "❌ Failed to publish"
  exit 1
fi