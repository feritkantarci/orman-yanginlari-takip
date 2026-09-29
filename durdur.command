#!/bin/bash

# Proje ana dizinine git
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

# Renk tanımları
RED='\033[0;31m'
GREEN='\033[0;32m'
BOLD='\033[1m'
NC='\033[0m'

clear
echo -e "${RED}${BOLD}==============================================================${NC}"
echo -e "${RED}${BOLD}  🛑 ORMAN YANGINLARI - YEREL SERVİSLER DURDURULUYOR          ${NC}"
echo -e "${RED}${BOLD}==============================================================${NC}"
echo ""

# Port 8000 (Backend) ve 3000 (Frontend) işlemlerini sonlandır
lsof -ti:8000 | xargs kill -9 2>/dev/null
lsof -ti:3000 | xargs kill -9 2>/dev/null

echo -e "${GREEN}${BOLD}✓ Port 8000 (Backend) ve Port 3000 (Frontend) başarıyla kapatıldı.${NC}"
echo ""
sleep 1
