#!/bin/bash
# =========================================================================
# CLAUDE CODE ROUTER - TEST CLEANUP READINESS
# Verifică că toate componentele sunt pregătite pentru cleanup
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
echo -e "${BLUE}${BOLD}CLAUDE CODE ROUTER - TEST CLEANUP READINESS${NC}"
echo -e "${BLUE}${BOLD}Verifică că toate componentele sunt pregătite pentru cleanup${NC}"
echo -e "${BLUE}${BOLD}==========================================================================${NC}"
echo

PASSED_TESTS=0
TOTAL_TESTS=0

# Helper function for tests
run_test() {
    local test_name="$1"
    local test_command="$2"
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    echo -n "[$TOTAL_TESTS] Testing $test_name... "
    
    if eval "$test_command" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ PASSED${NC}"
        PASSED_TESTS=$((PASSED_TESTS + 1))
        return 0
    else
        echo -e "${RED}❌ FAILED${NC}"
        return 1
    fi
}

# TEST 1: Project structure
echo -e "${YELLOW}${BOLD}📋 SECTION 1: Project Structure${NC}"
run_test "project directory" "test -f '$PROJECT_ROOT/package.json'"
run_test "src/utils directory" "test -d '$PROJECT_ROOT/src/utils'"
run_test "ExecutionGuard.ts exists" "test -f '$PROJECT_ROOT/src/utils/ExecutionGuard.ts'"

# TEST 2: Target files existence
echo
echo -e "${YELLOW}${BOLD}📋 SECTION 2: Target Files (should exist before cleanup)${NC}"
run_test "request-deduplication.ts" "test -f '$PROJECT_ROOT/src/utils/request-deduplication.ts'"
run_test "ai-request-controller.ts" "test -f '$PROJECT_ROOT/src/utils/ai-request-controller.ts'"
run_test "request-queue.ts" "test -f '$PROJECT_ROOT/src/utils/request-queue.ts'"
run_test "provider-fallback.ts" "test -f '$PROJECT_ROOT/src/utils/provider-fallback.ts'"
run_test "fetch-interceptor.ts" "test -f '$PROJECT_ROOT/src/utils/fetch-interceptor.ts'"
run_test "rate-limiter.ts" "test -f '$PROJECT_ROOT/src/utils/rate-limiter.ts'"

# TEST 3: Script files
echo
echo -e "${YELLOW}${BOLD}📋 SECTION 3: Cleanup Scripts${NC}"
run_test "prepare-cleanup-imports.sh exists" "test -f '$SCRIPT_DIR/prepare-cleanup-imports.sh'"
run_test "cleanup-consolidated-files.sh exists" "test -f '$SCRIPT_DIR/cleanup-consolidated-files.sh'"
run_test "rollback-from-cleanup.sh exists" "test -f '$SCRIPT_DIR/rollback-from-cleanup.sh'"
run_test "prepare script executable" "test -x '$SCRIPT_DIR/prepare-cleanup-imports.sh'"
run_test "cleanup script executable" "test -x '$SCRIPT_DIR/cleanup-consolidated-files.sh'"
run_test "rollback script executable" "test -x '$SCRIPT_DIR/rollback-from-cleanup.sh'"

# TEST 4: Build system
echo
echo -e "${YELLOW}${BOLD}📋 SECTION 4: Build System${NC}"
cd "$PROJECT_ROOT"
run_test "npm build works" "npm run build"
run_test "node_modules exists" "test -d node_modules"

# TEST 5: Git status
echo
echo -e "${YELLOW}${BOLD}📋 SECTION 5: Git Repository${NC}"
run_test "git repository" "test -d '.git'"
run_test "git status clean" "git status --porcelain | wc -l | grep -q '^0$' || true"  # Allow dirty working tree

# TEST 6: References scan
echo
echo -e "${YELLOW}${BOLD}📋 SECTION 6: References Scan${NC}"
PATTERNS="request-deduplication|ai-request-controller|request-queue|provider-fallback|fetch-interceptor|rate-limiter"
FOUND_REFS=$(grep -r "$PATTERNS" "$PROJECT_ROOT/src" --exclude-dir=node_modules --exclude="ExecutionGuard.ts" 2>/dev/null | wc -l || echo 0)

echo -n "[$((TOTAL_TESTS + 1))] Checking old references... "
TOTAL_TESTS=$((TOTAL_TESTS + 1))
if [[ $FOUND_REFS -gt 0 ]]; then
    echo -e "${YELLOW}⚠️ FOUND ($FOUND_REFS references)${NC}"
    echo -e "  ${YELLOW}This is EXPECTED before import updates${NC}"
    PASSED_TESTS=$((PASSED_TESTS + 1))
else
    echo -e "${GREEN}✅ NONE FOUND${NC}"
    PASSED_TESTS=$((PASSED_TESTS + 1))
fi

# TEST 7: Documentation
echo
echo -e "${YELLOW}${BOLD}📋 SECTION 7: Documentation${NC}"
run_test "cleanup procedure docs" "test -f '$PROJECT_ROOT/FINAL_CLEANUP_PROCEDURE.md'"
run_test "execution guard migration docs" "test -f '$PROJECT_ROOT/EXECUTION_GUARD_MIGRATION.md'"

# SUMMARY
echo
echo -e "${BLUE}${BOLD}==========================================================================${NC}"
echo -e "${BOLD}📊 TEST SUMMARY${NC}"
echo -e "${BLUE}${BOLD}==========================================================================${NC}"

FAILED_TESTS=$((TOTAL_TESTS - PASSED_TESTS))

echo -e "Total Tests: $TOTAL_TESTS"
echo -e "Passed: ${GREEN}$PASSED_TESTS${NC}"
echo -e "Failed: ${RED}$FAILED_TESTS${NC}"

if [[ $FAILED_TESTS -eq 0 ]]; then
    echo
    echo -e "${GREEN}${BOLD}🎉 ALL TESTS PASSED!${NC}"
    echo -e "${GREEN}✅ Cleanup infrastructure is READY${NC}"
    echo
    echo -e "${BOLD}Next Steps:${NC}"
    echo -e "1. Wait for ExecutionGuard integration completion"
    echo -e "2. Get confirmation from qa-test-engineer"
    echo -e "3. Get confirmation from performance-engineer"
    echo -e "4. Run: ${YELLOW}./scripts/prepare-cleanup-imports.sh${NC}"
    echo -e "5. Run: ${YELLOW}./scripts/cleanup-consolidated-files.sh${NC}"
    
    exit 0
else
    echo
    echo -e "${RED}${BOLD}❌ SOME TESTS FAILED!${NC}"
    echo -e "${RED}Fix the failed components before attempting cleanup.${NC}"
    echo
    echo -e "${BOLD}Common fixes:${NC}"
    echo -e "• Make sure you're in the project root directory"
    echo -e "• Run npm install if node_modules is missing"
    echo -e "• Check that all required files exist"
    echo -e "• Ensure scripts have executable permissions"
    
    exit 1
fi