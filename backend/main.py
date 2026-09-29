from fastapi import FastAPI, Depends, HTTPException, status, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from sqlalchemy.orm import Session
from datetime import timedelta
import models, schemas, auth, master_service
import math
from io import BytesIO
from fastapi.responses import StreamingResponse
import openpyxl
import smtplib
from email.message import EmailMessage
import os
import pydantic
from database import engine, get_db
import base64
import hashlib
from cryptography.fernet import Fernet

def encrypt_password(password: str) -> str:
    key = hashlib.sha256(auth.SECRET_KEY.encode()).digest()
    fernet = Fernet(base64.urlsafe_b64encode(key))
    return fernet.encrypt(password.encode()).decode()

def decrypt_password(encrypted_password: str) -> str:
    key = hashlib.sha256(auth.SECRET_KEY.encode()).digest()
    fernet = Fernet(base64.urlsafe_b64encode(key))
    return fernet.decrypt(encrypted_password.encode()).decode()

models.Base.metadata.create_all(bind=engine)

def get_asset_type_sets():
    direk_set = set()
    hat_set = set()
    try:
        base_dir = os.path.dirname(os.path.abspath(__file__))
        excel_path = os.path.join(os.path.dirname(base_dir), 'orman_son.xlsx')
        if os.path.exists(excel_path):
            import pandas as pd
            df_d = pd.read_excel(excel_path, sheet_name='toroslar_direk').dropna(subset=['om'])
            df_h = pd.read_excel(excel_path, sheet_name='toroslar_hat').dropna(subset=['om'])
            hatay_oms = ['Hatay Metropol', 'Kırıkhan', 'Reyhanlı']
            df_d = df_d[df_d['om'].isin(hatay_oms)]
            df_h = df_h[df_h['om'].isin(hatay_oms)]
            direk_set = set(df_d['direk_assetid'].dropna().astype(int).astype(str))
            hat_set = set(df_h['hatkablo_assetid'].dropna().astype(int).astype(str))
    except Exception as e:
        print("get_asset_type_sets error:", e)
    return direk_set, hat_set

_direk_assets_cache = None
_hat_assets_cache = None

def lookup_asset_type(asset_id: str) -> str:
    global _direk_assets_cache, _hat_assets_cache
    if not asset_id:
        return "DİREK"
    if _direk_assets_cache is None or _hat_assets_cache is None:
        _direk_assets_cache, _hat_assets_cache = get_asset_type_sets()
    
    aid = str(asset_id).strip()
    is_d = aid in _direk_assets_cache
    is_h = aid in _hat_assets_cache
    if is_d and is_h:
        return "DİREK + HAT"
    elif is_d:
        return "DİREK"
    elif is_h:
        return "HAT"
    return "DİREK (SAHA TESPİTİ)"

def run_startup_migration():
    import json, os, re
    from database import SessionLocal
    from sqlalchemy import text
    db = SessionLocal()
    try:
        # 0. Ensure asset_type column exists on interventions
        try:
            db.execute(text("ALTER TABLE interventions ADD COLUMN IF NOT EXISTS asset_type VARCHAR DEFAULT 'DİREK'"))
            db.commit()
        except Exception:
            db.rollback()
            try:
                db.execute(text("ALTER TABLE interventions ADD COLUMN asset_type VARCHAR DEFAULT 'DİREK'"))
                db.commit()
            except Exception:
                db.rollback()

        # Update existing interventions with asset_type
        d_set, h_set = get_asset_type_sets()
        if d_set or h_set:
            invs = db.query(models.Intervention).all()
            for inv in invs:
                if inv.asset_id:
                    aid = str(inv.asset_id).strip()
                    is_d = aid in d_set
                    is_h = aid in h_set
                    if is_d and is_h:
                        inv.asset_type = "DİREK + HAT"
                    elif is_d:
                        inv.asset_type = "DİREK"
                    elif is_h:
                        inv.asset_type = "HAT"
                    else:
                        inv.asset_type = "DİREK (SAHA TESPİTİ)"
            db.commit()

        payload_path = os.path.join(os.path.dirname(__file__), 'migration_payload.json')
        if not os.path.exists(payload_path):
            return
        with open(payload_path, 'r', encoding='utf-8') as f:
            items = json.load(f)
            
        all_db_lines = db.query(models.Line).all()
        existing_siras = {l.sira_no for l in all_db_lines if l.sira_no}
        max_sira = max(existing_siras) if existing_siras else 10000
        
        def get_norm(s):
            if not s: return ''
            s = str(s).strip().upper().replace('İ', 'I').replace('Ş', 'S').replace('Ğ', 'G').replace('Ü', 'U').replace('Ö', 'O').replace('Ç', 'C')
            m = re.match(r'^([A-Z0-9]+(?:-[A-Z0-9]+)?)', s)
            return m.group(1) if m else s.split('-')[0].strip()

        # Build comp map
        comp_map = {}
        for itm in items:
            yf = itm['yeni_fider']
            nc = get_norm(yf)
            if nc:
                comp_map[nc] = yf

        # 1. Clean ALL existing lines in DB
        updated_count = 0
        existing_codes_in_db = set()
        for l in all_db_lines:
            if not l.hat_ismi: continue
            norm_l = get_norm(l.hat_ismi)
            existing_codes_in_db.add(norm_l)
            
            # If in comp_map, use exact new feeder code
            if norm_l in comp_map:
                target_name = comp_map[norm_l]
                if l.hat_ismi != target_name:
                    l.hat_ismi = target_name
                    updated_count += 1
            elif '-' in l.hat_ismi:
                # Strip description
                parts = l.hat_ismi.split('-')
                if len(parts) >= 3 and ('H' in parts[1] or 'TR' in parts[1] or len(parts[1]) <= 3):
                    clean_name = f'{parts[0].strip()}-{parts[1].strip()}'
                else:
                    clean_name = parts[0].strip()
                if l.hat_ismi != clean_name:
                    l.hat_ismi = clean_name
                    updated_count += 1

        # 2. Insert missing items from comparison
        inserted_count = 0
        next_sira = max(max_sira + 1, 20001)
        for itm in items:
            yeni_fider = itm['yeni_fider']
            norm_code = get_norm(yeni_fider)
            if norm_code in existing_codes_in_db:
                continue
            existing_codes_in_db.add(norm_code)
            
            s_no = itm.get('sira_no')
            if not s_no or s_no in existing_siras:
                s_no = next_sira
                next_sira += 1
            existing_siras.add(s_no)
            
            new_l = models.Line(
                sira_no=int(s_no),
                dagitim_sirketi='TOROSLAR',
                il='HATAY',
                ilce=itm['ilce'],
                operasyon_merkezi=itm['om'],
                hat_ismi=yeni_fider,
                gerilim_seviyesi=itm['gerilim'],
                hat_uzunlugu=0.0,
                mevcut_risk='1. Derece',
                planlanan_bakim=None,
                gerceklesen_bakim=None,
                siparis_no=None
            )
            db.add(new_l)
            inserted_count += 1
            
        db.commit()
        print(f"Startup migration completed: {updated_count} updated, {inserted_count} inserted.")
    except Exception as e:
        print("Startup migration error:", e)
        db.rollback()
    finally:
        db.close()

run_startup_migration()

app = FastAPI(title="Orman Yangınları API")

import subprocess

APP_VERSION = "1.0.1"
try:
    commit_hash = subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], text=True).strip()
    iso_date = subprocess.check_output(["git", "log", "-1", "--format=%cI"], text=True).strip()
    
    # Simple manual parse for Turkish date
    from datetime import datetime
    d = datetime.fromisoformat(iso_date)
    months = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"]
    date_str = f"{d.day} {months[d.month - 1]} {d.year}"
    
    APP_VERSION = f"{APP_VERSION} (Commit: {commit_hash}) - {date_str}"
except Exception:
    pass

@app.get("/api/version")
def get_version():
    return {"version": APP_VERSION}


# Setup CORS for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # For dev only, use explicit frontend URL in prod
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=1000)

@app.post("/api/login", response_model=auth.Token)
def login_for_access_token(user_credentials: schemas.UserLogin, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == user_credentials.username).first()
    if not user or not auth.verify_password(user_credentials.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=auth.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = auth.create_access_token(
        data={"sub": user.username, "role": user.role}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer", "username": user.username, "role": user.role}

# To be implemented: dependency to get current user from token
from fastapi.security import OAuth2PasswordBearer
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/login")

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    from jose import JWTError, jwt
    try:
        payload = jwt.decode(token, auth.SECRET_KEY, algorithms=[auth.ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise HTTPException(status_code=401, detail="Invalid auth credentials")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid auth credentials")
    user = db.query(models.User).filter(models.User.username == username).first()
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    return user

import functools

def normalize_key(s):
    if not s: return ''
    s = str(s).strip().upper()
    s = s.replace('İ', 'I').replace('Ş', 'S').replace('Ğ', 'G').replace('Ü', 'U').replace('Ö', 'O').replace('Ç', 'C')
    import re
    m = re.match(r'^([A-Z0-9]+)', s)
    if m:
        return m.group(1)
    return s.split('-')[0].strip()

@functools.lru_cache(maxsize=1)
def get_ihale_excel_map():
    import pandas as pd
    import os
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
            val = {
                "koridor": koridor,
                "budama": budama
            }
            excel_map[(om, hat)] = val
            norm_k = normalize_key(hat)
            if norm_k:
                excel_map[(om, norm_k)] = val
        return excel_map
    except Exception as e:
        print("Excel okuma hatasi:", e)
        return {}

@functools.lru_cache(maxsize=1)
def get_toroslar_excel_map():
    import pandas as pd
    import os
    excel_path = os.path.join(os.path.dirname(__file__), 'Kopya Ormanlık Alan Bakım Takip - Toroslar.xlsx')
    try:
        df = pd.read_excel(excel_path, header=2)
        excel_map = {}
        for _, row in df.iterrows():
            hat = str(row.get('Hat İsmi', '')).strip().upper()
            om = str(row.get('Operasyon Merkezi', '')).strip().upper()
            if not hat or hat == 'NAN': continue
            
            def safe_str(val):
                if pd.isna(val): return ""
                if isinstance(val, float) and val.is_integer(): return str(int(val))
                return str(val)
                
            val = {
                "sira_no": safe_str(row.get('Sıra No')),
                "dagitim_sirketi": safe_str(row.get('Dağıtım Şirketi')),
                "il": safe_str(row.get('İl')),
                "ilce": safe_str(row.get('İlçe')),
                "gerilim_seviyesi": safe_str(row.get('Gerilim Seviyesi\n(AG/OG)')),
                "hat_uzunlugu": safe_str(row.get('Hat Uzunluğu\n(Km)')),
                "mevcut_risk": safe_str(row.get('Mevcut Risk\n(1./2./3. Derece Riskli)')),
                "planlanan_bakim": safe_str(row.get('Planlanan Bakım Tarihi')).split()[0] if safe_str(row.get('Planlanan Bakım Tarihi')) else "",
                "gerceklesen_bakim": safe_str(row.get('Gerçekleşen Bakım Tarihi')).split()[0] if safe_str(row.get('Gerçekleşen Bakım Tarihi')) else "",
                "siparis_no": safe_str(row.get('SİPARİŞ NUMARASI')),
            }
            excel_map[(om, hat)] = val
            norm_k = normalize_key(hat)
            if norm_k:
                excel_map[(om, norm_k)] = val
        return excel_map
    except Exception as e:
        print("Toroslar Excel okuma hatasi:", e)
        return {}

def get_overall_intervention_status(status_str: str) -> str:
    if not status_str:
        return "Yapılmadı"
    statuses = [s.strip().lower() for s in status_str.split(",")]
    if all(s == "yapıldı" for s in statuses):
        return "Yapıldı"
    elif any(s == "bekliyor" for s in statuses):
        return "Bekliyor"
    else:
        return "Yapılmadı"

@app.get("/api/lines")
def get_lines(il: str = None, oms: str = None, db: Session = Depends(get_db)):
    return master_service.get_filtered_master_lines(db, il=il, oms=oms)

@app.api_route("/api/interventions/bulk/status", methods=["PUT", "POST"])
@app.api_route("/api/interventions/bulk-status", methods=["PUT", "POST"])
def update_interventions_bulk(payload: schemas.InterventionBulkUpdate = Body(...), db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    if current_user.role == "izleyici":
        raise HTTPException(status_code=403, detail="Forbidden")
    db.query(models.Intervention).filter(models.Intervention.id.in_(payload.ids)).update({models.Intervention.status: payload.status}, synchronize_session=False)
    db.commit()
    master_service.invalidate_master_cache()
    return {"message": "Success"}

@app.api_route("/api/interventions/bulk", methods=["DELETE", "POST"])
@app.api_route("/api/interventions/bulk-delete", methods=["DELETE", "POST"])
def delete_interventions_bulk(payload: schemas.InterventionBulkDelete = Body(...), db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    if current_user.role == "izleyici":
        raise HTTPException(status_code=403, detail="Forbidden")
    
    # 1. Clean up associated requests first to avoid foreign key errors
    db.query(models.Request).filter(models.Request.intervention_id.in_(payload.ids)).delete(synchronize_session=False)
    
    # 2. Filter records to delete based on permissions
    query = db.query(models.Intervention).filter(models.Intervention.id.in_(payload.ids))
    if current_user.role != "admin":
        query = query.filter(
            (models.Intervention.created_by == current_user.username) | 
            (models.Intervention.created_by == "GIS Envanter") | 
            (models.Intervention.created_by == None)
        )
        
    query.delete(synchronize_session=False)
    db.commit()
    master_service.invalidate_master_cache()
    return {"message": "Success"}


@app.get("/api/interventions/{sira_no}", response_model=list[schemas.InterventionResponse])
def get_interventions_for_line(sira_no: int, db: Session = Depends(get_db)):
    interventions = db.query(models.Intervention).filter(models.Intervention.sira_no == sira_no).order_by(models.Intervention.created_at.desc()).all()
    return interventions

@app.post("/api/interventions/{sira_no}", response_model=schemas.InterventionResponse)
def create_intervention(sira_no: int, intervention: schemas.InterventionCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    if current_user.role == "izleyici":
        raise HTTPException(status_code=403, detail="Forbidden")
    
    clean_asset_id = str(intervention.asset_id or "").strip()
    clean_cat = str(intervention.category or "").strip()

    if clean_asset_id:
        existing = db.query(models.Intervention).filter(
            models.Intervention.sira_no == sira_no,
            models.Intervention.category == clean_cat,
            models.Intervention.asset_id == clean_asset_id
        ).first()
        if existing:
            raise HTTPException(
                status_code=400, 
                detail=f"Bu hatta '{clean_asset_id}' Asset ID'si için '{clean_cat}' kategorisinde zaten bir kayıt bulunmaktadır."
            )

    data = intervention.dict()
    data["asset_id"] = clean_asset_id
    data["category"] = clean_cat
    if not data.get("asset_type") or data.get("asset_type") == "DİREK":
        data["asset_type"] = lookup_asset_type(clean_asset_id)
    db_intervention = models.Intervention(
        **data,
        sira_no=sira_no,
        created_by=current_user.username
    )
    db.add(db_intervention)
    db.commit()
    db.refresh(db_intervention)
    master_service.invalidate_master_cache()
    return db_intervention
@app.get("/api/me")
def read_users_me(current_user: models.User = Depends(get_current_user)):
    import json
    prefs = current_user.dashboard_preferences
    if not prefs: prefs = "[]"
    try:
        prefs_obj = json.loads(prefs)
    except:
        prefs_obj = []
        
    return {
        "username": current_user.username, 
        "role": current_user.role, 
        "default_il": current_user.default_il, 
        "default_oms": current_user.default_oms,
        "dashboard_preferences": prefs_obj
    }

@app.put("/api/me/defaults")
def update_user_defaults(payload: schemas.UserDefaultsUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    current_user.default_il = payload.default_il
    current_user.default_oms = payload.default_oms
    db.commit()
    return {"message": "Defaults updated successfully"}

@app.delete("/api/interventions/{id}")
def delete_intervention(id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    if current_user.role == "izleyici":
        raise HTTPException(status_code=403, detail="Forbidden")
    intervention = db.query(models.Intervention).filter(models.Intervention.id == id).first()
    if not intervention:
        raise HTTPException(status_code=404, detail="Not found")
    
    if current_user.role != "admin" and intervention.created_by != current_user.username and intervention.created_by != "GIS Envanter" and intervention.created_by is not None:
        raise HTTPException(status_code=403, detail="Forbidden: You can only delete your own records")
    
    # Clean up associated requests if any
    db.query(models.Request).filter(models.Request.intervention_id == id).delete(synchronize_session=False)
        
    db.delete(intervention)
    db.commit()
    master_service.invalidate_master_cache()
    return {"message": "Success"}

@app.put("/api/interventions/{id}", response_model=schemas.InterventionResponse)
def update_intervention(id: int, intervention_data: schemas.InterventionUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    if current_user.role == "izleyici":
        raise HTTPException(status_code=403, detail="Forbidden")
    intervention = db.query(models.Intervention).filter(models.Intervention.id == id).first()
    if not intervention:
        raise HTTPException(status_code=404, detail="Not found")
    
    if current_user.role != "admin" and intervention.created_by != current_user.username and intervention.created_by != "GIS Envanter":
        raise HTTPException(status_code=403, detail="Forbidden: You can only edit your own records")
        
    target_category = intervention_data.category if intervention_data.category is not None else intervention.category
    target_asset_id = intervention_data.asset_id if intervention_data.asset_id is not None else intervention.asset_id
    target_category = str(target_category or "").strip()
    target_asset_id = str(target_asset_id or "").strip()

    if target_asset_id:
        existing = db.query(models.Intervention).filter(
            models.Intervention.sira_no == intervention.sira_no,
            models.Intervention.category == target_category,
            models.Intervention.asset_id == target_asset_id,
            models.Intervention.id != id
        ).first()
        if existing:
            raise HTTPException(
                status_code=400, 
                detail=f"Bu hatta '{target_asset_id}' Asset ID'si için '{target_category}' kategorisinde zaten başka bir kayıt mevcuttur."
            )

    if intervention_data.category is not None:
        intervention.category = target_category
    if intervention_data.asset_id is not None:
        intervention.asset_id = target_asset_id
    if intervention_data.description is not None:
        intervention.description = intervention_data.description
    if intervention_data.status is not None:
        intervention.status = intervention_data.status
    if intervention_data.length_km is not None:
        intervention.length_km = intervention_data.length_km
    if intervention_data.quantity is not None:
        intervention.quantity = intervention_data.quantity
    if intervention_data.intervention_unit is not None:
        intervention.intervention_unit = intervention_data.intervention_unit
    if intervention_data.asset_type is not None:
        intervention.asset_type = intervention_data.asset_type
    
    if intervention.created_by == "GIS Envanter" or current_user.username:
        intervention.created_by = current_user.username

    db.commit()
    db.refresh(intervention)
    master_service.invalidate_master_cache()
    return intervention

@app.put("/api/lines/{sira_no}")
def update_line(sira_no: int, payload: dict, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    if current_user.role == "izleyici":
        raise HTTPException(status_code=403, detail="Forbidden")
    
    line = db.query(models.Line).filter(models.Line.sira_no == sira_no).first()
    if not line:
        raise HTTPException(status_code=404, detail="Not found")
        
    if "siparis_no" in payload:
        line.siparis_no = payload["siparis_no"]
        
    db.commit()
    db.refresh(line)
    master_service.invalidate_master_cache()
    return line

@app.post("/api/lines", response_model=schemas.LineResponse)
def create_line(line_data: schemas.LineCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    if current_user.role == "izleyici":
        raise HTTPException(status_code=403, detail="İzleyici yetkisi ile yeni hat eklenemez.")
    
    from sqlalchemy import func
    max_sira = db.query(func.max(models.Line.sira_no)).scalar() or 0
    new_sira = max_sira + 1
    
    new_line = models.Line(
        sira_no=new_sira,
        dagitim_sirketi=line_data.dagitim_sirketi or "Toroslar EDAŞ",
        il=line_data.il,
        ilce=line_data.ilce,
        operasyon_merkezi=line_data.operasyon_merkezi,
        hat_ismi=line_data.hat_ismi,
        gerilim_seviyesi=line_data.gerilim_seviyesi or "OG",
        hat_uzunlugu=line_data.hat_uzunlugu or 0.0,
        mevcut_risk=line_data.mevcut_risk or "1. Derece Riskli",
        planlanan_bakim=line_data.planlanan_bakim,
        gerceklesen_bakim=line_data.gerceklesen_bakim,
        siparis_no=line_data.siparis_no or ""
    )
    db.add(new_line)
    db.commit()
    db.refresh(new_line)
    master_service.invalidate_master_cache()
    return new_line

@app.get("/api/stats/users")
def get_user_stats(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
        
    from sqlalchemy import func
    stats = db.query(
        models.Intervention.created_by.label("username"),
        func.count(models.Intervention.id).label("count")
    ).group_by(models.Intervention.created_by).order_by(func.count(models.Intervention.id).desc()).all()
    
    return [{"username": s.username, "count": s.count} for s in stats]

@app.get("/api/interventions/user/{username}", response_model=list[schemas.InterventionWithLineResponse])
def get_interventions_by_user(username: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    
    results = db.query(models.Intervention, models.Line).outerjoin(
        models.Line, models.Intervention.sira_no == models.Line.sira_no
    ).filter(models.Intervention.created_by == username).order_by(models.Intervention.created_at.desc()).all()
    
    resp = []
    for inv, line in results:
        resp.append({
            "id": inv.id,
            "sira_no": inv.sira_no,
            "category": inv.category,
            "asset_id": inv.asset_id,
            "description": inv.description,
            "status": inv.status,
            "length_km": inv.length_km,
            "quantity": inv.quantity,
            "intervention_unit": inv.intervention_unit,
            "created_at": inv.created_at,
            "created_by": inv.created_by,
            "flag_request": inv.flag_request,
            "line_name": line.hat_ismi if line else "Bilinmeyen Hat (Legacy/Orphan)",
            "il": line.il if line else None,
            "ilce": line.ilce if line else None,
            "operasyon_merkezi": line.operasyon_merkezi if line else None
        })
    return resp


@app.post("/api/interventions/{id}/request")
def create_intervention_request(id: int, payload: schemas.RequestCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    if current_user.role == "izleyici":
        raise HTTPException(status_code=403, detail="Forbidden")
    intervention = db.query(models.Intervention).filter(models.Intervention.id == id).first()
    if not intervention:
        raise HTTPException(status_code=404, detail="Not found")
    
    # Create the request
    req = models.Request(
        intervention_id=id,
        request_type=payload.request_type,
        new_data=payload.new_data,
        status="PENDING",
        requested_by=current_user.username
    )
    db.add(req)
    
    # Mark the intervention
    intervention.flag_request = "PENDING"
    
    db.commit()
    return {"message": "Talep iletildi"}

@app.get("/api/requests")
def list_requests(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
        
    requests = db.query(models.Request, models.Intervention).join(
        models.Intervention, models.Request.intervention_id == models.Intervention.id
    ).filter(models.Request.status == "PENDING").all()
    
    # We will format this nicely for the frontend
    result = []
    for req, inv in requests:
        result.append({
            "id": req.id,
            "intervention_id": inv.id,
            "asset_id": inv.asset_id,
            "category": inv.category,
            "old_status": inv.status,
            "old_description": inv.description,
            "request_type": req.request_type,
            "new_data": req.new_data,
            "requested_by": req.requested_by,
            "created_at": req.created_at.isoformat()
        })
    return result

@app.post("/api/requests/{id}/approve")
def approve_request(id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
        
    req = db.query(models.Request).filter(models.Request.id == id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Not found")
        
    intervention = db.query(models.Intervention).filter(models.Intervention.id == req.intervention_id).first()
    if not intervention:
        raise HTTPException(status_code=404, detail="Intervention not found")
        
    if req.request_type == "DELETE":
        db.delete(intervention)
    elif req.request_type == "UPDATE":
        import json
        if req.new_data:
            data = json.loads(req.new_data)
            if "status" in data:
                intervention.status = data["status"]
            if "description" in data:
                intervention.description = data["description"]
            if "length_km" in data and data["length_km"]:
                intervention.length_km = float(data["length_km"])
        intervention.flag_request = None
        
    req.status = "APPROVED"
    db.commit()
    master_service.invalidate_master_cache()
    return {"message": "Success"}

@app.post("/api/requests/{id}/reject")
def reject_request(id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
        
    req = db.query(models.Request).filter(models.Request.id == id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Not found")
        
    intervention = db.query(models.Intervention).filter(models.Intervention.id == req.intervention_id).first()
    if intervention:
        intervention.flag_request = None
        
    req.status = "REJECTED"
    db.commit()
    master_service.invalidate_master_cache()
    return {"message": "Success"}

@app.get("/api/summary/tender-extras")
def get_tender_extras(oms: str = None, db: Session = Depends(get_db)):
    target_oms = ['HATAY METROPOL', 'KIRIKHAN', 'REYHANLI']
    if oms and oms != "Tümü":
        target_oms = [oms.upper()]
        
    excel_map = get_ihale_excel_map()
            
    query = db.query(models.Intervention, models.Line).join(
        models.Line, models.Intervention.sira_no == models.Line.sira_no
    )
    
    extra_koridor_km = 0.0
    extra_budama_adet = 0
    
    for inv, line in query.all():
        line_om = str(line.operasyon_merkezi).strip().upper()
        if line_om not in target_oms:
            continue
            
        line_hat = str(line.hat_ismi).strip().upper()
        
        koridor_excel = excel_map.get((line_om, line_hat), {}).get("koridor", "YOK")
        budama_excel = excel_map.get((line_om, line_hat), {}).get("budama", "YOK")
        
        if inv.category == "Koridor Açma":
            if koridor_excel == "YOK" or koridor_excel == "":
                extra_koridor_km += float(inv.length_km or 0)
        elif inv.category == "Ağaç Budama":
            if budama_excel == "YOK" or budama_excel == "":
                extra_budama_adet += int(inv.quantity or 1)
                
    return {
        "extra_koridor_acma_km": round(extra_koridor_km, 2),
        "extra_agac_budama_adet": extra_budama_adet
    }

@app.put("/api/users/me/dashboard-preferences")
def update_dashboard_preferences(payload: schemas.DashboardPreferencesUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    current_user.dashboard_preferences = payload.dashboard_preferences
    db.commit()
    return {"message": "Dashboard preferences updated successfully"}

@app.post("/api/summary/custom-stats")
def get_custom_stats(payload: schemas.CustomStatRequest, db: Session = Depends(get_db)):
    q = db.query(models.Line)
    if payload.type == "om":
        q = q.filter(models.Line.operasyon_merkezi == payload.name)
    else:
        q = q.filter(models.Line.ilce == payload.name)
    
    total_lines = q.count()
    if total_lines == 0:
        return []
        
    lines = q.all()
    sira_nos = [l.sira_no for l in lines]
    
    categories = ["Ağaç Budama", "Koridor Açma", "Beton Dökümü", "Güzergah Değişimi", "Operasyon Müdahalesi"]
    
    interventions = db.query(
        models.Intervention.sira_no,
        models.Intervention.category,
        models.Intervention.status
    ).filter(
        models.Intervention.sira_no.in_(sira_nos)
    ).order_by(models.Intervention.created_at.asc()).all()
    
    latest_interventions = {}
    for inv in interventions:
        key = (inv.sira_no, inv.category)
        latest_interventions[key] = inv.status
        
    results = []
    for cat in categories:
        yapildi = 0
        yapilmadi = 0
        
        for sira_no in sira_nos:
            stat_str = latest_interventions.get((sira_no, cat))
            if stat_str is not None:
                status = get_overall_intervention_status(stat_str)
                if status == "Yapıldı":
                    yapildi += 1
                else: # Yapılmadı veya Bekliyor ise
                    yapilmadi += 1
                
        results.append({
            "category": cat,
            "yapildi": yapildi,
            "yapilmadi": yapilmadi,
            "gerek_yok": total_lines - (yapildi + yapilmadi)
        })
        
    return results

@app.get("/api/users", response_model=list[schemas.UserResponse])
def get_users(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    return db.query(models.User).all()

@app.post("/api/users", response_model=schemas.UserResponse)
def create_user(user: schemas.UserCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    
    existing_user = db.query(models.User).filter(models.User.username == user.username).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Username already registered")
        
    hashed_password = auth.get_password_hash(user.password)
    encrypted_password = encrypt_password(user.password)
    db_user = models.User(
        username=user.username,
        password_hash=hashed_password,
        password_encrypted=encrypted_password,
        role=user.role,
        default_il="Tümü",
        default_oms="Tümü"
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

@app.put("/api/users/{username}", response_model=schemas.UserResponse)
def update_user(username: str, user: schemas.UserUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
        
    db_user = db.query(models.User).filter(models.User.username == username).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
        
    if user.password:
        db_user.password_hash = auth.get_password_hash(user.password)
        db_user.password_encrypted = encrypt_password(user.password)
    db_user.role = user.role
    
    db.commit()
    db.refresh(db_user)
    return db_user

@app.post("/api/users/{username}/reveal")
def reveal_user_password(username: str, req: schemas.PasswordRevealRequest, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
        
    # Verify admin password
    if not auth.verify_password(req.admin_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Girdiğiniz admin şifresi hatalı.")
        
    # Find the target user
    db_user = db.query(models.User).filter(models.User.username == username).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı.")
        
    if not db_user.password_encrypted:
        raise HTTPException(status_code=400, detail="Bu kullanıcının şifresi eski formatta (şifrelenmemiş) saklanmış. Lütfen şifresini güncelleyin.")
        
    try:
        decrypted = decrypt_password(db_user.password_encrypted)
        return {"username": username, "password": decrypted}
    except Exception as e:
        raise HTTPException(status_code=500, detail="Şifre çözme hatası oluştu.")

@app.delete("/api/users/{username}")
def delete_user(username: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
        
    if username == current_user.username:
        raise HTTPException(status_code=400, detail="Kendi yöneticisi hesabınızı silemezsiniz.")
        
    db_user = db.query(models.User).filter(models.User.username == username).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı.")
        
    db.delete(db_user)
    db.commit()
    return {"message": "Kullanıcı başarıyla silindi."}

@app.get("/api/export/preview")
def get_export_preview(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    return master_service.build_all_master_lines(db)



def generate_excel_file(db: Session):
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
    return output

@app.get("/api/export/excel")
def export_excel(db: Session = Depends(get_db)):
    output = generate_excel_file(db)
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": "attachment; filename=Merkez_Raporu_Guncel.xlsx",
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0"
        }
    )

def generate_detailed_excel_file(db: Session):
    import xlsxwriter
    from io import BytesIO
    from collections import defaultdict
    import pandas as pd

    output = BytesIO()
    wb = xlsxwriter.Workbook(output, {'in_memory': True})
    
    # --- Format Tanımları ---
    hdr_format = wb.add_format({
        'bold': True, 'font_color': 'white', 'bg_color': '#4F81BD',
        'align': 'center', 'valign': 'vcenter', 'border': 1
    })
    hdr_red = wb.add_format({
        'bold': True, 'font_color': 'white', 'bg_color': '#C00000',
        'align': 'center', 'valign': 'vcenter', 'border': 1
    })
    hdr_teal = wb.add_format({
        'bold': True, 'font_color': 'white', 'bg_color': '#1E6B7B',
        'align': 'center', 'valign': 'vcenter', 'border': 1
    })
    hdr_amber = wb.add_format({
        'bold': True, 'font_color': 'white', 'bg_color': '#B25900',
        'align': 'center', 'valign': 'vcenter', 'border': 1
    })

    border_format = wb.add_format({'border': 1, 'valign': 'vcenter'})
    center_format = wb.add_format({'border': 1, 'align': 'center', 'valign': 'vcenter'})
    title_format = wb.add_format({'bold': True, 'size': 14, 'font_color': '#1F497D'})
    sub_title_format = wb.add_format({'italic': True, 'font_color': '#595959', 'size': 9})
    sec_title_fmt = wb.add_format({'bold': True, 'size': 11, 'font_color': '#1F497D'})
    label_format = wb.add_format({'bold': True, 'align': 'right', 'valign': 'vcenter'})
    input_format = wb.add_format({'bg_color': '#FFF2CC', 'border': 1, 'locked': False})
    info_format = wb.add_format({'italic': True, 'font_color': '#7F7F7F'})
    date_format = wb.add_format({'border': 1, 'num_format': 'dd.mm.yyyy hh:mm', 'valign': 'vcenter'})
    date_col_format = wb.add_format({'num_format': 'dd.mm.yyyy hh:mm'})
    
    num_fmt = wb.add_format({'border': 1, 'align': 'center', 'valign': 'vcenter', 'num_format': '#,##0'})
    dec_fmt = wb.add_format({'border': 1, 'align': 'center', 'valign': 'vcenter', 'num_format': '#,##0.00'})
    pct_fmt = wb.add_format({'border': 1, 'align': 'center', 'valign': 'vcenter', 'num_format': '0.0%'})

    tot_label = wb.add_format({'bold': True, 'bg_color': '#D9E2F3', 'border': 1, 'valign': 'vcenter'})
    tot_num = wb.add_format({'bold': True, 'bg_color': '#D9E2F3', 'border': 1, 'align': 'center', 'valign': 'vcenter', 'num_format': '#,##0'})
    tot_dec = wb.add_format({'bold': True, 'bg_color': '#D9E2F3', 'border': 1, 'align': 'center', 'valign': 'vcenter', 'num_format': '#,##0.00'})
    tot_pct = wb.add_format({'bold': True, 'bg_color': '#D9E2F3', 'border': 1, 'align': 'center', 'valign': 'vcenter', 'num_format': '0.0%'})

    excel_map = get_ihale_excel_map()
    
    # Verileri Çek
    query = db.query(models.Intervention, models.Line).outerjoin(
        models.Line, models.Intervention.sira_no == models.Line.sira_no
    ).order_by(models.Intervention.created_at.desc())
    all_data = query.all()

    # İhale istatistiklerini hesaplamak için veri gruplama
    budama_stats = defaultdict(lambda: {'total': 0, 'in_tender': 0, 'out_tender': 0})
    koridor_stats = defaultdict(lambda: {'total': 0.0, 'in_tender': 0.0, 'out_tender': 0.0})
    om_summary_stats = defaultdict(lambda: {
        'budama_total': 0, 'budama_in': 0, 'budama_out': 0,
        'koridor_total': 0.0, 'koridor_in': 0.0, 'koridor_out': 0.0
    })

    # --- SAYFA 3: Veri Kaynağı ---
    ws_data = wb.add_worksheet("Veri Kaynağı")

    headers = [
        "Sıra No", "Kayıt Tarihi", "İl", "İlçe", "Operasyon Merkezi", 
        "Hat İsmi", "Direk / Asset ID", "Müdahale Kategorisi", 
        "Durum", "Adet", "Uzunluk (Km)", "Açıklama", "Müdahale Edecek Birim", "Kaydeden", "İhale Keşfi Durumu"
    ]
    
    # Başlıkları yaz
    for col_idx, header in enumerate(headers):
        ws_data.write(0, col_idx, header, hdr_format)
        
    row_idx = 1
    for inv, line in all_data:
        line_il = line.il if line else ""
        line_ilce = line.ilce if line else ""
        line_om = str(line.operasyon_merkezi).strip().upper() if line and line.operasyon_merkezi else ""
        line_hat = str(line.hat_ismi).strip().upper() if line and line.hat_ismi else ""
        
        koridor_excel = excel_map.get((line_om, line_hat), {}).get("koridor", "YOK")
        budama_excel = excel_map.get((line_om, line_hat), {}).get("budama", "YOK")
        
        ihale_status_text = "-"
        if inv.category == "Ağaç Budama":
            is_in = (budama_excel != "YOK" and budama_excel != "")
            ihale_status_text = "İhale Keşfinde Var" if is_in else "İhale Keşfinde Yok"
            qty = int(inv.quantity) if inv.quantity else 1
            
            key = (line_il, line_ilce, line.operasyon_merkezi if line else "")
            budama_stats[key]['total'] += qty
            om_summary_stats[line.operasyon_merkezi if line else "Bilinmeyen"]['budama_total'] += qty
            if is_in:
                budama_stats[key]['in_tender'] += qty
                om_summary_stats[line.operasyon_merkezi if line else "Bilinmeyen"]['budama_in'] += qty
            else:
                budama_stats[key]['out_tender'] += qty
                om_summary_stats[line.operasyon_merkezi if line else "Bilinmeyen"]['budama_out'] += qty
                
        elif inv.category == "Koridor Açma":
            is_in = (koridor_excel != "YOK" and koridor_excel != "")
            ihale_status_text = "İhale Keşfinde Var" if is_in else "İhale Keşfinde Yok"
            length = float(inv.length_km) if inv.length_km else 0.0
            
            key = (line_il, line_ilce, line.operasyon_merkezi if line else "")
            koridor_stats[key]['total'] += length
            om_summary_stats[line.operasyon_merkezi if line else "Bilinmeyen"]['koridor_total'] += length
            if is_in:
                koridor_stats[key]['in_tender'] += length
                om_summary_stats[line.operasyon_merkezi if line else "Bilinmeyen"]['koridor_in'] += length
            else:
                koridor_stats[key]['out_tender'] += length
                om_summary_stats[line.operasyon_merkezi if line else "Bilinmeyen"]['koridor_out'] += length

        ws_data.write(row_idx, 0, inv.sira_no, border_format)
        if inv.created_at:
            ws_data.write_datetime(row_idx, 1, inv.created_at, date_format)
        else:
            ws_data.write(row_idx, 1, "", border_format)
            
        ws_data.write(row_idx, 2, line_il, border_format)
        ws_data.write(row_idx, 3, line_ilce, border_format)
        ws_data.write(row_idx, 4, line.operasyon_merkezi if line else "", border_format)
        ws_data.write(row_idx, 5, line.hat_ismi if line else "", border_format)
        ws_data.write(row_idx, 6, inv.asset_id, border_format)
        ws_data.write(row_idx, 7, inv.category, border_format)
        ws_data.write(row_idx, 8, inv.status, border_format)
        ws_data.write(row_idx, 9, inv.quantity, border_format)
        ws_data.write(row_idx, 10, inv.length_km, border_format)
        ws_data.write(row_idx, 11, inv.description, border_format)
        ws_data.write(row_idx, 12, inv.intervention_unit or "BELLİ DEĞİL", border_format)
        ws_data.write(row_idx, 13, inv.created_by, border_format)
        ws_data.write(row_idx, 14, ihale_status_text, center_format)
        row_idx += 1

    # Sütun genişliklerini ayarla ve AutoFilter ekle
    for col_idx in range(len(headers)):
        ws_data.set_column(col_idx, col_idx, 18)
    ws_data.set_column(11, 11, 40) # Açıklama daha geniş olsun
    ws_data.set_column(14, 14, 22) # İhale Keşfi Durumu
    
    ws_data.autofilter(0, 0, row_idx - 1, len(headers) - 1)
    ws_data.freeze_panes(1, 0)

    # --- SAYFA 2: İhale Keşif Özeti ---
    ws_sum = wb.add_worksheet("İhale Keşif Özeti")
    ws_sum.set_column('A:A', 3)
    ws_sum.set_column('B:B', 14)
    ws_sum.set_column('C:C', 18)
    ws_sum.set_column('D:D', 22)
    ws_sum.set_column('E:G', 24)
    ws_sum.set_column('H:H', 20)

    ws_sum.write('B2', "İHALE KEŞFİ VE İHALE DIŞI MÜDAHALE ANALİZİ", title_format)
    ws_sum.write('B3', "Ağaç Budama (Adet) ve Koridor Açma (Km) kategorilerinde ihale keşfinde olan ve olmayan müdahalelerin ilçe bazlı icmali.", sub_title_format)

    # Tablo 1: Ağaç Budama
    r_idx = 4
    ws_sum.write(r_idx, 1, "1. AĞAÇ BUDAMA (ADET) - İLÇE BAZLI İHALE ANALİZİ", sec_title_fmt)
    r_idx += 1
    headers_b = ["İl", "İlçe", "Operasyon Merkezi", "Toplam Budama (Adet)", "İhale Keşfinde Var (Adet)", "İhale Keşfinde Yok (Ekstra)", "İhale Dışı Oranı (%)"]
    for c_idx, h in enumerate(headers_b):
        ws_sum.write(r_idx, 1 + c_idx, h, hdr_red)
    r_idx += 1

    t_tot_b, t_in_b, t_out_b = 0, 0, 0
    sorted_b_keys = sorted(budama_stats.keys(), key=lambda x: (x[0] or "", x[1] or ""))
    for il, ilce, om in sorted_b_keys:
        st = budama_stats[(il, ilce, om)]
        t_tot_b += st['total']
        t_in_b += st['in_tender']
        t_out_b += st['out_tender']
        pct = (st['out_tender'] / st['total']) if st['total'] > 0 else 0.0
        
        ws_sum.write(r_idx, 1, il, border_format)
        ws_sum.write(r_idx, 2, ilce, border_format)
        ws_sum.write(r_idx, 3, om, border_format)
        ws_sum.write(r_idx, 4, st['total'], num_fmt)
        ws_sum.write(r_idx, 5, st['in_tender'], num_fmt)
        ws_sum.write(r_idx, 6, st['out_tender'], num_fmt)
        ws_sum.write(r_idx, 7, pct, pct_fmt)
        r_idx += 1

    pct_tot_b = (t_out_b / t_tot_b) if t_tot_b > 0 else 0.0
    ws_sum.write(r_idx, 1, "GENEL TOPLAM", tot_label)
    ws_sum.write(r_idx, 2, "", tot_label)
    ws_sum.write(r_idx, 3, "", tot_label)
    ws_sum.write(r_idx, 4, t_tot_b, tot_num)
    ws_sum.write(r_idx, 5, t_in_b, tot_num)
    ws_sum.write(r_idx, 6, t_out_b, tot_num)
    ws_sum.write(r_idx, 7, pct_tot_b, tot_pct)
    r_idx += 3

    # Tablo 2: Koridor Açma
    ws_sum.write(r_idx, 1, "2. KORİDOR AÇMA (KM) - İLÇE BAZLI İHALE ANALİZİ", sec_title_fmt)
    r_idx += 1
    headers_k = ["İl", "İlçe", "Operasyon Merkezi", "Toplam Koridor (Km)", "İhale Keşfinde Var (Km)", "İhale Keşfinde Yok (Ekstra)", "İhale Dışı Oranı (%)"]
    for c_idx, h in enumerate(headers_k):
        ws_sum.write(r_idx, 1 + c_idx, h, hdr_teal)
    r_idx += 1

    t_tot_k, t_in_k, t_out_k = 0.0, 0.0, 0.0
    sorted_k_keys = sorted(koridor_stats.keys(), key=lambda x: (x[0] or "", x[1] or ""))
    if sorted_k_keys:
        for il, ilce, om in sorted_k_keys:
            st = koridor_stats[(il, ilce, om)]
            t_tot_k += st['total']
            t_in_k += st['in_tender']
            t_out_k += st['out_tender']
            pct = (st['out_tender'] / st['total']) if st['total'] > 0 else 0.0
            
            ws_sum.write(r_idx, 1, il, border_format)
            ws_sum.write(r_idx, 2, ilce, border_format)
            ws_sum.write(r_idx, 3, om, border_format)
            ws_sum.write(r_idx, 4, st['total'], dec_fmt)
            ws_sum.write(r_idx, 5, st['in_tender'], dec_fmt)
            ws_sum.write(r_idx, 6, st['out_tender'], dec_fmt)
            ws_sum.write(r_idx, 7, pct, pct_fmt)
            r_idx += 1
    else:
        ws_sum.write(r_idx, 1, "Henüz Koridor Açma kaydı girilmemiştir.", border_format)
        for c in range(2, 8): ws_sum.write(r_idx, c, "", border_format)
        r_idx += 1

    pct_tot_k = (t_out_k / t_tot_k) if t_tot_k > 0 else 0.0
    ws_sum.write(r_idx, 1, "GENEL TOPLAM", tot_label)
    ws_sum.write(r_idx, 2, "", tot_label)
    ws_sum.write(r_idx, 3, "", tot_label)
    ws_sum.write(r_idx, 4, t_tot_k, tot_dec)
    ws_sum.write(r_idx, 5, t_in_k, tot_dec)
    ws_sum.write(r_idx, 6, t_out_k, tot_dec)
    ws_sum.write(r_idx, 7, pct_tot_k, tot_pct)
    r_idx += 3

    # Tablo 3: Operasyon Merkezi İcmali
    ws_sum.write(r_idx, 1, "3. OPERASYON MERKEZİ BAZLI GENEL İCMAL", sec_title_fmt)
    r_idx += 1
    headers_om = ["Operasyon Merkezi", "Budama Toplam (Adet)", "Budama İhale İçi", "Budama İhale Dışı", "Koridor Toplam (Km)", "Koridor İhale İçi", "Koridor İhale Dışı"]
    for c_idx, h in enumerate(headers_om):
        ws_sum.write(r_idx, 1 + c_idx, h, hdr_amber)
    r_idx += 1

    sorted_om_keys = sorted(om_summary_stats.keys())
    for om_name in sorted_om_keys:
        st = om_summary_stats[om_name]
        ws_sum.write(r_idx, 1, om_name, border_format)
        ws_sum.write(r_idx, 2, st['budama_total'], num_fmt)
        ws_sum.write(r_idx, 3, st['budama_in'], num_fmt)
        ws_sum.write(r_idx, 4, st['budama_out'], num_fmt)
        ws_sum.write(r_idx, 5, st['koridor_total'], dec_fmt)
        ws_sum.write(r_idx, 6, st['koridor_in'], dec_fmt)
        ws_sum.write(r_idx, 7, st['koridor_out'], dec_fmt)
        r_idx += 1

    ws_sum.write(r_idx, 1, "GENEL TOPLAM", tot_label)
    ws_sum.write(r_idx, 2, t_tot_b, tot_num)
    ws_sum.write(r_idx, 3, t_in_b, tot_num)
    ws_sum.write(r_idx, 4, t_out_b, tot_num)
    ws_sum.write(r_idx, 5, t_tot_k, tot_dec)
    ws_sum.write(r_idx, 6, t_in_k, tot_dec)
    ws_sum.write(r_idx, 7, t_out_k, tot_dec)

    # --- SAYFA 1: Arama Ekranı ---
    ws_search = wb.add_worksheet("Arama Ekranı")
    ws_search.protect('orman123')
    
    # Görsel düzenleme
    ws_search.set_column(0, 0, 5)   # A
    ws_search.set_column(1, 1, 25)  # B
    ws_search.set_column(2, 2, 30)  # C
    
    ws_search.write('B2', "GELİŞMİŞ ARAMA VE FİLTRELEME EKRANI", title_format)
    ws_search.write('E2', "Arama kutularına kelime veya harf girin. Aşağıdaki tablo anında filtrelenecektir.", info_format)
    
    # Arama Kutuları (Form)
    search_fields = [
        ("Direk No (Asset ID)", 4, "G"),
        ("İl", 5, "C"),
        ("İlçe", 6, "D"),
        ("Operasyon Merkezi", 7, "E"),
        ("Hat İsmi", 8, "F"),
        ("Müdahale Kategorisi", 9, "H"),
        ("Durum", 10, "I"),
        ("Müdahale Edecek Birim", 11, "M"),
        ("İhale Keşfi Durumu", 12, "O")
    ]
    
    conditions = []
    
    for label, r, data_col in search_fields:
        row = r - 1
        ws_search.write(row, 1, f"{label}:", label_format)
        ws_search.write_blank(row, 2, "", input_format)
        
        conditions.append(f"IF(ISBLANK($C${r}), 1, ISNUMBER(SEARCH($C${r}, 'Veri Kaynağı'!${data_col}$2:${data_col}$10000)))")
    
    # Tablo Başlıkları (Satır 14)
    start_row = 13 # 0-based for row 14
    for col_idx, header in enumerate(headers):
        ws_search.write(start_row, col_idx, header, hdr_format)
        if col_idx == 1:
            ws_search.set_column(col_idx, col_idx, 18, date_col_format)
        elif col_idx == 11:
            ws_search.set_column(col_idx, col_idx, 40)
        elif col_idx == 12:
            ws_search.set_column(col_idx, col_idx, 25)
        elif col_idx == 14:
            ws_search.set_column(col_idx, col_idx, 22)
        else:
            ws_search.set_column(col_idx, col_idx, 18)
            
    # Dev FİLTRE Formülü (Satır 15)
    filter_formula = f'=FILTER(\'Veri Kaynağı\'!A2:O10000, ({" * ".join(conditions)}), "Kayıt Bulunamadı")'
    ws_search.write_dynamic_array_formula(start_row + 1, 0, start_row + 1, 0, filter_formula)
    
    ws_sum.activate()

    wb.close()
    output.seek(0)
    return output

@app.get("/api/export/excel/details")
def export_excel_details(db: Session = Depends(get_db)):
    output = generate_detailed_excel_file(db)
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": "attachment; filename=Detayli_Rapor.xlsx",
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0"
        }
    )


@app.post("/api/admin/migrate-assets")
def trigger_migration():
    from split_multiple_assets import main as migrate_multiple_assets
    
    import sys
    import io
    
    # Capture stdout to return the result
    old_stdout = sys.stdout
    sys.stdout = mystdout = io.StringIO()
    
    try:
        migrate_multiple_assets()
    finally:
        sys.stdout = old_stdout
        
    return {"status": "success", "log": mystdout.getvalue()}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
