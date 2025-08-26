#!/bin/bash
# Claude Code Router Local Development Script  
# This script runs the local version from current directory with local config

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🚀 Starting LOCAL Claude Code Router (development version on port 3456)"
echo "📁 Working directory: $SCRIPT_DIR"  
echo "🔧 Using LOCAL config: $SCRIPT_DIR/config-local.json"
echo "🌐 Local UI will be available at: http://localhost:3456/ui/"
echo ""

# Set environment variable to use local config file
export CCR_CONFIG_PATH="$SCRIPT_DIR/config-local.json"

# Run the local version with local config
node dist/cli.js "$@"