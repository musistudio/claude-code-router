#!/bin/bash

echo "🛡️ Backing up dashboard before update..."

# Create backup directory
BACKUP_DIR="/tmp/dashboard-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

# Backup dashboard files
cp -r ui/src/components/dashboard "$BACKUP_DIR/" 2>/dev/null || echo "No dashboard folder found"
cp ui/src/config/dashboard.ts "$BACKUP_DIR/" 2>/dev/null || echo "No dashboard config found"
cp ui/src/styles/dashboard.css "$BACKUP_DIR/" 2>/dev/null || echo "No dashboard styles found"

echo "📁 Dashboard backed up to: $BACKUP_DIR"

# Run the original update
echo "🔄 Running upstream update..."
./update-from-upstream.sh

# Check if dashboard files still exist
if [ ! -d "ui/src/components/dashboard" ]; then
    echo "⚠️ Dashboard folder missing after update - restoring..."
    cp -r "$BACKUP_DIR/dashboard" "ui/src/components/" 2>/dev/null
fi

if [ ! -f "ui/src/config/dashboard.ts" ]; then
    echo "⚠️ Dashboard config missing after update - restoring..."
    cp "$BACKUP_DIR/dashboard.ts" "ui/src/config/" 2>/dev/null
fi

if [ ! -f "ui/src/styles/dashboard.css" ]; then
    echo "⚠️ Dashboard styles missing after update - restoring..."
    cp "$BACKUP_DIR/dashboard.css" "ui/src/styles/" 2>/dev/null
fi

echo "✅ Dashboard protection complete!"
echo "💡 If you see conflicts in App.tsx, just re-add the dashboard route"
echo "🗂️ Backup kept at: $BACKUP_DIR"
