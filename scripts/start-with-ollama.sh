#!/bin/bash

# Claude Code Router - Start with Local Models
# Ensures Ollama models are running before starting CCR

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_FILE="$HOME/.claude-code-router/startup.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$LOG_FILE"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1" | tee -a "$LOG_FILE"
}

# Create log directory if not exists
mkdir -p "$(dirname "$LOG_FILE")"

log "🚀 Starting Claude Code Router with local models..."

# Check if Ollama is installed
if ! command -v ollama &> /dev/null; then
    error "Ollama is not installed. Please install it first:"
    error "curl -fsSL https://ollama.ai/install.sh | sh"
    exit 1
fi

# Function to check if Ollama service is running
check_ollama_service() {
    if pgrep -x "ollama" > /dev/null; then
        return 0
    else
        return 1
    fi
}

# Function to check if a model is loaded and ready
check_model_ready() {
    local model=$1
    local max_attempts=30
    local attempt=1
    
    log "🔍 Checking if model $model is ready..."
    
    while [ $attempt -le $max_attempts ]; do
        if curl -sf "http://localhost:11434/api/generate" \
           -H "Content-Type: application/json" \
           -d "{\"model\":\"$model\",\"prompt\":\"test\",\"stream\":false}" > /dev/null 2>&1; then
            success "✅ Model $model is ready!"
            return 0
        fi
        
        warn "⏳ Attempt $attempt/$max_attempts: Model $model not ready yet, waiting..."
        sleep 2
        attempt=$((attempt + 1))
    done
    
    error "❌ Model $model failed to load after $max_attempts attempts"
    return 1
}

# Start Ollama service if not running
if ! check_ollama_service; then
    log "🔄 Starting Ollama service..."
    ollama serve > "$HOME/.claude-code-router/ollama.log" 2>&1 &
    sleep 3
    
    if check_ollama_service; then
        success "✅ Ollama service started"
    else
        error "❌ Failed to start Ollama service"
        exit 1
    fi
else
    success "✅ Ollama service is already running"
fi

# Pre-load models to ensure they're ready
log "🤖 Pre-loading local models..."

declare -a models=("gemma3:4b" "qwen2.5-coder:7b" "qwen2.5-coder:14b")
declare -a failed_models=()

for model in "${models[@]}"; do
    log "📥 Loading model: $model"
    
    # Start loading model in background
    curl -sf "http://localhost:11434/api/pull" \
         -H "Content-Type: application/json" \
         -d "{\"name\":\"$model\"}" > /dev/null 2>&1 &
    
    # Wait a bit then check if ready
    sleep 2
    
    if check_model_ready "$model"; then
        success "✅ Model $model loaded successfully"
    else
        error "❌ Failed to load model $model"
        failed_models+=("$model")
    fi
done

# Report model loading results
if [ ${#failed_models[@]} -eq 0 ]; then
    success "🎉 All models loaded successfully!"
else
    warn "⚠️  Some models failed to load: ${failed_models[*]}"
    warn "CCR will fallback to cloud providers for those models"
fi

# Check if CCR is already running
if pgrep -f "claude-code-router" > /dev/null; then
    log "🔄 Stopping existing CCR instance..."
    pkill -f "claude-code-router" || true
    sleep 2
fi

# Start Claude Code Router
log "🚀 Starting Claude Code Router..."
cd "$PROJECT_DIR"

# Set environment variables for optimal performance
export NODE_ENV=production
export CCR_OLLAMA_READY=1
export CCR_LOCAL_MODELS_AVAILABLE=1

# Start CCR in background (detached)
if nohup node "$PROJECT_DIR/dist/cli.js" start > "$HOME/.claude-code-router/ccr.log" 2>&1 &; then
    CCR_PID=$!
    sleep 3
    
    # Check if process is still running
    if kill -0 $CCR_PID 2>/dev/null; then
        success "🎉 Claude Code Router started successfully! (PID: $CCR_PID)"
        success "📊 Local models: ${#models[@]} loaded"
        success "🔗 Web UI: http://localhost:3456"
        success "📝 Logs:"
        success "   • Startup: $LOG_FILE"
        success "   • Runtime: $HOME/.claude-code-router/ccr.log"
        
        # Display configuration summary
        log ""
        log "📋 Configuration Summary (conform documentației CCR):"
        log "   • Default (task-uri generale): ollama-local,gemma3:4b"
        log "   • Background (task-uri ușoare): ollama-local,qwen2.5-coder:7b" 
        log "   • Think (reasoning/planning): ollama-local,qwen2.5-coder:14b"
        log "   • Long Context (peste 32K): mircea-gabriel,gemini-2.5-pro"
        log "   • Web Search: mircea-gabriel,gemini-2.5-flash"
        log ""
        success "🎯 Ready to use! Try: ccr code 'Hello from local model!'"
        success "🔄 Service is now running in background. Use 'ccr status' to check."
        
        # Write PID to file for later management
        echo $CCR_PID > "$HOME/.claude-code-router/ccr.pid"
        
    else
        error "❌ CCR failed to start properly"
        exit 1
    fi
else
    error "❌ Failed to start CCR"
    exit 1
fi

log ""
log "✅ Startup script completed. Claude Code Router is running in background."
log "   Use 'ccr status' to check service status"
log "   Use 'ccr stop' to stop the service"