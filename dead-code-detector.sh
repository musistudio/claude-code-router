#!/bin/bash

# 🔍 Dead Code Detector pentru Claude Code Router
# Scriptul analizează automat codul mort și fișierele neutilizate

echo "🔍 DEAD CODE DETECTION - Claude Code Router"
echo "========================================"

PROJECT_ROOT="/opt/lampp/htdocs/claude-code-router"
cd "$PROJECT_ROOT" || exit 1

# Colors pentru output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo ""
echo -e "${BLUE}📁 SECTION 1: Checking backup/ directory usage${NC}"
if [ -d "backup/" ]; then
    echo "📦 backup/ directory exists with $(find backup/ -type f | wc -l) files"
    
    # Check if backup files are imported anywhere
    backup_imports=$(grep -r "backup/" src/ ui/ --include="*.ts" --include="*.tsx" --include="*.js" 2>/dev/null | wc -l)
    if [ "$backup_imports" -eq 0 ]; then
        echo -e "${GREEN}✅ backup/ directory NOT imported anywhere - SAFE TO DELETE${NC}"
        echo "   Size: $(du -sh backup/ | cut -f1)"
    else
        echo -e "${RED}⚠️ backup/ directory HAS imports:${NC}"
        grep -r "backup/" src/ ui/ --include="*.ts" --include="*.tsx" --include="*.js" 2>/dev/null
    fi
else
    echo "✅ No backup/ directory found"
fi

echo ""
echo -e "${BLUE}📄 SECTION 2: Checking scripts/ directory usage${NC}"
if [ -d "scripts/" ]; then
    echo "📜 scripts/ directory exists with $(find scripts/ -name "*.sh" | wc -l) shell scripts"
    
    # Check if scripts are referenced in code
    script_refs=$(grep -r "scripts/" src/ ui/ --include="*.ts" --include="*.tsx" --include="*.js" 2>/dev/null | wc -l)
    if [ "$script_refs" -eq 0 ]; then
        echo -e "${GREEN}✅ scripts/ NOT referenced in source code${NC}"
        echo "   Experimental scripts found:"
        find scripts/ -name "*cleanup*" -o -name "*test*" -o -name "*restore*" -o -name "*rollback*" | sed 's/^/   /'
    else
        echo -e "${YELLOW}⚠️ scripts/ HAS references in code:${NC}"
        grep -r "scripts/" src/ ui/ --include="*.ts" --include="*.tsx" --include="*.js" 2>/dev/null
    fi
fi

echo ""
echo -e "${BLUE}🎯 SECTION 3: Checking potentially unused functions${NC}"

# Check forceFlush usage
echo "🔍 Checking forceFlush() usage:"
forceflush_usage=$(grep -r "forceFlush" src/ ui/ --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v "forceFlush()" | wc -l)
if [ "$forceflush_usage" -eq 0 ]; then
    echo -e "${YELLOW}   ⚠️ forceFlush() defined but not called${NC}"
else
    echo -e "${GREEN}   ✅ forceFlush() is used${NC}"
fi

# Check updateConfig usage
echo "🔍 Checking updateConfig() usage:"
updateconfig_usage=$(grep -r "updateConfig" src/ ui/ --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v "updateConfig(" | wc -l)
if [ "$updateconfig_usage" -eq 0 ]; then
    echo -e "${YELLOW}   ⚠️ updateConfig() defined but not called${NC}"
else
    echo -e "${GREEN}   ✅ updateConfig() is used${NC}"
fi

# Check advanced-system usage
echo "🔍 Checking advanced-system.ts usage:"
if [ -f "src/routes/advanced-system.ts" ]; then
    advsystem_usage=$(grep -r "advanced-system" src/ ui/ --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v "src/routes/advanced-system.ts:" | wc -l)
    if [ "$advsystem_usage" -eq 0 ]; then
        echo -e "${RED}   ❌ advanced-system.ts exists but NOT imported${NC}"
    else
        echo -e "${GREEN}   ✅ advanced-system.ts is imported${NC}"
    fi
else
    echo "   ✅ No advanced-system.ts found"
fi

echo ""
echo -e "${BLUE}📊 SECTION 4: Checking mock/test data usage${NC}"

# Check for hardcoded test data
echo "🔍 Checking for hardcoded test data:"
test_data_files=$(grep -r "test.*data\|mock.*data\|sample.*data" src/ --include="*.ts" | wc -l)
if [ "$test_data_files" -gt 0 ]; then
    echo -e "${YELLOW}   ⚠️ Found $test_data_files potential test/mock data references${NC}"
    grep -r "test.*data\|mock.*data\|sample.*data" src/ --include="*.ts" | head -5 | sed 's/^/   /'
    if [ "$test_data_files" -gt 5 ]; then
        echo "   ... and $((test_data_files - 5)) more"
    fi
else
    echo -e "${GREEN}   ✅ No obvious test/mock data found${NC}"
fi

# Check for console.log debug statements
echo "🔍 Checking for debug console.log statements:"
debug_logs=$(grep -r "console\.log.*debug\|console\.log.*DEBUG\|console\.log.*test" src/ --include="*.ts" | wc -l)
if [ "$debug_logs" -gt 0 ]; then
    echo -e "${YELLOW}   ⚠️ Found $debug_logs debug console.log statements${NC}"
    echo "   Consider removing these for production"
else
    echo -e "${GREEN}   ✅ No debug console.log found${NC}"
fi

echo ""
echo -e "${BLUE}📁 SECTION 5: Checking temporary/accidental files${NC}"

# Check for common accidental files
accidental_files=()
[ -f "ls" ] && accidental_files+=("ls")
[ -f "pr_body.md" ] && accidental_files+=("pr_body.md")
[ -f "backup-config.sh" ] && accidental_files+=("backup-config.sh")

if [ ${#accidental_files[@]} -gt 0 ]; then
    echo -e "${YELLOW}   ⚠️ Found potential temporary files:${NC}"
    for file in "${accidental_files[@]}"; do
        echo "   - $file"
    done
else
    echo -e "${GREEN}   ✅ No obvious temporary files found${NC}"
fi

echo ""
echo -e "${BLUE}📈 SECTION 6: Size analysis${NC}"

# Calculate sizes
if [ -d "backup/" ]; then
    backup_size=$(du -sh backup/ | cut -f1)
    echo "📦 backup/ directory size: $backup_size"
fi

scripts_size=$(du -sh scripts/ 2>/dev/null | cut -f1)
echo "📜 scripts/ directory size: $scripts_size"

total_size=$(du -sh . | cut -f1)
echo "📊 Total project size: $total_size"

echo ""
echo -e "${BLUE}🎯 SUMMARY & RECOMMENDATIONS${NC}"
echo "================================"

# Generate recommendations
recommendations=()

if [ -d "backup/" ] && [ "$(grep -r "backup/" src/ ui/ --include="*.ts" --include="*.tsx" --include="*.js" 2>/dev/null | wc -l)" -eq 0 ]; then
    recommendations+=("🗑️  DELETE backup/ directory ($backup_size)")
fi

if [ -f "scripts/cleanup-consolidated-files.sh" ] || [ -f "scripts/prepare-cleanup-imports.sh" ]; then
    recommendations+=("🗑️  DELETE experimental cleanup scripts")
fi

if [ "$updateconfig_usage" -eq 0 ]; then
    recommendations+=("🔧 REVIEW updateConfig() function - possibly unused")
fi

if [ "$forceflush_usage" -eq 0 ]; then
    recommendations+=("🔧 REVIEW forceFlush() function - possibly unused")
fi

if [ -f "src/routes/advanced-system.ts" ] && [ "$(grep -r "advanced-system" src/ ui/ --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v "src/routes/advanced-system.ts:" | wc -l)" -eq 0 ]; then
    recommendations+=("🗑️  DELETE src/routes/advanced-system.ts - not imported")
fi

if [ ${#accidental_files[@]} -gt 0 ]; then
    recommendations+=("🗑️  DELETE temporary files: ${accidental_files[*]}")
fi

if [ ${#recommendations[@]} -gt 0 ]; then
    echo -e "${YELLOW}📋 RECOMMENDED ACTIONS:${NC}"
    for rec in "${recommendations[@]}"; do
        echo "   $rec"
    done
    
    echo ""
    echo -e "${GREEN}💡 SAFE CLEANUP COMMANDS:${NC}"
    echo "   # Create backup first:"
    echo "   mkdir cleanup-backup-\$(date +%Y%m%d)"
    echo "   cp -r src/ cleanup-backup-\$(date +%Y%m%d)/"
    echo ""
    echo "   # Then run safe deletions:"
    if [ -d "backup/" ]; then
        echo "   rm -rf backup/"
    fi
    if [ ${#accidental_files[@]} -gt 0 ]; then
        for file in "${accidental_files[@]}"; do
            echo "   rm $file"
        done
    fi
    echo ""
    echo "   # Test build after cleanup:"
    echo "   npm run build"
    
else
    echo -e "${GREEN}🎉 GREAT! No obvious dead code detected.${NC}"
    echo "   Your codebase looks clean!"
fi

echo ""
echo -e "${BLUE}📊 ANALYSIS COMPLETE${NC}"
echo "View detailed analysis in: DEAD-CODE-ANALYSIS.md"
