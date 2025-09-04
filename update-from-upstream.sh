#!/bin/bash

echo "🔄 Updating from upstream..."

# Fetch latest changes
git fetch upstream

# Check if there are updates
UPDATES=$(git log --oneline main..upstream/main)

if [ -z "$UPDATES" ]; then
    echo "✅ Already up to date!"
    exit 0
fi

echo "📝 New updates found:"
echo "$UPDATES"

# Ask for confirmation
read -p "🤔 Apply these updates? (y/N): " -n 1 -r
echo

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🔧 Applying updates..."
    
    # Merge upstream changes
    git merge upstream/main
    
    # Rebuild project
    echo "🏗️ Rebuilding project..."
    npm run build
    
    echo "✅ Updates applied successfully!"
    echo "💡 Your fork now has the latest changes from upstream"
else
    echo "❌ Updates cancelled"
fi
