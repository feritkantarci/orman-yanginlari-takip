import urllib.request
import json
import os
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed

# Set up environment
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE_DIR)

from database import SessionLocal
import models
from main import lookup_asset_type

def fetch_line_interventions(sira, token):
    try:
        r = urllib.request.Request(f'https://orman-yanginlari-api-511160101962.europe-west3.run.app/api/interventions/{sira}', headers={'Authorization': f'Bearer {token}'})
        with urllib.request.urlopen(r, timeout=15) as res:
            return sira, json.loads(res.read().decode('utf-8'))
    except Exception as e:
        return sira, []

def sync():
    print("🔄 Canlı sistemden (orman.kantarci.io) tüm veriler yerel veritabanına aktarılıyor...")
    
    # 1. Login
    data = json.dumps({'username': 'admin', 'password': 'Fk.2238893'}).encode('utf-8')
    req = urllib.request.Request('https://orman-yanginlari-api-511160101962.europe-west3.run.app/api/login', data=data, headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            token = json.loads(resp.read().decode('utf-8'))['access_token']
            print("✓ Canlı API bağlantısı sağlandı.")
    except Exception as e:
        print("❌ Canlı API bağlantı hatası:", e)
        return

    # 2. Sync Lines
    print("📥 Canlıdaki tüm hatlar çekiliyor...")
    req_lines = urllib.request.Request('https://orman-yanginlari-api-511160101962.europe-west3.run.app/api/lines', headers={'Authorization': f'Bearer {token}'})
    with urllib.request.urlopen(req_lines, timeout=30) as resp:
        live_lines = json.loads(resp.read().decode('utf-8'))
    print(f"✓ Canlıdan {len(live_lines)} hat alındı. Yerel hatlar güncelleniyor...")

    db = SessionLocal()
    existing_line_siras = {l[0] for l in db.query(models.Line.sira_no).all()}
    
    lines_added = 0
    for ll in live_lines:
        sira = ll.get('sira_no')
        if not sira: continue
        if sira not in existing_line_siras:
            new_line = models.Line(
                sira_no=sira,
                dagitim_sirketi=ll.get('dagitim_sirketi') or 'TOROSLAR',
                il=ll.get('il'),
                ilce=ll.get('ilce'),
                operasyon_merkezi=ll.get('operasyon_merkezi'),
                hat_ismi=ll.get('hat_ismi'),
                gerilim_seviyesi=ll.get('gerilim_seviyesi'),
                hat_uzunlugu=ll.get('hat_uzunlugu') or 0,
                mevcut_risk=ll.get('mevcut_risk'),
                siparis_no=ll.get('siparis_no')
            )
            db.add(new_line)
            existing_line_siras.add(sira)
            lines_added += 1
    db.commit()
    print(f"✓ Hatlar tamamlandı. (Yeni eklenen: {lines_added}, Toplam yerel hat: {len(existing_line_siras)})")

    # 3. Get Lines with Interventions
    req_all = urllib.request.Request('https://orman-yanginlari-api-511160101962.europe-west3.run.app/api/export/preview', headers={'Authorization': f'Bearer {token}'})
    with urllib.request.urlopen(req_all, timeout=30) as resp:
        preview = json.loads(resp.read().decode('utf-8'))

    lines_with_data = [p for p in preview if p.get('intervention_units')]
    siras = [l.get('sira_no') for l in lines_with_data if l.get('sira_no')]
    print(f"✓ Müdahale içeren hat sayısı: {len(siras)}. Paralel veri çekimi başlatılıyor...")

    all_results = []
    with ThreadPoolExecutor(max_workers=20) as executor:
        futures = {executor.submit(fetch_line_interventions, s, token): s for s in siras}
        for future in as_completed(futures):
            sira, intvs = future.result()
            if intvs:
                all_results.append((sira, intvs))

    print(f"✓ {len(all_results)} hattan tüm müdahaleler çekildi. Yerel veritabanına kaydediliyor...")

    # Clear existing local interventions to ensure clean sync
    db.query(models.Intervention).delete()
    db.commit()

    total_added = 0
    for sira, intvs in all_results:
        # verify sira exists in existing_line_siras
        if sira not in existing_line_siras:
            db.add(models.Line(sira_no=sira, il='HATAY', operasyon_merkezi='HATAY METROPOL', hat_ismi=f'HAT-{sira}'))
            db.commit()
            existing_line_siras.add(sira)

        for i in intvs:
            aid = str(i.get('asset_id') or '').strip()
            cat = i.get('category')
            atype = lookup_asset_type(aid)
            
            raw_flag = i.get('flag_request')
            if isinstance(raw_flag, int):
                flag_val = raw_flag
            elif str(raw_flag).isdigit():
                flag_val = int(raw_flag)
            elif raw_flag:
                flag_val = 1
            else:
                flag_val = 0
            
            new_inv = models.Intervention(
                sira_no=sira,
                asset_id=aid,
                category=cat,
                description=i.get('description'),
                status=i.get('status') or 'Yapılmadı',
                length_km=i.get('length_km') or 0,
                created_by=i.get('created_by') or 'admin',
                flag_request=flag_val,
                quantity=i.get('quantity') or 1,
                intervention_unit=i.get('intervention_unit') or 'BELLİ DEĞİL',
                asset_type=atype
            )
            db.add(new_inv)
            total_added += 1

    db.commit()
    print(f"🎉 SENKRONİZASYON BAŞARIYLA TAMAMLANDI!")
    print(f"  • Yerel Hat Sayısı: {db.query(models.Line).count()}")
    print(f"  • Yerel Toplam Müdahale Kaydı: {db.query(models.Intervention).count()} adet canlı veri aktarıldı.")

if __name__ == '__main__':
    sync()
