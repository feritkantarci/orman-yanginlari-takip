from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class InterventionBase(BaseModel):
    category: str
    asset_id: str
    description: str
    status: str
    length_km: Optional[float] = None
    quantity: Optional[int] = 1
    intervention_unit: Optional[str] = "BELLİ DEĞİL"
    asset_type: Optional[str] = "DİREK"

class InterventionCreate(InterventionBase):
    pass

class InterventionUpdate(BaseModel):
    category: Optional[str] = None
    asset_id: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    length_km: Optional[float] = None
    quantity: Optional[int] = None
    intervention_unit: Optional[str] = None
    asset_type: Optional[str] = None

class InterventionBulkUpdate(BaseModel):
    ids: List[int]
    status: str

class InterventionBulkDelete(BaseModel):
    ids: List[int]

class InterventionResponse(InterventionBase):
    id: int
    sira_no: Optional[int] = None
    created_at: datetime
    created_by: str
    flag_request: Optional[str] = None

    class Config:
        from_attributes = True

class InterventionWithLineResponse(InterventionResponse):
    line_name: Optional[str] = None
    il: Optional[str] = None
    ilce: Optional[str] = None
    operasyon_merkezi: Optional[str] = None
class LineCreate(BaseModel):
    dagitim_sirketi: Optional[str] = "Toroslar EDAŞ"
    il: str
    ilce: str
    operasyon_merkezi: str
    hat_ismi: str
    gerilim_seviyesi: Optional[str] = "OG"
    hat_uzunlugu: Optional[float] = 0.0
    mevcut_risk: Optional[str] = "1. Derece Riskli"
    planlanan_bakim: Optional[datetime] = None
    gerceklesen_bakim: Optional[datetime] = None
    siparis_no: Optional[str] = ""

class LineResponse(BaseModel):
    sira_no: int
    dagitim_sirketi: Optional[str] = None
    il: Optional[str] = None
    ilce: Optional[str] = None
    operasyon_merkezi: Optional[str] = None
    hat_ismi: Optional[str] = None
    gerilim_seviyesi: Optional[str] = None
    hat_uzunlugu: Optional[float] = None
    mevcut_risk: Optional[str] = None
    planlanan_bakim: Optional[datetime] = None
    gerceklesen_bakim: Optional[datetime] = None
    siparis_no: Optional[str] = None
    
    # Inspection & Master stats
    kontrol_durumu: Optional[str] = "VARLIK YOK"
    varlik_sayilari: Optional[dict] = None
    varliklar: Optional[list] = None
    asset_ids: Optional[list] = None
    asset_ids_str: Optional[str] = None
    unit_stats: Optional[dict] = None
    
    # Aggregated fields (dynamic)
    agac_budama_ok: int = 0
    agac_budama_nok: int = 0
    guzergah_degisimi_ok: int = 0
    guzergah_degisimi_nok: int = 0
    beton_dokumu_ok: int = 0
    beton_dokumu_nok: int = 0
    koridor_acma_ok: int = 0
    koridor_acma_nok: Optional[int] = 0
    operasyon_mudahalesi_ok: Optional[int] = 0
    operasyon_mudahalesi_nok: Optional[int] = 0
    ihale_koridor: Optional[bool] = False
    ihale_budama: Optional[bool] = False
    son_durum: Optional[str] = "YAPILMADI"
    intervention_units: Optional[str] = ""
    intervention_statuses: Optional[str] = ""

    agac_budama: Optional[dict] = None
    guzergah_degisimi: Optional[dict] = None
    beton_dokumu: Optional[dict] = None
    koridor_acma: Optional[dict] = None
    operasyon_mudahalesi: Optional[dict] = None

    class Config:
        from_attributes = True

class UserLogin(BaseModel):
    username: str
    password: str

class UserDefaultsUpdate(BaseModel):
    default_il: Optional[str] = None
    default_oms: Optional[str] = None

class DashboardPreferencesUpdate(BaseModel):
    dashboard_preferences: str

class CustomStatRequest(BaseModel):
    type: str
    name: str

class RequestCreate(BaseModel):
    request_type: str
    new_data: Optional[str] = None

class RequestResponse(BaseModel):
    id: int
    intervention_id: int
    request_type: str
    new_data: Optional[str] = None
    status: str
    requested_by: str
    created_at: datetime
    
    class Config:
        orm_mode = True

class UserBase(BaseModel):
    role: str

class UserCreate(UserBase):
    username: str
    password: str

class UserUpdate(UserBase):
    password: Optional[str] = None

class UserResponse(UserBase):
    username: str
    default_il: Optional[str] = None
    default_oms: Optional[str] = None
    
    class Config:
        from_attributes = True

class PasswordRevealRequest(BaseModel):
    admin_password: str

