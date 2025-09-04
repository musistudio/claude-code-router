#!/bin/bash
# =========================================================================
# CLAUDE CODE ROUTER - ROLLBACK SCRIPT
# Restaurează fișierele din backup în caz de probleme după cleanup
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

echo -e "${RED}${BOLD}==========================================================================${NC}"
echo -e "${RED}${BOLD}CLAUDE CODE ROUTER - EMERGENCY ROLLBACK${NC}"
echo -e "${RED}${BOLD}Restaurează fișierele din backup în caz de probleme după cleanup${NC}"
echo -e "${RED}${BOLD}==========================================================================${NC}"
echo

# Check if backup path is provided
if [[ -z "$1" ]]; then
    echo -e "${RED}❌ Eroare: Specificați path-ul către backup!${NC}"
    echo -e "${YELLOW}Usage: $0 /path/to/backup-YYYYMMDD-HHMMSS${NC}"
    echo
    echo -e "${YELLOW}Available backups:${NC}"
    ls -la "$PROJECT_ROOT" | grep "backup-" || echo "  Nu există backup-uri disponibile."
    exit 1
fi

BACKUP_DIR="$1"

if [[ ! -d "$BACKUP_DIR" ]]; then
    echo -e "${RED}❌ Eroare: Backup directory nu există: $BACKUP_DIR${NC}"
    exit 1
fi

echo -e "${YELLOW}🔄 Starting rollback from: $BACKUP_DIR${NC}"
echo

# STEP 1: Verify backup content
echo -e "${YELLOW}${BOLD}📋 STEP 1: Verify backup content${NC}"

EXPECTED_FILES=(
    "src/utils/request-deduplication.ts"
    "src/utils/ai-request-controller.ts"
    "src/utils/request-queue.ts"
    "src/utils/provider-fallback.ts"
    "src/utils/fetch-interceptor.ts"
    "src/utils/rate-limiter.ts"
    "src/index.ts"
    "src/routes/strategy.ts"
    "src/routes/optimization.ts"
    "src/routes/advanced-system.ts"
    "src/routes/request-optimization.ts"
)

echo "- Checking backup completeness..."
MISSING_FILES=()
for file in "${EXPECTED_FILES[@]}"; do
    if [[ -f "$BACKUP_DIR/$file" ]]; then
        echo -e "  ${GREEN}✓${NC} $file"
    else
        echo -e "  ${RED}✗${NC} $file"
        MISSING_FILES+=("$file")
    fi
done

if [[ ${#MISSING_FILES[@]} -gt 0 ]]; then
    echo -e "${RED}⚠️  WARNING: ${#MISSING_FILES[@]} files missing from backup!${NC}"
    echo -e "${YELLOW}Continue anyway? (y/N): ${NC}"
    read -r response
    if [[ ! "$response" =~ ^[Yy]$ ]]; then
        echo -e "${RED}❌ Rollback aborted by user.${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}✅ Backup is complete${NC}"
fi

# STEP 2: Create safety backup of current state
echo
echo -e "${YELLOW}${BOLD}📋 STEP 2: Create safety backup of current state${NC}"
SAFETY_BACKUP="$PROJECT_ROOT/safety-backup-before-rollback-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$SAFETY_BACKUP"

echo "- Backing up current state..."
for file in "${EXPECTED_FILES[@]}"; do
    if [[ -f "$PROJECT_ROOT/$file" ]]; then
        mkdir -p "$SAFETY_BACKUP/$(dirname "$file")"
        cp "$PROJECT_ROOT/$file" "$SAFETY_BACKUP/$file"
        echo -e "  ${GREEN}✓${NC} $file"
    fi
done

echo -e "${GREEN}✅ Safety backup created: $SAFETY_BACKUP${NC}"

# STEP 3: Restore files from backup
echo
echo -e "${YELLOW}${BOLD}📋 STEP 3: Restore files from backup${NC}"

echo "- Restoring files..."
for file in "${EXPECTED_FILES[@]}"; do
    if [[ -f "$BACKUP_DIR/$file" ]]; then
        mkdir -p "$PROJECT_ROOT/$(dirname "$file")"
        cp "$BACKUP_DIR/$file" "$PROJECT_ROOT/$file"
        echo -e "  ${GREEN}✓${NC} Restored: $file"
    else
        echo -e "  ${YELLOW}⚠${NC} Skipped: $file (not in backup)"
    fi
done

echo -e "${GREEN}✅ Files restored from backup${NC}"

# STEP 4: Test build after restore
echo
echo -e "${YELLOW}${BOLD}📋 STEP 4: Test build after restore${NC}"
cd "$PROJECT_ROOT"

echo "- Testing build..."
if ! npm run build > /dev/null 2>&1; then
    echo -e "${RED}❌ CRITICAL: Build still fails after rollback!${NC}"
    echo -e "${RED}   This indicates a deeper problem in the codebase.${NC}"
    echo -e "${RED}   Check the build errors manually.${NC}"
    npm run build
    exit 1
fi

echo -e "${GREEN}✅ Build test after rollback: PASSED${NC}"

# STEP 5: Git operations
echo
echo -e "${YELLOW}${BOLD}📋 STEP 5: Git operations${NC}"

echo "- Adding restored files to git..."
git add -A

echo "- Creating rollback commit..."
git commit -m "🔄 ROLLBACK: Restore files from backup due to issues

- Restored from backup: $BACKUP_DIR
- Safety backup created: $SAFETY_BACKUP
- All consolidated files restored to working state
- Build tested and working after rollback

This rollback indicates issues with the ExecutionGuard integration
that need to be addressed before attempting cleanup again.

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>"

echo -e "${GREEN}✅ Git rollback commit created${NC}"

# STEP 6: Cleanup recommendations
echo
echo -e "${YELLOW}${BOLD}📋 STEP 6: Post-rollback recommendations${NC}"

echo -e "${YELLOW}📝 Recommended next steps:${NC}"
echo -e "  1. Investigate why cleanup failed"
echo -e "  2. Test ExecutionGuard integration thoroughly"
echo -e "  3. Fix any integration issues"
echo -e "  4. Re-run cleanup when integration is solid"
echo
echo -e "${YELLOW}🗂️  Backup locations:${NC}"
echo -e "  • Original backup: $BACKUP_DIR"
echo -e "  • Safety backup: $SAFETY_BACKUP"
echo -e "  • You can remove these after confirming system stability"

echo -e "${GREEN}✅ Cleanup recommendations provided${NC}"

# FINAL SUMMARY
echo
echo -e "${BLUE}${BOLD}==========================================================================${NC}"
echo -e "${GREEN}${BOLD}🔄 ROLLBACK COMPLETED SUCCESSFULLY!${NC}"
echo -e "${BLUE}${BOLD}==========================================================================${NC}"
echo
echo -e "${BOLD}📊 ROLLBACK SUMMARY:${NC}"
echo -e "  • Files restored: ${#EXPECTED_FILES[@]} files"
echo -e "  • Backup used: $BACKUP_DIR"
echo -e "  • Safety backup: $SAFETY_BACKUP"
echo -e "  • Build test: ${GREEN}✅ PASSED${NC}"
echo -e "  • Git commit: ${GREEN}✅ COMMITTED${NC}"
echo -e "  • Status: ${GREEN}✅ SYSTEM RESTORED${NC}"
echo
echo -e "${YELLOW}⚠️  Remember to investigate the root cause before attempting cleanup again!${NC}"