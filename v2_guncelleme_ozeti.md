# Orman Yangınları - V2 (Next.js & FastAPI) Güncelleme Özeti

Bu dosyada, projenin Streamlit versiyonundan modern bir web altyapısına (Next.js + FastAPI) taşınması ve ardından yapılan mobil uyumluluk ve hata giderme çalışmaları listelenmiştir.

## 1. Mimari Değişiklik
- **Eski Sistem:** Tek parça (monolitik) Streamlit uygulaması.
- **Yeni Sistem:**
  - **Frontend (Önyüz):** React tabanlı Next.js (Klasör: `frontend/`)
  - **Backend (Arkayüz):** Python tabanlı FastAPI (Klasör: `backend/`)
- API ve İstemci arasındaki bağlantıyı sağlayan `lib/api.ts` altyapısı kuruldu.

## 2. Mobil Uyumluluk (Responsive Design)
- Uygulama, cep telefonlarından girildiğinde yapısını bozmayacak şekilde tamamen duyarlı (responsive) hale getirildi.
- **Üst Menü:** Mobilde sol menü gizlendi, yerine yukarıdan açılır bir Hamburger Menü (`☰`) entegre edildi.
- **Tablolar:** Ana tablo (`LineTable.tsx`) dar ekranlarda yatay olarak kaydırılabilir (scrollable) hale getirildi. 
- **Formlar ve Filtreler:** Grid ve Flex yapıları mobil ekranlarda alt alta dizilecek şekilde (`flex-wrap: wrap` ve `@media` sorguları ile) ayarlandı.
- **Açılır Pencereler (Modals):** Mobilde ekranı tam kaplayacak şekilde yeniden boyutlandırıldı.

## 3. Bug (Hata) Çözümleri
- **Login Döngüsü Hatası:** 
  - `fetchAPI` fonsiyonundaki `401 Unauthorized` kontrolünün, giriş yaparken şifre yanlış girildiğinde de tetiklenmesi ve kullanıcıyı sürekli boş giriş ekranına atması sorunu çözüldü.
  - Giriş sayfasında (Login) `fetchAPI` yerine ham (raw) `fetch` kullanılarak kullanıcının hatalı şifre girdiğinde yönlendirilmek yerine "Yanlış Şifre" uyarısını görmesi sağlandı.
- **Mobil Cihaz Otomatik Büyük Harf Sorunu:**
  - Cep telefonlarında kullanıcı adının ilk harfinin otomatik büyük yazılmasını engellemek için input alanına `autoCapitalize="none"` eklendi.
- **IP / API URL Bağlantısı:**
  - Sadece bilgisayardan (localhost) değil, telefon gibi aynı ağdaki farklı cihazlardan da backend'e erişilebilmesi için IP adresini otomatik çözen (`window.location.hostname`) dinamik API URL yapısı kuruldu.

## 4. Excel Veri Eşleştirmesi ve Veritabanı Göçü (Migration)
- Ana sistemin belkemiği olan `lines` (hatlar) tablosundaki veriler, `alikemal_orman.xlsx` dosyasındaki güncel "Sıra No" ve hat sayıları ile senkronize edildi.
- Eşleştirme algoritması `(Operasyon Merkezi, Hat İsmi)` mantığına geçirildi. Artık veritabanı ile Excel arasında oluşabilecek satır/sıra kaymaları sistemi bozmayacak. Eski `sira_no` bağımlılığı ortadan kaldırıldı.

## 5. İhale Keşif İş Zekası ve "Var/Yok" Göstergesi
- Hat listesinde (`LineTable.tsx`) her bir satıra "Ağaç Budama" ve "Koridor Açma" için excel ihale tablosunda "Var mı / Yok mu?" bilgisini getiren **Ok/Nok (Yeşil/Kırmızı)** uyarı sistemi eklendi.
- Böylece ihalede olmayan ancak tabloda yer alan "Kapsam Dışı / İlave" işler rahatlıkla ayırt edilebilir hale geldi.
- Arayüze "Toplu Silme" (Bulk Delete) özelliği ve butonu kazandırıldı. 

## 6. Dinamik Genel Özet (Dashboard) Paneli
- **Widget Altyapısı:** Kullanıcıların dilediği "İlçe" veya "Operasyon Merkezini" ekleyip çıkarabileceği dinamik bir kontrol paneli (Dashboard) oluşturuldu.
- **Kategori Bazlı Matris:** Eklenen her bir tablo, hatların durumunu 5 ana kategoride (`Ağaç Budama`, `Koridor Açma`, `Beton Dökümü`, vb.) listeliyor.
- **Otomatik Matematik:** Sistem her kategori için;
  - **Yapıldı:** İşlem yapılan hat sayısını,
  - **Yapılmadı:** Sorunlu / yapılamadı girilen hat sayısını,
  - **Gerek Yok (Boş):** Kalan (toplam hat - (yapıldı + yapılmadı)) dokunulmamış hat sayısını anında hesaplıyor.
- **Profil Hafızası:** Kullanıcıların eklediği tablolar veritabanında profillerine (`users.dashboard_preferences`) JSON olarak kaydediliyor. Sayfa yenilense de seçilen tablolar ekranda kalmaya devam ediyor.
- **Yönetici Özeti:** İhale kapsamı dışındaki işleri (Km/Adet bazında) özetleyen widget bu sayfanın en tepesine taşındı. Tasarım olarak grid (yan yana) dizilime geçildi ve ekran alanını maksimum kullanan (kompakt/fit) bir CSS mimarisi yazıldı.
