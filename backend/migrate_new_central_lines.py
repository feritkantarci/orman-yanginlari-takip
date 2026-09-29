import os
import sqlite3
import pandas as pd
import openpyxl
import re
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import models
from database import engine, SessionLocal

def normalize_key(s):
    if pd.isna(s): return ''
    s = str(s).strip().upper()
    s = s.replace('İ', 'I').replace('Ş', 'S').replace('Ğ', 'G').replace('Ü', 'U').replace('Ö', 'O').replace('Ç', 'C')
    m = re.match(r'^([A-Z0-9]+)', s)
    if m:
        return m.group(1)
    return s.split('-')[0].strip()

def run_migration():
    print("=== Orman Yangınları: Yeni Hat İsimleri ve 726 Yeni Hat Migration'ı ===")
    
    base_dir = os.path.dirname(os.path.abspath(__file__))
    comparison_excel = os.path.join(os.path.dirname(base_dir), 'HAT_KARSILASTIRMA_VE_DEGERLENDIRME.xlsx')
    
    if not os.path.exists(comparison_excel):
        print(f"Error: Comparison Excel not found at {comparison_excel}")
        return

    print(f"Loading comparison data from: {comparison_excel}")
    df_comp = pd.read_excel(comparison_excel, sheet_name='TÜM KARŞILAŞTIRMA')
    print(f"Total rows in comparison file: {len(df_comp)}")

    # Also load old Toroslar Excel to get original attributes for existing lines if needed
    old_excel = os.path.join(base_dir, 'Kopya Ormanlık Alan Bakım Takip - Toroslar.xlsx')
    df_old = pd.read_excel(old_excel, header=2)
    
    old_details_map = {}
    for _, row in df_old.iterrows():
        name = str(row['Hat İsmi']).strip() if pd.notna(row['Hat İsmi']) else ''
        code = normalize_key(name)
        if code and code not in old_details_map:
            old_details_map[code] = {
                'sira_no': row.get('Sıra No'),
                'dagitim_sirketi': str(row.get('Dağıtım Şirketi', 'TOROSLAR')).strip(),
                'il': str(row.get('İl', 'HATAY')).strip(),
                'ilce': str(row.get('İlçe', '')).strip(),
                'operasyon_merkezi': str(row.get('Operasyon Merkezi', '')).strip().upper(),
                'gerilim_seviyesi': str(row.get('Gerilim Seviyesi\n(AG/OG)', 'AG')).strip(),
                'hat_uzunlugu': float(row.get('Hat Uzunluğu\n(Km)', 0) or 0),
                'mevcut_risk': str(row.get('Mevcut Risk\n(1./2./3. Derece Riskli)', '1. Derece')).strip(),
                'planlanan_bakim': row.get('Planlanan Bakım Tarihi'),
                'gerceklesen_bakim': row.get('Gerçekleşen Bakım Tarihi'),
                'siparis_no': str(row.get('SİPARİŞ NUMARASI', '')).strip() if pd.notna(row.get('SİPARİŞ NUMARASI')) else ''
            }

    db = SessionLocal()
    try:
        # 1. Existing lines in database
        existing_db_lines = db.query(models.Line).all()
        existing_sira_nos = {l.sira_no for l in existing_db_lines if l.sira_no}
        max_sira_no = max(existing_sira_nos) if existing_sira_nos else 10000

        print(f"Mevcut veritabanındaki hat sayısı: {len(existing_db_lines)}, Max Sıra No: {max_sira_no}")

        # Map existing db lines by normalized code
        db_lines_by_code = {}
        for l in existing_db_lines:
            c = normalize_key(l.hat_ismi)
            if c:
                db_lines_by_code[c] = l

        # Process all rows from comparison excel
        updated_count = 0
        inserted_count = 0

        # We will keep track of processed codes to avoid duplicates
        processed_codes = set()
        next_new_sira_no = max(max_sira_no + 1, 20001)

        for _, r in df_comp.iterrows():
            new_feeder = str(r['Yeni Tablodaki Hat İsmi / Kodu']).strip()
            norm_code = normalize_key(new_feeder)
            om = str(r['Operasyon Merkezi']).strip().upper()
            sinif = str(r.get('Gerilim / Hat Sınıfı', '')).upper()
            cbs = str(r.get('CBS Kodu', '')).strip()
            status = str(r.get('Eşleşme Durumu', ''))

            if not norm_code or norm_code in processed_codes:
                continue
            processed_codes.add(norm_code)

            # Determine voltage level
            if 'YG' in sinif:
                gerilim = 'YG'
            elif 'AG' in sinif:
                gerilim = 'AG'
            elif 'MÜSTEREK' in sinif or 'MUSTEREK' in sinif:
                gerilim = 'AG'
            else:
                gerilim = 'OG' if 'H' in norm_code and 'TR' not in norm_code else 'AG'

            # Determine default ilce based on OM
            if om == 'HATAY METROPOL':
                default_ilce = 'ANTAKYA'
            elif om == 'KIRIKHAN':
                default_ilce = 'KIRIKHAN'
            elif om == 'REYHANLI':
                default_ilce = 'REYHANLI'
            else:
                default_ilce = 'MERKEZ'

            # Check if this line already exists in DB
            if norm_code in db_lines_by_code:
                # Update existing line name to new feeder code
                line_obj = db_lines_by_code[norm_code]
                line_obj.hat_ismi = new_feeder
                if om:
                    line_obj.operasyon_merkezi = om
                updated_count += 1
            elif norm_code in old_details_map:
                # Existed in old Toroslar Excel but wasn't in DB yet
                old_info = old_details_map[norm_code]
                s_no = old_info['sira_no']
                if not s_no or s_no in existing_sira_nos:
                    s_no = next_new_sira_no
                    next_new_sira_no += 1
                
                existing_sira_nos.add(s_no)
                new_line = models.Line(
                    sira_no=int(s_no),
                    dagitim_sirketi=old_info['dagitim_sirketi'] or 'TOROSLAR',
                    il=old_info['il'] or 'HATAY',
                    ilce=old_info['ilce'] or default_ilce,
                    operasyon_merkezi=om or old_info['operasyon_merkezi'],
                    hat_ismi=new_feeder,
                    gerilim_seviyesi=old_info['gerilim_seviyesi'] or gerilim,
                    hat_uzunlugu=old_info['hat_uzunlugu'] or 0.0,
                    mevcut_risk=old_info['mevcut_risk'] or '1. Derece',
                    planlanan_bakim=old_info['planlanan_bakim'],
                    gerceklesen_bakim=old_info['gerceklesen_bakim'],
                    siparis_no=old_info['siparis_no']
                )
                db.add(new_line)
                inserted_count += 1
            else:
                # Completely brand new line (726 lines)
                s_no = next_new_sira_no
                next_new_sira_no += 1
                existing_sira_nos.add(s_no)

                new_line = models.Line(
                    sira_no=int(s_no),
                    dagitim_sirketi='TOROSLAR',
                    il='HATAY',
                    ilce=default_ilce,
                    operasyon_merkezi=om,
                    hat_ismi=new_feeder,
                    gerilim_seviyesi=gerilim,
                    hat_uzunlugu=0.0,
                    mevcut_risk='1. Derece',
                    planlanan_bakim=None,
                    gerceklesen_bakim=None,
                    siparis_no=None
                )
                db.add(new_line)
                inserted_count += 1

        db.commit()
        print(f"Migration tamamlandı! Güncellenen: {updated_count}, Yeni Eklenen: {inserted_count}")

        # Total count verification
        total_now = db.query(models.Line).count()
        print(f"Veritabanındaki toplam güncel hat sayısı: {total_now}")

    except Exception as e:
        print("Migration Error:", e)
        db.rollback()
    finally:
        db.close()

if __name__ == '__main__':
    run_migration()
