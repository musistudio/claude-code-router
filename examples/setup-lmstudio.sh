#!/bin/bash

# Setup script for integrating Claude Code Router with LM Studio
echo "Setting up Claude Code Router for LM Studio..."

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Create .claude-code-router directory if it doesn't exist
mkdir -p "$HOME/.claude-code-router"

# Copy the LM Studio configuration
echo "Copying LM Studio configuration..."
cp "$SCRIPT_DIR/config.lmstudio.json" "$HOME/.claude-code-router/config.json"

echo "Configuration copied to $HOME/.claude-code-router/config.json"
echo ""
echo "To use CCR with LM Studio:"
echo "1. Make sure LM Studio is running on http://localhost:1234"
echo "2. Load the model 'google/gemma-3n-e4b' in LM Studio"
echo "3. Run: ccr start"
echo "4. Run: ccr code 'your prompt here'"
echo ""
echo "You can also edit the configuration at:"
echo "$HOME/.claude-code-router/config.json"
echo ""
echo "To change the model, update the 'models' array in the lmstudio provider"
echo "and update the Router section accordingly."