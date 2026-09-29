import re

with open('main.py', 'r') as f:
    content = f.read()

new_func = """def generate_excel_file(db: Session):
    import xlsxwriter
    from io import BytesIO

    output = BytesIO()
    wb = xlsxwriter.Workbook(output, {'in_memory': True})
    ws = wb.add_worksheet("Özet Rapor")

    # --- Format Tanımları ---
    hdr_format = wb.add_format({
        'bold': True, 'font_color': 'white', 'bg_color': '#4F81BD',
        'align': 'center', 'valign': 'vcenter', 'border': 1
    })
    
    # Kategori Formatları (Main Header)
    cat_pink_format = wb.add_format({'bold': True, 'align': 'center', 'valign': 'vcenter', 'border': 1, 'bg_color': '#F2DCDB'})
    cat_blue_format = wb.add_format({'bold': True, 'font_color': 'white', 'align': 'center', 'valign': 'vcenter', 'border': 1, 'bg_color': '#538DD5'})
    cat_lightblue_format = wb.add_format({'bold': True, 'align': 'center', 'valign': 'vcenter', 'border': 1, 'bg_color': '#B8CCE4'})

    # Alt Başlık Formatları (Sub Header)
    sub_pink_format = wb.add_format({'bold': True, 'align': 'center', 'valign': 'vcenter', 'border': 1, 'bg_color': '#E6B8B7', 'font_color': 'white'})
    sub_blue_format = wb.add_format({'bold': True, 'align': 'center', 'valign': 'vcenter', 'border': 1, 'bg_color': '#8DB4E2', 'font_color': 'white'})
    sub_lightblue_format = wb.add_format({'bold': True, 'align': 'center', 'valign': 'vcenter', 'border': 1, 'bg_color': '#C6D9F1'})
    
    border_format = wb.add_format({'border': 1})
    border_center = wb.add_format({'border': 1, 'align': 'center'})
    date_format = wb.add_format({'border': 1, 'num_format': 'dd.mm.yyyy'})

    # 1. Bütün müdahaleleri çek (LATEST mantığıyla)
    interventions = db.query(models.Intervention).order_by(models.Intervention.created_at.asc()).all()
    latest_interventions = {}
    for inv in interventions:
        if not inv.sira_no: continue
        key = (inv.sira_no, inv.category, inv.asset_id)
        latest_interventions[key] = inv

    # Line bazında grupla
    stats_by_sira = {}
    for inv in latest_interventions.values():
        sira = inv.sira_no
        if sira not in stats_by_sira:
            stats_by_sira[sira] = []
        stats_by_sira[sira].append(inv)

    # Ihale mantığı için map
    excel_map = get_ihale_excel_map()

    # --- Başlıkları Yazdır ---
    # Ortak Başlıklar (0-12)
    common_headers = [
        "Sıra No", "Dağıtım Şirketi", "İl", "İlçe", "Operasyon Merkezi",
        "Hat İsmi", "Gerilim Seviyesi", "Hat Uzunluğu (Km)", "Mevcut Risk",
        "Planlanan Bakım Tarihi", "Gerçekleşen Bakım Tarihi", "Sipariş Numarası", "SON DURUM"
    ]
    for col_idx, header in enumerate(common_headers):
        ws.merge_range(0, col_idx, 1, col_idx, header, hdr_format)
        if col_idx == 0: ws.set_column(col_idx, col_idx, 10)
        elif col_idx in [5, 11]: ws.set_column(col_idx, col_idx, 25)
        else: ws.set_column(col_idx, col_idx, 15)

    # Kategoriler
    # 1. Ağaç Budama (13, 14, 15)
    ws.merge_range(0, 13, 0, 15, "AĞAÇ BUDAMA", cat_pink_format)
    ws.write(1, 13, "YAPILDI", sub_pink_format)
    ws.write(1, 14, "YAPILMADI", sub_pink_format)
    ws.write(1, 15, "İHALE KEŞFİNDE VAR", sub_pink_format)
    ws.set_column(13, 15, 18)

    # 2. Güzergah Değişimi (16, 17, 18)
    ws.merge_range(0, 16, 0, 18, "GÜZERGAH DEĞİŞİMİ", cat_blue_format)
    ws.write(1, 16, "YAPILDI", sub_blue_format)
    ws.write(1, 17, "YAPILMADI", sub_blue_format)
    ws.write(1, 18, "İHALE KEŞFİNDE VAR", sub_blue_format)
    ws.set_column(16, 18, 18)

    # 3. Beton Dökümü (19, 20)
    ws.merge_range(0, 19, 0, 20, "BETON DÖKÜMÜ", cat_pink_format)
    ws.write(1, 19, "YAPILDI", sub_pink_format)
    ws.write(1, 20, "YAPILMADI", sub_pink_format)
    ws.set_column(19, 20, 18)

    # 4. Koridor Açma (21, 22, 23)
    ws.merge_range(0, 21, 0, 23, "KORİDOR AÇMA", cat_lightblue_format)
    ws.write(1, 21, "YAPILDI", sub_lightblue_format)
    ws.write(1, 22, "YAPILMADI", sub_lightblue_format)
    ws.write(1, 23, "İHALE KEŞFİNDE VAR", sub_lightblue_format)
    ws.set_column(21, 23, 18)

    # 5. Operasyon Müdahalesi (24, 25)
    ws.merge_range(0, 24, 0, 25, "OPERASYON MÜDAHALESİ", cat_pink_format)
    ws.write(1, 24, "YAPILDI", sub_pink_format)
    ws.write(1, 25, "YAPILMADI", sub_pink_format)
    ws.set_column(24, 25, 18)

    ws.freeze_panes(2, 0)
    ws.autofilter(1, 0, 1, 25)

    # 2. Bütün hatları (lines) çek ve yaz
    lines = db.query(models.Line).order_by(models.Line.sira_no).all()
    
    row_idx = 2
    for line in lines:
        sira = line.sira_no
        line_invs = stats_by_sira.get(sira, [])
        
        line_om = str(line.operasyon_merkezi).strip().upper() if line.operasyon_merkezi else ""
        line_hat = str(line.hat_ismi).strip().upper() if line.hat_ismi else ""
        koridor_excel = excel_map.get((line_om, line_hat), {}).get("koridor", "YOK")
        budama_excel = excel_map.get((line_om, line_hat), {}).get("budama", "YOK")
        ihale_koridor = "VAR" if koridor_excel != "YOK" and koridor_excel != "" else "YOK"
        ihale_budama = "VAR" if budama_excel != "YOK" and budama_excel != "" else "YOK"
        
        def get_ihale(cat: str):
            if cat == "Ağaç Budama" and ihale_budama == "VAR": return "VAR"
            if cat == "Koridor Açma" and ihale_koridor == "VAR": return "VAR"
            has_ihale = False
            for i in line_invs:
                if i.category and i.category.strip() == cat and i.status:
                    overall = get_overall_intervention_status(i.status).lower()
                    if overall in ["yapılmadı", "bekliyor"] and i.intervention_unit and "MÜTEAHHİT" in i.intervention_unit.upper():
                        has_ihale = True
                        break
            return "VAR" if has_ihale else "YOK"

        def get_stat(cat: str, st: str):
            total = 0.0
            for i in line_invs:
                if i.category and i.category.strip() == cat and i.status:
                    overall = get_overall_intervention_status(i.status).lower()
                    
                    match = False
                    if st.lower() == "yapıldı" and overall == "yapıldı":
                        match = True
                    elif st.lower() == "yapılacak" and overall in ["yapılmadı", "bekliyor"]:
                        match = True
                        
                    if match:
                        qty = float(i.quantity or 1) if cat != "Koridor Açma" else float(i.length_km or 0)
                        total += qty
            return total if total > 0 else 0

        # Son Durum hesaplama
        all_done = True
        has_any = False
        for inv in line_invs:
            has_any = True
            if not inv.status:
                all_done = False
                break
            statuses = [s.strip().lower() for s in inv.status.split(",")]
            if any(s in ["yapılmadı", "bekliyor"] for s in statuses):
                all_done = False
                break
                
        if not has_any:
            son_durum = "GEREK YOK"
        elif all_done:
            son_durum = "TAMAMLANDI"
        else:
            son_durum = "YAPILMADI"

        ws.write(row_idx, 0, line.sira_no, border_format)
        ws.write(row_idx, 1, line.dagitim_sirketi or "", border_format)
        ws.write(row_idx, 2, line.il or "", border_format)
        ws.write(row_idx, 3, line.ilce or "", border_format)
        ws.write(row_idx, 4, line.operasyon_merkezi or "", border_format)
        ws.write(row_idx, 5, line.hat_ismi or "", border_format)
        ws.write(row_idx, 6, line.gerilim_seviyesi or "", border_format)
        ws.write(row_idx, 7, line.hat_uzunlugu or 0, border_format)
        ws.write(row_idx, 8, line.mevcut_risk or "", border_format)
        
        if line.planlanan_bakim:
            ws.write_datetime(row_idx, 9, line.planlanan_bakim, date_format)
        else:
            ws.write(row_idx, 9, "", border_format)
            
        if line.gerceklesen_bakim:
            ws.write_datetime(row_idx, 10, line.gerceklesen_bakim, date_format)
        else:
            ws.write(row_idx, 10, "", border_format)
            
        ws.write(row_idx, 11, line.siparis_no or "", border_format)
        ws.write(row_idx, 12, son_durum, border_center)
        
        # Ağaç Budama
        ws.write(row_idx, 13, get_stat("Ağaç Budama", "yapıldı"), border_center)
        ws.write(row_idx, 14, get_stat("Ağaç Budama", "yapılacak"), border_center)
        ws.write(row_idx, 15, get_ihale("Ağaç Budama"), border_center)
        
        # Güzergah Değişimi
        ws.write(row_idx, 16, get_stat("Güzergah Değişimi", "yapıldı"), border_center)
        ws.write(row_idx, 17, get_stat("Güzergah Değişimi", "yapılacak"), border_center)
        ws.write(row_idx, 18, get_ihale("Güzergah Değişimi"), border_center)
        
        # Beton Dökümü (İhale yok)
        ws.write(row_idx, 19, get_stat("Beton Dökümü", "yapıldı"), border_center)
        ws.write(row_idx, 20, get_stat("Beton Dökümü", "yapılacak"), border_center)
        
        # Koridor Açma
        ws.write(row_idx, 21, get_stat("Koridor Açma", "yapıldı"), border_center)
        ws.write(row_idx, 22, get_stat("Koridor Açma", "yapılacak"), border_center)
        ws.write(row_idx, 23, get_ihale("Koridor Açma"), border_center)
        
        # Operasyon Müdahalesi (İhale yok)
        ws.write(row_idx, 24, get_stat("Operasyon Müdahalesi", "yapıldı"), border_center)
        ws.write(row_idx, 25, get_stat("Operasyon Müdahalesi", "yapılacak"), border_center)

        row_idx += 1

    wb.close()
    output.seek(0)
    return output"""

pattern = re.compile(r'def generate_excel_file\(db: Session\):.*?return output\n', re.DOTALL)
new_content = pattern.sub(new_func + '\n', content)

with open('main.py', 'w') as f:
    f.write(new_content)
print("Replaced successfully!")
