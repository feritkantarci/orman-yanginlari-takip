import sys
import os

# Add backend directory to path
backend_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.append(backend_dir)

from database import engine, Base, SessionLocal
import models
from split_multiple_assets import split_asset_ids, main

def demo():
    # Sadece test için veritabanını oluştur (eğer yoksa)
    Base.metadata.create_all(bind=engine)
    
    db = SessionLocal()
    
    print("\n--- 1. DURUM: Veritabanına Çoklu Asset ID'li Kayıt Ekleniyor ---")
    dummy = models.Intervention(
        asset_id="TEST-001, TEST-002, TEST-003",
        description="Bu bir deneme açıklamasıdır. Direk devrildi.",
        category="Acil Müdahale",
        status="PENDING",
        created_by="Ferit",
        quantity=1
    )
    db.add(dummy)
    db.commit()
    
    print("Eklenen orijinal kayıt:")
    print(f"ID: {dummy.id} | Asset ID: {dummy.asset_id} | Açıklama: {dummy.description}")
    
    db.close()
    
    # Gerçek scripti çalıştır
    print("\n--- 2. DURUM: Temizleme Scripti (split_multiple_assets.py) Çalışıyor ---")
    main()
    
    # Sonucu kontrol et
    print("\n--- 3. DURUM: İşlem Sonrası Veritabanındaki Durum ---")
    db = SessionLocal()
    records = db.query(models.Intervention).filter(models.Intervention.created_by == "Ferit").all()
    for r in records:
         print(f"ID: {r.id} | Asset ID: {r.asset_id} | Açıklama: {r.description}")
    
    # Test verilerini temizle
    for r in records:
        db.delete(r)
    db.commit()
    db.close()

if __name__ == '__main__':
    demo()
