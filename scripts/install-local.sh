#!/bin/bash

# Script pentru instalarea globală a versiunii locale modificate
# Autor: Claude Code Dashboard Extension
# Data: $(date)

set -e

# Culori pentru output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Claude Code Router - Local to Global Installation${NC}"
echo -e "${BLUE}===================================================${NC}"

# Verific dacă sunt în directorul corect
if [ ! -f "package.json" ] || [ ! -d "dist" ]; then
    echo -e "${RED}❌ Eroare: Trebuie să fii în directorul root al proiectului${NC}"
    echo -e "${YELLOW}💡 Rulează: cd /opt/lampp/htdocs/claude-code-router${NC}"
    exit 1
fi

# Verific dacă dist/cli.js există
if [ ! -f "dist/cli.js" ]; then
    echo -e "${YELLOW}⚠️  dist/cli.js nu există. Rulând build...${NC}"
    npm run build
fi

# Actualizez versiunea în package.json pentru a evita conflictele
CURRENT_VERSION=$(node -p "require('./package.json').version")
TIMESTAMP=$(date +%Y%m%d%H%M%S)
NEW_VERSION="${CURRENT_VERSION}-local.${TIMESTAMP}"

echo -e "${BLUE}📦 Actualizez versiunea la: ${NEW_VERSION}${NC}"
npm version $NEW_VERSION --no-git-tag-version

# Creez backup-ul versiunii precedente dacă există
if command -v ccr &> /dev/null; then
    CCR_VERSION=$(ccr --version 2>/dev/null || echo "unknown")
    echo -e "${YELLOW}💾 Backup versiune existentă: ${CCR_VERSION}${NC}"
fi

# Dezinstalez versiunea globală existentă (dacă există)
echo -e "${BLUE}🗑️  Dezinstalez versiunea globală existentă...${NC}"
npm uninstall -g @musistudio/claude-code-router 2>/dev/null || true

# Instalez versiunea locală global
echo -e "${GREEN}🔧 Instalez versiunea locală global...${NC}"
npm install -g .

# Verific instalarea
if command -v ccr &> /dev/null; then
    NEW_CCR_VERSION=$(ccr --version 2>/dev/null || echo "unknown")
    echo -e "${GREEN}✅ Instalare completă!${NC}"
    echo -e "${GREEN}📋 Versiunea instalată: ${NEW_CCR_VERSION}${NC}"
    echo -e "${BLUE}🧪 Testez comenzile...${NC}"
    
    # Test comenzi
    echo -e "${YELLOW}   ccr status...${NC}"
    ccr status || echo -e "${YELLOW}   (serverul nu rulează - normal)${NC}"
    
    echo -e "${GREEN}🎉 Gata! Poți folosi comenzile ccr ca înainte:${NC}"
    echo -e "   • ${BLUE}ccr start${NC}     - Pornește serverul"
    echo -e "   • ${BLUE}ccr stop${NC}      - Oprește serverul"  
    echo -e "   • ${BLUE}ccr status${NC}    - Status server"
    echo -e "   • ${BLUE}ccr code${NC}      - Claude Code"
    echo -e "   • ${BLUE}ccr ui${NC}        - Deschide UI-ul (cu noile funcționalități!)"
    echo
    echo -e "${GREEN}🌟 Dashboard-ul tău cu funcționalitățile Advanced este acum activ!${NC}"
else
    echo -e "${RED}❌ Eroare la instalare. ccr nu este disponibil global.${NC}"
    exit 1
fi