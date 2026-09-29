import os
import re
import time
import functools
import pandas as pd
from typing import Dict, List, Any, Optional
from sqlalchemy.orm import Session
import models

# --- ASSET TYPE SETS (from orman_son.xlsx) ---
_direk_assets_cache = None
_hat_assets_cache = None

def get_asset_type_sets():
    global _direk_assets_cache, _hat_assets_cache
    if _direk_assets_cache is not None and _hat_assets_cache is not None:
        return _direk_assets_cache, _hat_assets_cache
    
    direk_set = set()
    hat_set = set()
    try:
        base_dir = os.path.dirname(os.path.abspath(__file__))
        excel_path = os.path.join(os.path.dirname(base_dir), 'orman_son.xlsx')
        if not os.path.exists(excel_path):
            excel_path = os.path.join(base_dir, 'orman_son.xlsx')
        if os.path.exists(excel_path):
            df_d = pd.read_excel(excel_path, sheet_name='toroslar_direk').dropna(subset=['om'])
            df_h = pd.read_excel(excel_path, sheet_name='toroslar_hat').dropna(subset=['om'])
            hatay_oms = ['Hatay Metropol', 'Kırıkhan', 'Reyhanlı']
            df_d = df_d[df_d['om'].isin(hatay_oms)]
            df_h = df_h[df_h['om'].isin(hatay_oms)]
            direk_set = set(df_d['direk_assetid'].dropna().astype(int).astype(str))
            hat_set = set(df_h['hatkablo_assetid'].dropna().astype(int).astype(str))
    except Exception as e:
        print("MasterService get_asset_type_sets error:", e)
    
    _direk_assets_cache = direk_set
    _hat_assets_cache = hat_set
    return _direk_assets_cache, _hat_assets_cache

def lookup_asset_type(asset_id: str) -> str:
    if not asset_id:
        return "DİREK"
    d_set, h_set = get_asset_type_sets()
    aid = str(asset_id).strip()
    is_d = aid in d_set
    is_h = aid in h_set
    if is_d and is_h:
        return "DİREK + HAT"
    elif is_d:
        return "DİREK"
    elif is_h:
        return "HAT"
    return "DİREK (SAHA TESPİTİ)"


# --- EXCEL MAP HELPERS ---
def normalize_key(s: str) -> str:
    if not s: return ""
    s = s.strip().upper()
    s = s.replace("İ", "I").replace("Ş", "S").replace("Ğ", "G").replace("Ü", "U").replace("Ö", "O").replace("Ç", "C")
    m = re.match(r'^([A-Z0-9]+(?:-[A-Z0-9]+)?)', s)
    if m:
        return m.group(1)
    return s.split('-')[0].strip()

@functools.lru_cache(maxsize=1)
def get_ihale_excel_map():
    excel_path = os.path.join(os.path.dirname(__file__), 'alikemal_orman.xlsx')
    try:
        df = pd.read_excel(excel_path, sheet_name='ORMANLIK ALANDAN GEÇEN HATLAR', header=2)
        df['KORİDOR AÇMA '] = df['KORİDOR AÇMA '].fillna('')
        df['AĞAÇ BUDAMA'] = df['AĞAÇ BUDAMA'].fillna('')
        excel_map = {}
        for _, row in df.iterrows():
            hat = str(row.get('Hat İsmi', '')).strip().upper()
            om = str(row.get('Operasyon Merkezi', '')).strip().upper()
            if not hat: continue
            
            koridor = str(row.get('KORİDOR AÇMA ', '')).strip().upper()
            budama = str(row.get('AĞAÇ BUDAMA', '')).strip().upper()
            val = {"koridor": koridor, "budama": budama}
            excel_map[(om, hat)] = val
            norm_k = normalize_key(hat)
            if norm_k:
                excel_map[(om, norm_k)] = val
        return excel_map
    except Exception as e:
        print("MasterService Ihale Excel okuma hatasi:", e)
        return {}


def get_overall_intervention_status(status_str: str) -> str:
    if not status_str:
        return "Yapılmadı"
    norm_status = status_str.strip().upper().replace("İ", "I").replace("Ş", "S").replace("Ğ", "G").replace("Ü", "U").replace("Ö", "O").replace("Ç", "C")
    parts = [p.strip() for p in norm_status.split(",")]
    
    if all("KONTROL EDILMEDI" in p or "KONTROL_EDILMEDI" in p for p in parts):
        return "KONTROL EDİLMEDİ"
    elif any("KONTROL EDILMEDI" in p or "KONTROL_EDILMEDI" in p for p in parts):
        if any(p in ["YAPILDI", "TAMAMLANDI", "OK"] for p in parts):
            return "Yapıldı"
        elif any(p == "BEKLIYOR" for p in parts):
            return "Bekliyor"
        elif any(p in ["YAPILMADI", "NOK"] for p in parts):
            return "Yapılmadı"
        return "KONTROL EDİLMEDİ"
    elif all(p in ["YAPILDI", "TAMAMLANDI", "OK"] for p in parts):
        return "Yapıldı"
    elif any(p == "BEKLIYOR" for p in parts):
        return "Bekliyor"
    else:
        return "Yapılmadı"


# --- IN-MEMORY CACHE ---
_MASTER_CACHE: Dict[str, Any] = {
    "data": None,
    "timestamp": 0,
    "ttl_seconds": 60 # 60 seconds auto TTL, invalidated immediately on write
}

def invalidate_master_cache():
    global _MASTER_CACHE
    _MASTER_CACHE["data"] = None
    _MASTER_CACHE["timestamp"] = 0


# --- MASTER DATA BUILDER ENGINE ---
def build_all_master_lines(db: Session, force_refresh: bool = False) -> List[Dict[str, Any]]:
    global _MASTER_CACHE
    now = time.time()
    
    if not force_refresh and _MASTER_CACHE["data"] is not None:
        if now - _MASTER_CACHE["timestamp"] < _MASTER_CACHE["ttl_seconds"]:
            return _MASTER_CACHE["data"]

    # 1. Fetch all Lines & Interventions
    lines = db.query(models.Line).all()
    interventions = db.query(models.Intervention).order_by(models.Intervention.created_at.asc()).all()
    
    # 2. Group interventions by sira_no
    # Deduplicate / keep latest per (sira_no, category, asset_id)
    latest_inv_by_key = {}
    for inv in interventions:
        key = (inv.sira_no, inv.category, inv.asset_id)
        latest_inv_by_key[key] = inv

    invs_by_sira: Dict[int, List[models.Intervention]] = {}
    for inv in latest_inv_by_key.values():
        sira = inv.sira_no
        if sira not in invs_by_sira:
            invs_by_sira[sira] = []
        invs_by_sira[sira].append(inv)

    ihale_map = get_ihale_excel_map()
    all_master_lines = []

    for line in lines:
        sira = line.sira_no
        line_om = str(line.operasyon_merkezi or '').strip().upper()
        line_hat = str(line.hat_ismi or '').strip().upper()
        norm_hat = normalize_key(line_hat)

        # Ihale info
        ihale_info = ihale_map.get((line_om, line_hat)) or ihale_map.get((line_om, norm_hat)) or {}
        koridor_val = ihale_info.get("koridor", "")
        budama_val = ihale_info.get("budama", "")
        ihale_koridor = bool(koridor_val and koridor_val != "YOK")
        ihale_budama = bool(budama_val and budama_val != "YOK")

        line_invs = invs_by_sira.get(sira, [])
        
        # Category Counters
        cat_stats = {
            "Ağaç Budama": {"ok": 0, "nok": 0, "uninspected": 0},
            "Güzergah Değişimi": {"ok": 0, "nok": 0, "uninspected": 0},
            "Beton Dökümü": {"ok": 0, "nok": 0, "uninspected": 0},
            "Koridor Açma": {"ok": 0, "nok": 0, "uninspected": 0},
            "Operasyon Müdahalesi": {"ok": 0, "nok": 0, "uninspected": 0}
        }

        # Unit Counters
        unit_stats = {
            "BAKIM S2": {"yapildi": 0, "yapilacak": 0, "bekliyor": 0, "kontrol_edilmedi": 0},
            "BAKIM S3": {"yapildi": 0, "yapilacak": 0, "bekliyor": 0, "kontrol_edilmedi": 0},
            "OPERASYON": {"yapildi": 0, "yapilacak": 0, "bekliyor": 0, "kontrol_edilmedi": 0},
            "BELLİ DEĞİL": {"yapildi": 0, "yapilacak": 0, "bekliyor": 0, "kontrol_edilmedi": 0},
            "YATIRIM": {"yapildi": 0, "yapilacak": 0, "bekliyor": 0, "kontrol_edilmedi": 0}
        }

        varlik_sayilari = {
            "direk": 0,
            "hat": 0,
            "saha_tespiti": 0,
            "kontrol_edilen": 0,
            "kontrol_bekleyen": 0,
            "toplam": 0
        }

        varliklar_list = []
        units_str_list = []
        statuses_str_list = []

        for inv in line_invs:
            aid = str(inv.asset_id or '').strip()
            cat = inv.category or "Ağaç Budama"
            desc = inv.description or ""
            raw_status = inv.status or "Yapılmadı"
            std_status = get_overall_intervention_status(raw_status) # "Yapıldı", "Yapılmadı", "Bekliyor", "KONTROL EDİLMEDİ"
            unit = getattr(inv, 'intervention_unit', None) or 'BELLİ DEĞİL'
            unit = unit.strip()
            if unit not in unit_stats:
                unit = 'BELLİ DEĞİL'
            
            # Asset type
            atype = getattr(inv, 'asset_type', None) or lookup_asset_type(aid)
            if 'HAT' in atype:
                varlik_sayilari['hat'] += 1
            elif 'SAHA TESPİTİ' in atype:
                varlik_sayilari['saha_tespiti'] += 1
            else:
                varlik_sayilari['direk'] += 1

            varlik_sayilari['toplam'] += 1
            if std_status == "KONTROL EDİLMEDİ":
                varlik_sayilari['kontrol_bekleyen'] += 1
            else:
                varlik_sayilari['kontrol_edilen'] += 1

            # Unit count
            if std_status == "Yapıldı":
                unit_stats[unit]["yapildi"] += 1
            elif std_status == "Bekliyor":
                unit_stats[unit]["bekliyor"] += 1
            elif std_status == "KONTROL EDİLMEDİ":
                unit_stats[unit]["kontrol_edilmedi"] += 1
            else:
                unit_stats[unit]["yapilacak"] += 1

            # Category count
            qty = int(inv.quantity or 1) if cat != "Koridor Açma" else int(inv.length_km or 0)
            if cat in cat_stats:
                if std_status == "Yapıldı":
                    cat_stats[cat]["ok"] += qty
                elif std_status == "KONTROL EDİLMEDİ":
                    cat_stats[cat]["uninspected"] += qty
                else:
                    cat_stats[cat]["nok"] += qty

            units_str_list.append(unit)
            statuses_str_list.append(std_status)

            varliklar_list.append({
                "id": inv.id,
                "asset_id": aid,
                "asset_type": atype,
                "category": cat,
                "description": desc,
                "status": std_status,
                "raw_status": raw_status,
                "intervention_unit": unit,
                "quantity": inv.quantity or 1,
                "length_km": inv.length_km or 0.0,
                "created_by": inv.created_by or "admin",
                "created_at": inv.created_at.isoformat() if inv.created_at else None,
                "flag_request": getattr(inv, 'flag_request', 0)
            })

        # Calculate Overall Son Durum and Kontrol Durumu
        total_nok = sum(c["nok"] for c in cat_stats.values())
        total_ok = sum(c["ok"] for c in cat_stats.values())
        total_uninspected = sum(c["uninspected"] for c in cat_stats.values())
        
        if total_ok > 0 and total_nok == 0 and total_uninspected == 0:
            son_durum = "TAMAMLANDI"
        elif total_nok > 0 or total_ok > 0:
            son_durum = "YAPILMADI"
        else:
            son_durum = "YAPILMADI"

        if varlik_sayilari['toplam'] == 0:
            kontrol_durumu = "VARLIK YOK"
        elif varlik_sayilari['kontrol_edilen'] == 0:
            kontrol_durumu = "KONTROL EDİLMEDİ"
        elif varlik_sayilari['kontrol_bekleyen'] == 0:
            kontrol_durumu = "KONTROL EDİLDİ"
        else:
            kontrol_durumu = "KISMİ KONTROL"

        master_line = {
            "sira_no": line.sira_no,
            "dagitim_sirketi": line.dagitim_sirketi or "TOROSLAR",
            "il": line.il or "",
            "ilce": line.ilce or "",
            "operasyon_merkezi": line.operasyon_merkezi or "",
            "hat_ismi": line.hat_ismi or "",
            "gerilim_seviyesi": line.gerilim_seviyesi or "",
            "hat_uzunlugu": float(line.hat_uzunlugu or 0),
            "mevcut_risk": line.mevcut_risk or "",
            "planlanan_bakim_tarihi": str(line.planlanan_bakim).split()[0] if line.planlanan_bakim else "",
            "gerceklesen_bakim_tarihi": str(line.gerceklesen_bakim).split()[0] if line.gerceklesen_bakim else "",
            "siparis_no": line.siparis_no or "",
            "kontrol_durumu": kontrol_durumu,
            
            # Categories OK/NOK
            "agac_budama_ok": cat_stats["Ağaç Budama"]["ok"],
            "agac_budama_nok": cat_stats["Ağaç Budama"]["nok"],
            "guzergah_degisimi_ok": cat_stats["Güzergah Değişimi"]["ok"],
            "guzergah_degisimi_nok": cat_stats["Güzergah Değişimi"]["nok"],
            "beton_dokumu_ok": cat_stats["Beton Dökümü"]["ok"],
            "beton_dokumu_nok": cat_stats["Beton Dökümü"]["nok"],
            "koridor_acma_ok": cat_stats["Koridor Açma"]["ok"],
            "koridor_acma_nok": cat_stats["Koridor Açma"]["nok"],
            "operasyon_mudahalesi_ok": cat_stats["Operasyon Müdahalesi"]["ok"],
            "operasyon_mudahalesi_nok": cat_stats["Operasyon Müdahalesi"]["nok"],
            
            "ihale_budama": ihale_budama,
            "ihale_koridor": ihale_koridor,
            "son_durum": son_durum,
            
            # Compatibility strings
            "intervention_units": ", ".join(units_str_list),
            "intervention_statuses": ", ".join(statuses_str_list),
            
            # Compatibility sub-dictionaries
            "agac_budama": {
                "yapildi": cat_stats["Ağaç Budama"]["ok"],
                "yapilacak": cat_stats["Ağaç Budama"]["nok"],
                "ihale": "VAR" if ihale_budama else "YOK"
            },
            "guzergah_degisimi": {
                "yapildi": cat_stats["Güzergah Değişimi"]["ok"],
                "yapilacak": cat_stats["Güzergah Değişimi"]["nok"],
                "ihale": "YOK"
            },
            "beton_dokumu": {
                "yapildi": cat_stats["Beton Dökümü"]["ok"],
                "yapilacak": cat_stats["Beton Dökümü"]["nok"],
                "ihale": "YOK"
            },
            "koridor_acma": {
                "yapildi": cat_stats["Koridor Açma"]["ok"],
                "yapilacak": cat_stats["Koridor Açma"]["nok"],
                "ihale": "VAR" if ihale_koridor else "YOK"
            },
            "operasyon_mudahalesi": {
                "yapildi": cat_stats["Operasyon Müdahalesi"]["ok"],
                "yapilacak": cat_stats["Operasyon Müdahalesi"]["nok"],
                "ihale": "YOK"
            },

            # Rich Master Sub-objects
            "unit_stats": unit_stats,
            "varlik_sayilari": varlik_sayilari,
            "varliklar": varliklar_list,
            "asset_ids": [v["asset_id"] for v in varliklar_list if v.get("asset_id")],
            "asset_ids_str": " ".join([str(v["asset_id"]) for v in varliklar_list if v.get("asset_id")])
        }
        all_master_lines.append(master_line)

    # Cache the result
    _MASTER_CACHE["data"] = all_master_lines
    _MASTER_CACHE["timestamp"] = now
    return all_master_lines


def get_filtered_master_lines(db: Session, il: Optional[str] = None, oms: Optional[str] = None, force_refresh: bool = False) -> List[Dict[str, Any]]:
    all_lines = build_all_master_lines(db, force_refresh=force_refresh)
    
    filtered = all_lines
    if il and il != "Tümü":
        filtered = [l for l in filtered if l.get("il") == il]
    if oms and oms != "Tümü":
        om_list = [o.strip() for o in oms.split(",") if o.strip()]
        if om_list:
            filtered = [l for l in filtered if l.get("operasyon_merkezi") in om_list]
            
    return filtered
