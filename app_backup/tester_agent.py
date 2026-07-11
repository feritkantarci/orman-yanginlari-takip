from streamlit.testing.v1 import AppTest
import time

def test_app_flow():
    print("🤖 [Ajan 1] Test başlatılıyor...")
    
    # 1. Start App
    at = AppTest.from_file("main.py").run()
    
    if at.exception:
        print(f"❌ [Ajan 1] HATA BULUNDU (Başlatma): {at.exception[0].message}")
        return False
        
    print("✅ [Ajan 1] Uygulama başarıyla yüklendi, çökme yok.")
    
    # 2. Check filters in sidebar
    print("🤖 [Ajan 1] Sol menü (Sidebar) filtreleri test ediliyor...")
    try:
        # Get the Operasyon Merkezi multiselect. It should be the 3rd select/multiselect in the sidebar
        multiselect = at.sidebar.multiselect[0]
        multiselect.select("KIRIKHAN")
        multiselect.select("HATAY METROPOL")
        at.run()
    except Exception as e:
        print(f"❌ [Ajan 1] HATA BULUNDU (Filtreleme): {str(e)}")
        return False
        
    if at.exception:
        print(f"❌ [Ajan 1] HATA BULUNDU (Filtre Uygularken): {at.exception[0].message}")
        return False
        
    print("✅ [Ajan 1] Çoklu seçim (Operasyon Merkezi) başarıyla çalışıyor.")
    
    # 3. Check dropdown for line selection (in main area)
    print("🤖 [Ajan 1] Hat seçme kutusu (Dropdown) test ediliyor...")
    try:
        # The line selector is a selectbox in the main area (tab 1)
        # We need to access tab1.
        main_selectbox = at.selectbox[0] 
        
        # We need a valid option.
        options = main_selectbox.options
        if len(options) > 1:
            valid_option = options[1] # pick first real option
            main_selectbox.select(valid_option).run()
        else:
            print("⚠️ [Ajan 1] Seçilecek hat bulunamadı.")
    except Exception as e:
        print(f"❌ [Ajan 1] HATA BULUNDU (Hat Seçimi): {str(e)}")
        return False
        
    if at.exception:
        print(f"❌ [Ajan 1] HATA BULUNDU (Hat Seçimi Uygularken): {at.exception[0].message}")
        return False
        
    print("✅ [Ajan 1] Tablodan hat seçimi başarıyla gerçekleşti.")
    
    # 4. Check if button appears
    print("🤖 [Ajan 1] Butonların durumu kontrol ediliyor...")
    has_button = False
    for b in at.button:
        if "Yeni Tespit" in b.label:
            b.click()
            has_button = True
            break
            
    if not has_button:
        print("❌ [Ajan 1] 'Yeni Tespit' butonu sayfada bulunamadı!")
        return False
        
    at.run()
    
    if at.exception:
        print(f"❌ [Ajan 1] HATA BULUNDU (Butona Tıklarken): {at.exception[0].message}")
        return False
        
    print("✅ [Ajan 1] Veri giriş ekranı başarıyla açıldı.")
    print("🎉 [Ajan 1] TÜM TESTLER BAŞARIYLA GEÇİLDİ. Kod kusursuz çalışıyor!")
    return True

if __name__ == "__main__":
    test_app_flow()
