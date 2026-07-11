from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from database import Base
import datetime

class User(Base):
    __tablename__ = "users"
    username = Column(String, primary_key=True, index=True)
    password_hash = Column(String, nullable=False)
    role = Column(String, nullable=False)
    default_il = Column(String)
    default_oms = Column(String)
    dashboard_preferences = Column(String, default="[]")

class Line(Base):
    __tablename__ = "lines"
    sira_no = Column("Sıra No", Integer, primary_key=True)
    dagitim_sirketi = Column("Dağıtım Şirketi", String)
    il = Column("İl", String)
    ilce = Column("İlçe", String)
    operasyon_merkezi = Column("Operasyon Merkezi", String)
    hat_ismi = Column("Hat İsmi", String)
    gerilim_seviyesi = Column("Gerilim Seviyesi (AG/OG)", String)
    hat_uzunlugu = Column("Hat Uzunluğu (Km)", Float)
    mevcut_risk = Column("Mevcut Risk (1./2./3. Derece Riskli)", String)
    planlanan_bakim = Column("Planlanan Bakım Tarihi", DateTime)
    gerceklesen_bakim = Column("Gerçekleşen Bakım Tarihi", DateTime)
    siparis_no = Column("SİPARİŞ NUMARASI", String)

class Intervention(Base):
    __tablename__ = "interventions"
    id = Column(Integer, primary_key=True, autoincrement=True)
    sira_no = Column(Integer, ForeignKey("lines.Sıra No"))
    asset_id = Column(String)
    category = Column(String)
    description = Column(String)
    status = Column(String)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    length_km = Column(Float, nullable=True)
    quantity = Column(Integer, default=1)
    created_by = Column(String)
    flag_request = Column(String, nullable=True)

class Request(Base):
    __tablename__ = "requests"
    id = Column(Integer, primary_key=True, autoincrement=True)
    intervention_id = Column(Integer, ForeignKey("interventions.id"))
    request_type = Column(String, nullable=False)
    new_data = Column(String)
    status = Column(String, default="PENDING")
    requested_by = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
