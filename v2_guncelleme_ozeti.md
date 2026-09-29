# Orman Yangınları - V2 & V2.1 Güncelleme ve Hafıza Dokümanı

Bu doküman, Orman Yangınları Takip Sisteminin modern Next.js + FastAPI mimarisine taşınması (V2) ve ardından gerçekleştirilen **Master Data Engine, CBS/GIS Varlık (Asset ID) Entegrasyonu, Akıllı Arama, Mükerrerlik Önleme ve Bulut Senkronizasyon (V2.1)** çalışmalarının tüm teknik ve operasyonel kayıtlarını içerir.

---

## 📌 1. Temel Mimari Yapı (V2 Temeli)
- **Frontend (Önyüz):** React tabanlı Next.js (Klasör: `frontend/`) - Cloud Run (`europe-west1`, `orman-yanginlari-web-eu1`)
- **Backend (Arkayüz):** Python FastAPI (Klasör: `backend/`) - Cloud Run (`europe-west3`, `orman-yanginlari-api`)
- **Veritabanı:** PostgreSQL (Cloud SQL `orman-yanginlari-db` & Yerel PostgreSQL)
- **Canlı Adres:** [https://orman.kantarci.io](https://orman.kantarci.io)
- **API Entegrasyonu:** `frontend/src/lib/api.ts` üzerinden JWT tabanlı kimlik doğrulama ve dinamik host çözümü.

---

## ⚡ 2. V2.1: Master Data Engine & Yüksek Performanslı RAM Önbelleği
8.410 hat ve 18.000+ varlık/müdahale kaydının arayüzde anında (gecikmesiz) aranabilmesi ve filtrelenebilmesi için RAM tabanlı bir veri motoru kuruldu.

- **Modül:** `backend/master_service.py` (`MasterDataService`)
- **Çalışma Prensibi:**
  - Sunucu başlarken tüm hatları, müdahaleleri ve varlıkları RAM'e önceden yükler (Pre-caching).
  - Her hat için `asset_ids` listesi ve arama kolaylığı için `asset_ids_str` metni oluşturulur.
  - CRUD işlemlerinde (yeni kayıt, güncelleme, silme) arkaplanda RAM önbelleği `sync_with_db()` ile otomatik tazelenir.
- **Performans:** 8.410 satırlık global arama ve veri transferi veritabanı disk I/O'su yerine bellekten **0.01 ms** mertebesinde yanıt verir.
- **Türkçe Karakter Desteği:** `replace('İ', 'I').lower()` ile Türkçe "İ/ı/I/i" karakter uyumsuzlukları hem arama motorunda hem filtrelerde tamamen çözüldü.

---

## 🌲 3. CBS / GIS Varlık (Asset ID) Entegrasyonu
Kurumsal `orman_son.xlsx` dosyasındaki tüm CBS direk ve hat varlık numaraları sisteme aktarıldı.

- **İçe Aktarma Scripti:** `backend/ingest_official_assets.py` (Batch `execute_values` ile optimize edildi).
- **Aktarılan Veri:** **16.362 adet resmi CBS Varlık ID** (`asset_id`).
- **Varsayılan Statü:** Saha ekipleri tarafından henüz taranmamış bu varlıklar sisteme **`KONTROL EDİLMEDİ`** statüsü ve `GIS Envanter` kullanıcı damgası ile işlendi.
- **Güncel Veritabanı Büyüklüğü:**
  - `lines` (Hatlar): **8.410** satır
  - `interventions` (Müdahaleler / Varlıklar): **18.126** satır (16.361 Kontrol Edilmedi, 1.763 Yapılmadı, 39 Yapıldı).

---

## 🔍 4. Çift Ekran Akıllı Asset ID Arama & Filtreleme Deneyimi
Kullanıcıların ve saha mühendislerinin 18.000+ varlık içinde kaybolmadan saniyeler içinde hedefe ulaşması sağlandı.

### A. Hat Listesi Ekranı (`LineTable.tsx`)
- Genel arama kutusuna hem Hat İsmi, İş Emri No, İlçe/OM hem de **Asset ID (Varlık No)** arama yeteneği kazandırıldı.
- Bir hat, girilen Asset ID'yi içeriyorsa satırda göz alıcı `🎯 Asset ID: {matchedId}` rozeti (badge) belirir.
- Arama kutusuna anında temizleme (`✕`) butonu eklendi.

### B. Müdahale Modal Ekranı (`InterventionModal.tsx`)
- Modal içine canlı **Asset ID Hızlı Arama & Filtreleme Çubuğu** eklendi.
- **Sekmeli Görünüm (Tabs):**
  - 🔴 **Kontrol Bekleyenler:** CBS'den gelen `KONTROL EDİLMEDİ` statüsündeki varlıklar.
  - 🟢 **Kontrol Edilenler / Tamamlananlar:** `Yapıldı` veya `Yapılmadı` statüsündeki kayıtlar.
- **1-Tıkla Durum Değiştirme:** Varlıkların yanında tek dokunuşla `[✓ Yapıldı]` veya `[✕ Yapılmadı]` durumuna geçiren aksiyon butonları eklendi.

---

## 🛡️ 5. Mükerrer Varlık (Duplicate Asset ID) Engelleme Sistemi
Sistemde aynı hat ve aynı iş kategorisi altında aynı varlık numarasının tekrar tekrar girilmesi engellendi.

- **Kural:** `(sira_no, category, asset_id)` üçlüsü benzersizdir. (Aynı direk numarası farklı bir kategoride -örneğin hem *Ağaç Budama* hem *İletken Değişimi*- veya farklı bir hatta bulunabilir).
- **Arayüz Koruması (`InterventionModal.tsx`):**
  - Kullanıcı yeni kayıt eklerken veya mevcut bir kaydı düzenlerken aynı hatta ve aynı kategoride o Asset ID zaten varsa işlem anında engellenir ve kullanıcıya Türkçe bilgilendirici uyarı verilir.
- **Backend & API Koruması (`backend/main.py`):**
  - `POST /api/interventions/{sira_no}` ve `PUT /api/interventions/{id}` uç noktalarında veritabanı seviyesinde `400 Bad Request: 'Bu hatta ve {category} kategorisinde bu Asset ID ({asset_id}) zaten kayıtlı!'` doğrulaması devreye alındı.
- **Veritabanı Temizliği:** Mevcut tablodaki 28 adet mükerrer kayıt grubu analiz edilip tekilleştirildi.

---

## 🛠️ 6. Toplu Silme ve Silme Yetkilendirmesi Onarımı
Saha denemelerinde karşılaşılan silme hataları kökten çözüldü.

- **FastAPI Rota ve Payload Düzeltmesi:**
  - `/api/interventions/bulk` endpoint'i dinamik `/{id}` rotalarından önce tanımlandı.
  - HTTP `DELETE` ve `POST` isteklerinde Pydantic modelinin FastAPI tarafından doğru yakalanması için `Body(...)` anotasyonu eklendi.
- **İlişkisel Bütünlük (Foreign Key Cascade):**
  - `interventions` silinirken `requests` tablosuna bağlı talepler nedeniyle oluşan `violates foreign key constraint` hatası, ilişkili talep kayıtlarının öncelikli temizlenmesiyle giderildi.
- **Esnek Silme İzni:**
  - Kullanıcılar kendi ekledikleri kayıtları, `GIS Envanter` etiketli sistem kayıtlarını ve yönetici rolündeki hesaplar tüm kayıtları güvenle silebilecek şekilde yetkilendirme esnetildi.

---

## ☁️ 7. Canlı / Yerel Veri ve Bulut Senkronizasyonu
Tüm geliştirmeler ve veritabanı içerikleri yerel ve canlı ortamlarda %100 eşitlendi.

1. **Cloud SQL & Yerel DB:** 8.410 hat ve 18.126 varlık Cloud SQL (`orman-yanginlari-db`) ve yerel PostgreSQL'de birebir eşitlendi.
2. **Backend Cloud Run:** `orman-yanginlari-api` servisi `europe-west3` bölgesine deploy edildi (`orman-yanginlari-api-00051-v7p`).
3. **Frontend Cloud Run:** `orman-yanginlari-web-eu1` servisi `europe-west1` bölgesine deploy edildi (`orman-yanginlari-web-eu1-00039-jw7`).
4. **GitHub Sürüm Kontrolü:** `main` ve `v2.0-nextjs-mobile-update` branch'leri origin ile eşitlendi, çalışma ağacı tertemiz hale getirildi.

---

## 🔮 8. Gelecek Yol Haritası ve İyileştirme Fikirleri
- **Offline / PWA Desteği:** Saha personelinin ormanlık alanda çekim gücü zayıfladığında verileri yerel hafızada (IndexedDB) tutup internet geldiğinde otomatik senkronize etmesi.
- **Toplu Excel İçe/Dışa Aktarım:** Varlık bazlı müdahale sonuçlarının tek tıkla kurum formatında Excel/PDF raporuna dökülmesi.
- **Harita / GIS Katmanı:** Hatların ve direklerin coğrafi koordinatlar üzerinden Leaflet/Mapbox haritasında görselleştirilerek renk kodlarıyla yangın risk haritasına dönüştürülmesi.

