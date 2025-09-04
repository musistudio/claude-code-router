#!/bin/bash

# Backup script pentru configurația Claude Code Router
# Rulează acest script înainte de orice update pentru a salva modificările

BACKUP_DIR="$HOME/.claude-code-router/backups"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_PATH="$BACKUP_DIR/backup_$DATE"

echo "🔄 Creating backup in $BACKUP_PATH"

# Create backup directory
mkdir -p "$BACKUP_PATH"

# Backup analytics system
echo "📊 Backing up analytics system..."
cp -r "src/utils/analytics.ts" "$BACKUP_PATH/" 2>/dev/null || echo "Analytics file not found"

# Backup dark theme overrides
echo "🎨 Backing up dark theme..."
cp -r "ui/src/styles/dark-theme-overrides.css" "$BACKUP_PATH/" 2>/dev/null || echo "Dark theme file not found"

# Backup analytics data
echo "💾 Backing up analytics data..."
cp -r "$HOME/.claude-code-router/analytics" "$BACKUP_PATH/" 2>/dev/null || echo "Analytics data not found"

# Backup config
echo "⚙️ Backing up config..."
cp -r "$HOME/.claude-code-router/config.json" "$BACKUP_PATH/" 2>/dev/null || echo "Config not found"

# Create restore script
cat > "$BACKUP_PATH/restore.sh" << 'EOF'
#!/bin/bash
echo "🔄 Restoring Claude Code Router configuration..."

# Restore analytics
cp analytics.ts "$(pwd)/src/utils/" 2>/dev/null && echo "✅ Analytics restored"

# Restore dark theme
mkdir -p "$(pwd)/ui/src/styles"
cp dark-theme-overrides.css "$(pwd)/ui/src/styles/" 2>/dev/null && echo "✅ Dark theme restored"

# Restore analytics data  
mkdir -p "$HOME/.claude-code-router"
cp -r analytics "$HOME/.claude-code-router/" 2>/dev/null && echo "✅ Analytics data restored"

# Restore config
cp config.json "$HOME/.claude-code-router/" 2>/dev/null && echo "✅ Config restored"

echo "🎉 Restore complete! Don't forget to rebuild: npm run build"
EOF

chmod +x "$BACKUP_PATH/restore.sh"

echo "✅ Backup complete!"
echo "📍 Location: $BACKUP_PATH"
echo "🔄 To restore after update, run: $BACKUP_PATH/restore.sh"
