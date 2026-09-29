#!/bin/bash

# Proje ana dizinine git
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

# macOS PATH ayarlarını yükle
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

# Renk tanımları
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m' # No Color

clear
echo -e "${GREEN}${BOLD}==============================================================${NC}"
echo -e "${GREEN}${BOLD}  🌲 ORMAN YANGINLARI - YEREL GELİŞTİRME ORTAMI BAŞLATILIYOR  ${NC}"
echo -e "${GREEN}${BOLD}==============================================================${NC}"
echo ""

# 1. Eski çalışan portları temizle (Port 8000 ve Port 3000)
echo -e "${CYAN}🔍 Eski port kontrolleri yapılıyor...${NC}"
lsof -ti:8000 | xargs kill -9 2>/dev/null
lsof -ti:3000 | xargs kill -9 2>/dev/null
sleep 1

# Çıkışta tüm alt servisleri temizleme tuzağı (Trap)
cleanup() {
    echo ""
    echo -e "${RED}${BOLD}🛑 Servisler durduruluyor...${NC}"
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
    lsof -ti:8000 | xargs kill -9 2>/dev/null
    lsof -ti:3000 | xargs kill -9 2>/dev/null
    echo -e "${GREEN}✓ Tüm yerel servisler başarıyla kapatıldı.${NC}"
    exit 0
}
trap cleanup SIGINT SIGTERM EXIT

# 2. Backend (FastAPI) Başlatılıyor
echo -e "${YELLOW}⚙️  Backend (FastAPI) Port 8000 üzerinde başlatılıyor...${NC}"
(cd backend && ./venv/bin/python3 -m uvicorn main:app --reload --port 8000) &
BACKEND_PID=$!

# 3. Frontend (Next.js) Başlatılıyor
echo -e "${YELLOW}🌐 Frontend (Next.js) Port 3000 üzerinde başlatılıyor...${NC}"
(cd frontend && npm run dev) &
FRONTEND_PID=$!

# 4. Tarayıcıyı Aç
echo ""
echo -e "${CYAN}⏳ Servislerin ayağa kalkması bekleniyor (3 sn)...${NC}"
sleep 3

echo -e "${GREEN}${BOLD}🚀 Tarayıcıda http://localhost:3000 açılıyor...${NC}"
open "http://localhost:3000"

echo ""
echo -e "${GREEN}==============================================================${NC}"
echo -e "${BOLD}✓ Geliştirme ortamı hazır!${NC}"
echo -e "  • Web Arayüzü: ${CYAN}http://localhost:3000${NC}"
echo -e "  • API Dokümanı: ${CYAN}http://localhost:8000/docs${NC}"
echo -e "${YELLOW}Servisleri kapatmak için bu pencerede ${BOLD}CTRL + C${NC}${YELLOW} tuşlarına basabilir${NC}"
echo -e "${YELLOW}veya pencereyi kapatabilirsiniz.${NC}"
echo -e "${GREEN}==============================================================${NC}"
echo ""

# Logları canlı izlemek için bekle
wait
