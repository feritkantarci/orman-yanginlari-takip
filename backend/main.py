from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from datetime import timedelta
import models, schemas, auth
from database import engine, get_db

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Orman Yangınları API")

# Setup CORS for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # For dev only, use explicit frontend URL in prod
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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

@app.get("/api/lines", response_model=list[schemas.LineResponse])
def get_lines(il: str = None, oms: str = None, db: Session = Depends(get_db)):
    # This will be optimized to join interventions, but for now we fetch lines
    query = db.query(models.Line)
    if il and il != "Tümü":
        query = query.filter(models.Line.il == il)
    if oms and oms != "Tümü":
        query = query.filter(models.Line.operasyon_merkezi == oms)
    
    lines = query.all()
    
    # Fetch all interventions to aggregate counts based on LATEST status per asset_id
    interventions = db.query(
        models.Intervention.sira_no,
        models.Intervention.category,
        models.Intervention.asset_id,
        models.Intervention.status,
        models.Intervention.created_at
    ).order_by(models.Intervention.created_at.asc()).all()
    
    # Keep only the latest status for each (sira_no, category, asset_id)
    latest_interventions = {}
    for inv in interventions:
        key = (inv.sira_no, inv.category, inv.asset_id)
        latest_interventions[key] = inv.status
        
    stats_map = {}
    for (sira_no, cat, asset_id), stat in latest_interventions.items():
        if sira_no not in stats_map:
            stats_map[sira_no] = {}
        if cat not in stats_map[sira_no]:
            stats_map[sira_no][cat] = {'Yapıldı': 0, 'Yapılmadı': 0, 'Bekliyor': 0}
        
        if stat in stats_map[sira_no][cat]:
            stats_map[sira_no][cat][stat] += 1
        else:
            stats_map[sira_no][cat][stat] = 1
        
    def get_count(sira, cat, stat):
        return stats_map.get(sira, {}).get(cat, {}).get(stat, 0)

    from sqlalchemy.orm import class_mapper
    result = []
    for line in lines:
        l_dict = {c.key: getattr(line, c.key) for c in class_mapper(line.__class__).column_attrs}
        
        # Add aggregated fields
        l_dict['agac_budama_ok'] = get_count(line.sira_no, 'Ağaç Budama', 'Yapıldı')
        l_dict['agac_budama_nok'] = get_count(line.sira_no, 'Ağaç Budama', 'Yapılmadı') + get_count(line.sira_no, 'Ağaç Budama', 'Bekliyor')
        
        l_dict['guzergah_degisimi_ok'] = get_count(line.sira_no, 'Güzergah Değişimi', 'Yapıldı')
        l_dict['guzergah_degisimi_nok'] = get_count(line.sira_no, 'Güzergah Değişimi', 'Yapılmadı') + get_count(line.sira_no, 'Güzergah Değişimi', 'Bekliyor')
        
        l_dict['beton_dokumu_ok'] = get_count(line.sira_no, 'Beton Dökümü', 'Yapıldı')
        l_dict['beton_dokumu_nok'] = get_count(line.sira_no, 'Beton Dökümü', 'Yapılmadı') + get_count(line.sira_no, 'Beton Dökümü', 'Bekliyor')
        
        l_dict['koridor_acma_ok'] = get_count(line.sira_no, 'Koridor Açma', 'Yapıldı')
        l_dict['koridor_acma_nok'] = get_count(line.sira_no, 'Koridor Açma', 'Yapılmadı') + get_count(line.sira_no, 'Koridor Açma', 'Bekliyor')
        
        l_dict['operasyon_mudahalesi_ok'] = get_count(line.sira_no, 'Operasyon Müdahalesi', 'Yapıldı')
        l_dict['operasyon_mudahalesi_nok'] = get_count(line.sira_no, 'Operasyon Müdahalesi', 'Yapılmadı') + get_count(line.sira_no, 'Operasyon Müdahalesi', 'Bekliyor')
        
        result.append(l_dict)
        
    return result

@app.get("/api/interventions/{sira_no}", response_model=list[schemas.InterventionResponse])
def get_interventions_for_line(sira_no: int, db: Session = Depends(get_db)):
    interventions = db.query(models.Intervention).filter(models.Intervention.sira_no == sira_no).order_by(models.Intervention.created_at.desc()).all()
    return interventions

@app.post("/api/interventions/{sira_no}", response_model=schemas.InterventionResponse)
def create_intervention(sira_no: int, intervention: schemas.InterventionCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    db_intervention = models.Intervention(
        **intervention.dict(),
        sira_no=sira_no,
        created_by=current_user.username
    )
    db.add(db_intervention)
    db.commit()
    db.refresh(db_intervention)
    return db_intervention

@app.put("/api/interventions/bulk-status")
def update_interventions_bulk(payload: schemas.InterventionBulkUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    db.query(models.Intervention).filter(models.Intervention.id.in_(payload.ids)).update({models.Intervention.status: payload.status}, synchronize_session=False)
    db.commit()
    return {"message": "Success"}

@app.get("/api/me")
def read_users_me(current_user: models.User = Depends(get_current_user)):
    return {"username": current_user.username, "role": current_user.role, "default_il": current_user.default_il, "default_oms": current_user.default_oms}

@app.put("/api/me/defaults")
def update_user_defaults(payload: schemas.UserDefaultsUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    current_user.default_il = payload.default_il
    current_user.default_oms = payload.default_oms
    db.commit()
    return {"message": "Defaults updated successfully"}

@app.delete("/api/interventions/{id}")
def delete_intervention(id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    intervention = db.query(models.Intervention).filter(models.Intervention.id == id).first()
    if not intervention:
        raise HTTPException(status_code=404, detail="Not found")
    
    if current_user.role != "admin" and intervention.created_by != current_user.username:
        raise HTTPException(status_code=403, detail="Forbidden: You can only delete your own records")
        
    db.delete(intervention)
    db.commit()
    return {"message": "Success"}

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

@app.post("/api/interventions/{id}/request")
def create_intervention_request(id: int, payload: schemas.RequestCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
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
    return {"message": "Success"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
