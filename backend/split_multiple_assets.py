import sys
import os
import re

# Add backend directory to path so we can import database and models
backend_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.append(backend_dir)

from database import SessionLocal
import models
from sqlalchemy.inspection import inspect

def split_asset_ids(asset_id_str):
    if not asset_id_str:
        return []
    # Split by common delimiters: comma, semicolon, slash, plus, ampersand, dash, dot, newline, and words ve/ile/to/and
    tokens = re.split(r'[,;\/\+\&\-\.]|\b(?:ve|ile|to|and)\b', asset_id_str, flags=re.IGNORECASE)
    
    cleaned = []
    for t in tokens:
        t_clean = t.strip()
        if t_clean:
            cleaned.append(t_clean)
            
    # If split resulted in only 1 item, check if it's separated by spaces
    if len(cleaned) == 1:
        space_tokens = cleaned[0].split()
        if len(space_tokens) > 1:
            # If all parts look like numbers or codes (contains digits), split them
            is_all_code = all(any(c.isdigit() for c in tk) for tk in space_tokens)
            if is_all_code:
                cleaned = space_tokens
                
    return cleaned

def main():
    db = SessionLocal()
    try:
        # Fetch all interventions
        interventions = db.query(models.Intervention).all()
        
        updated_count = 0
        created_count = 0
        total_processed = 0
        
        print("\n--- Çoklu Asset ID Temizleme Başlatılıyor (SQLAlchemy) ---")
        
        # Get column names/attributes of Intervention model
        mapper = inspect(models.Intervention)
        columns = [column.key for column in mapper.attrs if hasattr(column, 'columns')]
        
        for intv in interventions:
            asset_id = str(intv.asset_id or '')
            split_ids = split_asset_ids(asset_id)
            
            if len(split_ids) > 1:
                total_processed += 1
                print(f"\n[ID: {intv.id}] Çoklu Asset ID tespit edildi: '{asset_id}' -> {split_ids}")
                
                # 1. Update the original row to the first asset ID
                first_id = split_ids[0]
                intv.asset_id = first_id
                updated_count += 1
                print(f"  -> Orijinal satır güncellendi: Asset ID = '{first_id}'")
                
                # 2. Insert new rows for remaining asset IDs
                for new_asset_id in split_ids[1:]:
                    # Create a new cloned Intervention
                    new_intv = models.Intervention()
                    for col in columns:
                        if col == 'id':
                            continue
                        elif col == 'asset_id':
                            setattr(new_intv, col, new_asset_id)
                        else:
                            setattr(new_intv, col, getattr(intv, col))
                    
                    db.add(new_intv)
                    created_count += 1
                    print(f"  -> Yeni satır eklendi: Asset ID = '{new_asset_id}'")
        
        if total_processed > 0:
            db.commit()
            print("\n--- İşlem Tamamlandı ve Kaydedildi ---")
            print(f"Bölünen Satır Sayısı: {total_processed}")
            print(f"Güncellenen Orijinal Satır: {updated_count}")
            print(f"Yeni Oluşturulan Satır: {created_count}")
        else:
            print("\nÇoklu Asset ID içeren satır bulunamadı. Değişiklik yapılmadı.")
            
    except Exception as e:
        db.rollback()
        print(f"HATA: İşlem sırasında bir sorun oluştu ve geri alındı (rollback): {e}")
    finally:
        db.close()

if __name__ == '__main__':
    main()
