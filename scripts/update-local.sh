#!/bin/bash

# Script pentru actualizarea rapidă a versiunii globale cu modificările locale
# Autor: Claude Code Dashboard Extension

set -e

# Culori pentru output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔄 Claude Code Router - Local Update${NC}"
echo -e "${BLUE}=================================${NC}"

# Verific dacă sunt în directorul corect
if [ ! -f "package.json" ] || [ ! -d "dist" ]; then
    echo -e "${RED}❌ Eroare: Trebuie să fii în directorul root al proiectului${NC}"
    exit 1
fi

# Opresc serverul dacă rulează
echo -e "${YELLOW}⏸️  Opresc serverul dacă rulează...${NC}"
ccr stop 2>/dev/null || true

# Build nou
echo -e "${BLUE}🔨 Building versiunea actualizată...${NC}"
npm run build

# Actualizez versiunea
CURRENT_VERSION=$(node -p "require('./package.json').version" | sed 's/-local\.[0-9]*$//')
TIMESTAMP=$(date +%Y%m%d%H%M%S)
NEW_VERSION="${CURRENT_VERSION}-local.${TIMESTAMP}"

echo -e "${BLUE}📦 Versiune nouă: ${NEW_VERSION}${NC}"
npm version $NEW_VERSION --no-git-tag-version

# Reinstallez global
echo -e "${GREEN}🚀 Actualizez instalarea globală...${NC}"
npm uninstall -g @musistudio/claude-code-router 2>/dev/null || true
npm install -g .

# Verific actualizarea
if command -v ccr &> /dev/null; then
    NEW_CCR_VERSION=$(ccr --version 2>/dev/null || echo "unknown")
    echo -e "${GREEN}✅ Actualizare completă!${NC}"
    echo -e "${GREEN}📋 Versiunea actualizată: ${NEW_CCR_VERSION}${NC}"
    echo -e "${GREEN}🎉 Modificările tale sunt acum active global!${NC}"
    echo
    echo -e "${BLUE}💡 Pentru a testa:${NC}"
    echo -e "   • ${BLUE}ccr start${NC} - pornește serverul"
    echo -e "   • ${BLUE}ccr ui${NC} - vezi dashboard-ul actualizat"
else
    echo -e "${RED}❌ Eroare la actualizare.${NC}"
    exit 1
fi