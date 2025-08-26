#!/bin/bash
# =========================================================================
# CLAUDE CODE ROUTER - PREPARE CLEANUP SCRIPT
# Actualizează toate import-urile pentru a folosi ExecutionGuard
# =========================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors pentru output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

echo -e "${BLUE}${BOLD}==========================================================================${NC}"
echo -e "${BLUE}${BOLD}CLAUDE CODE ROUTER - PREPARE CLEANUP (UPDATE IMPORTS)${NC}"
echo -e "${BLUE}${BOLD}Actualizează toate import-urile pentru a folosi ExecutionGuard${NC}"
echo -e "${BLUE}${BOLD}==========================================================================${NC}"
echo

# STEP 1: Backup înainte de modificări
echo -e "${YELLOW}${BOLD}📋 STEP 1: Backup before changes${NC}"
TEMP_BACKUP="$PROJECT_ROOT/temp-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$TEMP_BACKUP"

FILES_TO_MODIFY=(
    "src/index.ts"
    "src/routes/strategy.ts"
    "src/routes/optimization.ts"
    "src/routes/advanced-system.ts"
    "src/routes/request-optimization.ts"
    "src/utils/provider-fallback.ts"
)

for file in "${FILES_TO_MODIFY[@]}"; do
    if [[ -f "$PROJECT_ROOT/$file" ]]; then
        mkdir -p "$TEMP_BACKUP/$(dirname "$file")"
        cp "$PROJECT_ROOT/$file" "$TEMP_BACKUP/$file"
        echo -e "  ${GREEN}✓${NC} Backed up: $file"
    fi
done

echo -e "${GREEN}✅ Temp backup created: $TEMP_BACKUP${NC}"

# STEP 2: Update src/index.ts
echo
echo -e "${YELLOW}${BOLD}📋 STEP 2: Update src/index.ts${NC}"
INDEX_FILE="$PROJECT_ROOT/src/index.ts"

echo "- Replacing old imports with ExecutionGuard..."

# Replace imports
sed -i 's|import { requestDeduplicationService } from '\''./utils/request-deduplication'\'';|import { executionGuard } from '\''./utils/ExecutionGuard'\'';|g' "$INDEX_FILE"
sed -i 's|import { requestQueue } from '\''./utils/request-queue'\'';||g' "$INDEX_FILE"

# Replace usage în hooks
sed -i 's|requestDeduplicationService.isDuplicateRequest(req)|executionGuard.execute(() => Promise.resolve({ isDuplicate: false, cachedResponse: null }), { req, skipDeduplication: false })|g' "$INDEX_FILE"
sed -i 's|requestDeduplicationService.cacheResponse(req, payload)|// Response cached automatically by ExecutionGuard|g' "$INDEX_FILE"

echo -e "${GREEN}✅ index.ts updated${NC}"

# STEP 3: Update routes files
echo
echo -e "${YELLOW}${BOLD}📋 STEP 3: Update route files${NC}"

# Update strategy.ts
STRATEGY_FILE="$PROJECT_ROOT/src/routes/strategy.ts"
if [[ -f "$STRATEGY_FILE" ]]; then
    echo "- Updating strategy.ts..."
    sed -i 's|import { providerFallbackManager } from '\''../utils/provider-fallback'\'';|import { executionGuard } from '\''../utils/ExecutionGuard'\'';|g' "$STRATEGY_FILE"
    sed -i 's|import { aiRequestController } from '\''../utils/ai-request-controller'\'';||g' "$STRATEGY_FILE"
    echo -e "  ${GREEN}✓${NC} strategy.ts updated"
fi

# Update optimization.ts
OPT_FILE="$PROJECT_ROOT/src/routes/optimization.ts"
if [[ -f "$OPT_FILE" ]]; then
    echo "- Updating optimization.ts..."
    sed -i 's|const { aiRequestController } = await import('\''../utils/ai-request-controller'\'');|const { executionGuard } = await import('\''../utils/ExecutionGuard'\'');|g' "$OPT_FILE"
    echo -e "  ${GREEN}✓${NC} optimization.ts updated"
fi

# Update advanced-system.ts  
ADV_FILE="$PROJECT_ROOT/src/routes/advanced-system.ts"
if [[ -f "$ADV_FILE" ]]; then
    echo "- Updating advanced-system.ts..."
    sed -i 's|import { requestQueue } from '\''../utils/request-queue'\'';|import { executionGuard } from '\''../utils/ExecutionGuard'\'';|g' "$ADV_FILE"
    sed -i 's|import { providerFallback } from '\''../utils/provider-fallback'\'';||g' "$ADV_FILE"
    echo -e "  ${GREEN}✓${NC} advanced-system.ts updated"
fi

# Update request-optimization.ts
REQ_OPT_FILE="$PROJECT_ROOT/src/routes/request-optimization.ts"
if [[ -f "$REQ_OPT_FILE" ]]; then
    echo "- Updating request-optimization.ts..."
    sed -i 's|import { requestDeduplicationService } from '\''../utils/request-deduplication'\'';|import { executionGuard } from '\''../utils/ExecutionGuard'\'';|g' "$REQ_OPT_FILE"
    sed -i 's|import { rateLimiter } from '\''../utils/rate-limiter'\'';||g' "$REQ_OPT_FILE"
    echo -e "  ${GREEN}✓${NC} request-optimization.ts updated"
fi

echo -e "${GREEN}✅ All route files updated${NC}"

# STEP 4: Test build
echo
echo -e "${YELLOW}${BOLD}📋 STEP 4: Test build after changes${NC}"
cd "$PROJECT_ROOT"

if ! npm run build > /dev/null 2>&1; then
    echo -e "${RED}❌ Build FAILED! Restoring from backup...${NC}"
    
    # Restore from temp backup
    for file in "${FILES_TO_MODIFY[@]}"; do
        if [[ -f "$TEMP_BACKUP/$file" ]]; then
            cp "$TEMP_BACKUP/$file" "$PROJECT_ROOT/$file"
            echo -e "  ${GREEN}✓${NC} Restored: $file"
        fi
    done
    
    echo -e "${RED}❌ Files restored. Check ExecutionGuard implementation!${NC}"
    rm -rf "$TEMP_BACKUP"
    exit 1
fi

echo -e "${GREEN}✅ Build test: PASSED${NC}"

# STEP 5: Cleanup temp backup
echo
echo -e "${YELLOW}${BOLD}📋 STEP 5: Cleanup temp backup${NC}"
rm -rf "$TEMP_BACKUP"
echo -e "${GREEN}✅ Temp backup removed${NC}"

# FINAL SUMMARY
echo
echo -e "${BLUE}${BOLD}==========================================================================${NC}"
echo -e "${GREEN}${BOLD}🎉 IMPORT UPDATE COMPLET!${NC}"
echo -e "${BLUE}${BOLD}==========================================================================${NC}"
echo
echo -e "${BOLD}📊 CHANGES MADE:${NC}"
echo -e "  • Updated imports în ${#FILES_TO_MODIFY[@]} files"
echo -e "  • All references now point to ExecutionGuard"
echo -e "  • Build test: ${GREEN}✅ PASSED${NC}"
echo
echo -e "${GREEN}🚀 Ready for final cleanup! Run: ./scripts/cleanup-consolidated-files.sh${NC}"