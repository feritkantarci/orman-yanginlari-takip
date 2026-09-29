import os
import sys
import pandas as pd
from datetime import datetime
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

# Import models
import models
from database import engine, SessionLocal

def ingest_official_assets(db=None):
    close_db = False
    if db is None:
        db = SessionLocal()
        close_db = True

    try:
        print("=== 1. Reading orman_son.xlsx ===")
        base_dir = os.path.dirname(os.path.abspath(__file__))
        excel_path = os.path.join(os.path.dirname(base_dir), 'orman_son.xlsx')
        if not os.path.exists(excel_path):
            excel_path = os.path.join(base_dir, 'orman_son.xlsx')

        if not os.path.exists(excel_path):
            raise FileNotFoundError(f"Excel file not found at {excel_path}")

        df_d = pd.read_excel(excel_path, sheet_name='toroslar_direk').dropna(subset=['om', 'direk_assetid'])
        df_h = pd.read_excel(excel_path, sheet_name='toroslar_hat').dropna(subset=['om', 'hatkablo_assetid'])

        hatay_oms = ['Hatay Metropol', 'Kırıkhan', 'Reyhanlı']
        df_d = df_d[df_d['om'].isin(hatay_oms)]
        df_h = df_h[df_h['om'].isin(hatay_oms)]

        df_d['asset_id_str'] = df_d['direk_assetid'].astype(int).astype(str)
        df_h['asset_id_str'] = df_h['hatkablo_assetid'].astype(int).astype(str)

        print(f"Direk rows: {len(df_d)} (Unique Asset IDs: {df_d['asset_id_str'].nunique()})")
        print(f"Hat rows: {len(df_h)} (Unique Asset IDs: {df_h['asset_id_str'].nunique()})")

        print("\n=== 2. Preparing Lines and Placeholder Lines (BAKILACAK) ===")
        all_lines = db.query(models.Line).all()
        existing_siras = [l.sira_no for l in all_lines if l.sira_no is not None]
        max_sira = max(existing_siras) if existing_siras else 20000

        # Build lookup maps for existing lines
        # Primary map: (OM_upper, hat_ismi_upper) -> sira_no
        # Secondary map: hat_ismi_upper -> sira_no
        line_om_map = {}
        line_hat_map = {}
        for l in all_lines:
            om_up = (l.operasyon_merkezi or '').strip().upper()
            hat_up = (l.hat_ismi or '').strip().upper()
            if om_up and hat_up and (om_up, hat_up) not in line_om_map:
                line_om_map[(om_up, hat_up)] = l.sira_no
            if hat_up and hat_up not in line_hat_map:
                line_hat_map[hat_up] = l.sira_no

        # Check / create BAKILACAK placeholder lines for each OM
        placeholder_lines = {
            'HATAY METROPOL': 'BAKILACAK-1',
            'KIRIKHAN': 'BAKILACAK-2',
            'REYHANLI': 'BAKILACAK-3'
        }
        
        bakilacak_sira_map = {}
        for om_key, placeholder_name in placeholder_lines.items():
            existing = db.query(models.Line).filter(
                models.Line.hat_ismi == placeholder_name
            ).first()
            if existing:
                bakilacak_sira_map[om_key] = existing.sira_no
                print(f"Found existing placeholder line: {placeholder_name} (Sıra: {existing.sira_no})")
            else:
                max_sira += 1
                new_line = models.Line(
                    sira_no=max_sira,
                    dagitim_sirketi="TOROSLAR",
                    il="HATAY",
                    ilce="MERKEZ" if "METROPOL" in om_key else ("KIRIKHAN" if "KIRIKHAN" in om_key else "REYHANLI"),
                    operasyon_merkezi=om_key,
                    hat_ismi=placeholder_name,
                    gerilim_seviyesi="OG",
                    hat_uzunlugu=0.0,
                    mevcut_risk="2. Derece Riskli",
                    siparis_no="ENVANTER_GENEL"
                )
                db.add(new_line)
                db.flush()
                bakilacak_sira_map[om_key] = max_sira
                line_om_map[(om_key, placeholder_name)] = max_sira
                line_hat_map[placeholder_name] = max_sira
                print(f"Created new placeholder line: {placeholder_name} (Sıra: {max_sira}) for OM: {om_key}")

        print("\n=== 3. Checking Existing Interventions ===")
        existing_invs = db.query(models.Intervention).all()
        # Set of (sira_no, asset_id)
        existing_inv_keys = set()
        for inv in existing_invs:
            if inv.sira_no and inv.asset_id:
                existing_inv_keys.add((inv.sira_no, str(inv.asset_id).strip()))
        print(f"Existing (sira_no, asset_id) pairs in DB: {len(existing_inv_keys)}")

        print("\n=== 4. Ingesting Official Direk & Hat Assets ===")
        new_interventions = []
        now = datetime.utcnow()

        # Helper to find line sira_no
        def get_line_sira(om: str, feeder: str) -> int:
            om_up = str(om or '').strip().upper()
            feeder_up = str(feeder or '').strip().upper()

            if not feeder_up or feeder_up == 'NAN':
                # Map to BAKILACAK placeholder line
                for k, sira in bakilacak_sira_map.items():
                    if k in om_up or om_up in k:
                        return sira
                return bakilacak_sira_map['HATAY METROPOL']

            # Exact match by (OM, Feeder)
            if (om_up, feeder_up) in line_om_map:
                return line_om_map[(om_up, feeder_up)]
            
            # Fuzzy match OM + Feeder
            for (k_om, k_hat), s in line_om_map.items():
                if (k_om in om_up or om_up in k_om) and k_hat == feeder_up:
                    return s
            
            # Fallback to Feeder alone
            if feeder_up in line_hat_map:
                return line_hat_map[feeder_up]

            # If still not found, map to BAKILACAK
            for k, sira in bakilacak_sira_map.items():
                if k in om_up or om_up in k:
                    return sira
            return bakilacak_sira_map['HATAY METROPOL']

        # 4a. Process Direk Assets
        inserted_direk = 0
        skipped_direk = 0
        for _, row in df_d.iterrows():
            aid = str(row['asset_id_str']).strip()
            om = str(row.get('om', ''))
            feeder = str(row.get('feeder_code', '')) if pd.notna(row.get('feeder_code')) else ''
            
            sira = get_line_sira(om, feeder)
            if (sira, aid) in existing_inv_keys:
                skipped_direk += 1
                continue

            inv = models.Intervention(
                sira_no=sira,
                asset_id=aid,
                category="Ağaç Budama",
                description="Resmi GIS Envanteri (Kontrol Bekliyor)",
                status="KONTROL EDİLMEDİ",
                intervention_unit="BELLİ DEĞİL",
                asset_type="DİREK",
                quantity=1,
                length_km=None,
                created_by="GIS Envanter",
                created_at=now
            )
            new_interventions.append(inv)
            existing_inv_keys.add((sira, aid))
            inserted_direk += 1

        print(f"Direk assets -> To insert: {inserted_direk}, Already existing: {skipped_direk}")

        # 4b. Process Hat Assets
        inserted_hat = 0
        skipped_hat = 0
        for _, row in df_h.iterrows():
            aid = str(row['asset_id_str']).strip()
            om = str(row.get('om', ''))
            feeder = str(row.get('feeder_code', '')) if pd.notna(row.get('feeder_code')) else ''
            
            sira = get_line_sira(om, feeder)
            if (sira, aid) in existing_inv_keys:
                skipped_hat += 1
                continue

            inv = models.Intervention(
                sira_no=sira,
                asset_id=aid,
                category="Ağaç Budama",
                description="Resmi GIS Envanteri (Kontrol Bekliyor)",
                status="KONTROL EDİLMEDİ",
                intervention_unit="BELLİ DEĞİL",
                asset_type="HAT",
                quantity=1,
                length_km=None,
                created_by="GIS Envanter",
                created_at=now
            )
            new_interventions.append(inv)
            existing_inv_keys.add((sira, aid))
            inserted_hat += 1

        print(f"Hat assets -> To insert: {inserted_hat}, Already existing: {skipped_hat}")

        # 5. Bulk insert in batches of 2000
        batch_size = 2000
        total_to_insert = len(new_interventions)
        print(f"\n=== 5. Bulk inserting {total_to_insert} official assets ===")
        for i in range(0, total_to_insert, batch_size):
            batch = new_interventions[i:i+batch_size]
            db.bulk_save_objects(batch)
            db.commit()
            print(f"Inserted batch {i+1} to {min(i+batch_size, total_to_insert)} / {total_to_insert}")

        print("\n=== SUCCESS: All official GIS assets successfully ingested! ===")
        
        # Invalidate master cache
        import master_service
        master_service.invalidate_master_cache()

    except Exception as e:
        db.rollback()
        print(f"Error during ingestion: {e}")
        raise e
    finally:
        if close_db:
            db.close()

if __name__ == "__main__":
    ingest_official_assets()
