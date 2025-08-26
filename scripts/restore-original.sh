#!/bin/bash

# Script pentru restaurarea versiunii originale din npm
# Autor: Claude Code Dashboard Extension

set -e

# Culori pentru output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔄 Claude Code Router - Restore Original${NC}"
echo -e "${BLUE}=======================================${NC}"

# Opresc serverul dacă rulează
echo -e "${YELLOW}⏸️  Opresc serverul dacă rulează...${NC}"
ccr stop 2>/dev/null || true

# Dezinstalez versiunea locală
echo -e "${BLUE}🗑️  Dezinstalez versiunea locală...${NC}"
npm uninstall -g @musistudio/claude-code-router 2>/dev/null || true

# Instalez versiunea originală din npm
echo -e "${GREEN}📦 Instalez versiunea originală din npm...${NC}"
npm install -g @musistudio/claude-code-router

# Verific restaurarea
if command -v ccr &> /dev/null; then
    ORIGINAL_VERSION=$(ccr --version 2>/dev/null || echo "unknown")
    echo -e "${GREEN}✅ Restaurare completă!${NC}"
    echo -e "${GREEN}📋 Versiunea restaurată: ${ORIGINAL_VERSION}${NC}"
    echo -e "${YELLOW}⚠️  Ai acum versiunea originală fără modificările tale.${NC}"
    echo
    echo -e "${BLUE}💡 Pentru a reveni la versiunea ta modificată:${NC}"
    echo -e "   ${BLUE}./scripts/install-local.sh${NC}"
else
    echo -e "${RED}❌ Eroare la restaurare.${NC}"
    exit 1
fi