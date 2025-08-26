#!/bin/bash
# =========================================================================
# CLAUDE CODE ROUTER - FINAL CLEANUP SCRIPT
# Șterge fișierele consolidate în ExecutionGuard după testarea completă
# =========================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_DIR="$PROJECT_ROOT/backup-$(date +%Y%m%d-%H%M%S)"

# Colors pentru output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

echo -e "${BLUE}${BOLD}==========================================================================${NC}"
echo -e "${BLUE}${BOLD}CLAUDE CODE ROUTER - FINAL CLEANUP SCRIPT${NC}"
echo -e "${BLUE}${BOLD}Șterge fișierele consolidate în ExecutionGuard după testarea completă${NC}"
echo -e "${BLUE}${BOLD}==========================================================================${NC}"
echo

# STEP 1: Verificări preliminarii
echo -e "${YELLOW}${BOLD}📋 STEP 1: Verificări preliminarii${NC}"
echo "- Verificare că suntem în directorul corect..."
if [[ ! -f "$PROJECT_ROOT/package.json" ]] || [[ ! -d "$PROJECT_ROOT/src/utils" ]]; then
    echo -e "${RED}❌ Eroare: Nu sunt în directorul proiectului Claude Code Router!${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Directory check: OK${NC}"

echo "- Verificare că ExecutionGuard.ts există..."
if [[ ! -f "$PROJECT_ROOT/src/utils/ExecutionGuard.ts" ]]; then
    echo -e "${RED}❌ Eroare: ExecutionGuard.ts nu există! Integrarea nu este completă.${NC}"
    exit 1
fi
echo -e "${GREEN}✅ ExecutionGuard.ts: EXISTS${NC}"

# STEP 2: Test build pentru a confirma stabilitatea
echo
echo -e "${YELLOW}${BOLD}📋 STEP 2: Test Build pentru stabilitate${NC}"
cd "$PROJECT_ROOT"
echo "- Rulare npm run build..."
if ! npm run build > /dev/null 2>&1; then
    echo -e "${RED}❌ Eroare: Build FAIL! Nu pot continua cleanup-ul.${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Build test: PASSED${NC}"

# STEP 3: Crearea backup-ului complet
echo
echo -e "${YELLOW}${BOLD}📋 STEP 3: Crearea backup-ului complet${NC}"
mkdir -p "$BACKUP_DIR"
echo "- Backup directory created: $BACKUP_DIR"

# Lista fișierelor pentru backup
FILES_TO_BACKUP=(
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
    "src/index_backup.ts"
    "test-optimization.sh"
)

echo "- Backup fișiere în progres..."
for file in "${FILES_TO_BACKUP[@]}"; do
    if [[ -f "$PROJECT_ROOT/$file" ]]; then
        mkdir -p "$BACKUP_DIR/$(dirname "$file")"
        cp "$PROJECT_ROOT/$file" "$BACKUP_DIR/$file"
        echo -e "  ${GREEN}✓${NC} $file"
    else
        echo -e "  ${YELLOW}⚠${NC} $file (not found, skipping)"
    fi
done

echo -e "${GREEN}✅ Backup complet creat în: $BACKUP_DIR${NC}"

# STEP 4: Final scan pentru referințe rămase
echo
echo -e "${YELLOW}${BOLD}📋 STEP 4: Scan final pentru referințe rămase${NC}"
echo "- Căutare referințe la fișierele vechi..."

PATTERNS="request-deduplication|ai-request-controller|request-queue|provider-fallback|fetch-interceptor|rate-limiter"
FOUND_REFERENCES=$(grep -r "$PATTERNS" "$PROJECT_ROOT/src" --exclude-dir=node_modules --exclude="ExecutionGuard.ts" 2>/dev/null | wc -l)

if [[ $FOUND_REFERENCES -gt 0 ]]; then
    echo -e "${YELLOW}⚠️ Găsite $FOUND_REFERENCES referințe către fișierele vechi:${NC}"
    grep -r "$PATTERNS" "$PROJECT_ROOT/src" --exclude-dir=node_modules --exclude="ExecutionGuard.ts" 2>/dev/null | head -10
    echo
    echo -e "${RED}❌ ATENȚIE: Există încă referințe către fișierele vechi!${NC}"
    echo -e "${RED}   Cleanup-ul va fi OPRIT pentru siguranță.${NC}"
    echo -e "${RED}   Actualizați mai întâi toate import-urile.${NC}"
    exit 1
else
    echo -e "${GREEN}✅ Nu s-au găsit referințe rămase${NC}"
fi

# STEP 5: Ștergerea fișierelor consolidate
echo
echo -e "${YELLOW}${BOLD}📋 STEP 5: Ștergerea fișierelor consolidate${NC}"

FILES_TO_DELETE=(
    "src/utils/request-deduplication.ts"
    "src/utils/ai-request-controller.ts"
    "src/utils/request-queue.ts"
    "src/utils/provider-fallback.ts"
    "src/utils/fetch-interceptor.ts"
    "src/utils/rate-limiter.ts"
)

echo "- Ștergere fișiere în progres..."
for file in "${FILES_TO_DELETE[@]}"; do
    if [[ -f "$PROJECT_ROOT/$file" ]]; then
        rm "$PROJECT_ROOT/$file"
        echo -e "  ${GREEN}✓${NC} Șters: $file"
    else
        echo -e "  ${YELLOW}⚠${NC} Nu există: $file (skipping)"
    fi
done

echo -e "${GREEN}✅ Fișiere consolidate șterse cu succes${NC}"

# STEP 6: Final build test
echo
echo -e "${YELLOW}${BOLD}📋 STEP 6: Test build final${NC}"
echo "- Testare că aplicația se compilează după cleanup..."
if ! npm run build > /dev/null 2>&1; then
    echo -e "${RED}❌ EROARE CRITICĂ: Build FAIL după cleanup!${NC}"
    echo -e "${RED}   Restaurare automată din backup în curs...${NC}"
    
    # Restaurare din backup
    for file in "${FILES_TO_DELETE[@]}"; do
        if [[ -f "$BACKUP_DIR/$file" ]]; then
            cp "$BACKUP_DIR/$file" "$PROJECT_ROOT/$file"
            echo -e "  ${GREEN}✓${NC} Restored: $file"
        fi
    done
    
    echo -e "${RED}❌ Fișierele au fost restaurate. Verificați integrarea ExecutionGuard!${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Final build test: PASSED${NC}"

# STEP 7: Git operations
echo
echo -e "${YELLOW}${BOLD}📋 STEP 7: Git operations${NC}"
echo "- Git add pentru fișierele șterse..."
git add -A

echo "- Git commit cu cleanup message..."
git commit -m "🧹 Final cleanup: Remove consolidated files (ExecutionGuard integration complete)

- Removed 6 consolidated files from src/utils/:
  * request-deduplication.ts → ExecutionGuard
  * ai-request-controller.ts → ExecutionGuard  
  * request-queue.ts → ExecutionGuard
  * provider-fallback.ts → ExecutionGuard
  * fetch-interceptor.ts → ExecutionGuard
  * rate-limiter.ts → ExecutionGuard

- All functionality consolidated in ExecutionGuard.ts
- Build tested and working
- Backup created: $BACKUP_DIR

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>"

echo -e "${GREEN}✅ Git commit realizat cu succes${NC}"

# STEP 8: Documentation cleanup
echo
echo -e "${YELLOW}${BOLD}📋 STEP 8: Documentation cleanup${NC}"

# Update .gitignore pentru cleanup files
echo "- Update .gitignore..."
if ! grep -q "backup-*" "$PROJECT_ROOT/.gitignore" 2>/dev/null; then
    echo -e "\n# Cleanup backups\nbackup-*/" >> "$PROJECT_ROOT/.gitignore"
    echo -e "${GREEN}✓${NC} Added backup-* to .gitignore"
fi

echo -e "${GREEN}✅ Documentation cleanup complet${NC}"

# FINAL SUMMARY
echo
echo -e "${BLUE}${BOLD}==========================================================================${NC}"
echo -e "${GREEN}${BOLD}🎉 CLEANUP FINALIZAT CU SUCCES!${NC}"
echo -e "${BLUE}${BOLD}==========================================================================${NC}"
echo
echo -e "${BOLD}📊 SUMMARY:${NC}"
echo -e "  • Fișiere șterse: ${#FILES_TO_DELETE[@]} files"
echo -e "  • Backup creat în: $BACKUP_DIR"
echo -e "  • Build test: ${GREEN}✅ PASSED${NC}"
echo -e "  • Git commit: ${GREEN}✅ COMMITTED${NC}"
echo -e "  • Status: ${GREEN}✅ ALL SYSTEMS OPERATIONAL${NC}"
echo
echo -e "${YELLOW}📝 Next Steps:${NC}"
echo -e "  1. Test toate funcționalitățile aplicației"
echo -e "  2. Șterge backup-ul după confirmarea că totul merge: rm -rf $BACKUP_DIR"
echo -e "  3. Update CLAUDE.md și documentația dacă este necesar"
echo
echo -e "${GREEN}🚀 Applicația este gata cu ExecutionGuard integration!${NC}"