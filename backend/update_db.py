import os
import hashlib
import base64
from sqlalchemy import text
from sqlalchemy.orm import Session
from database import engine, SessionLocal
import models
import auth
from cryptography.fernet import Fernet

def hash_password(password):
    return hashlib.sha256(password.encode()).hexdigest()

def encrypt_password(password):
    # Derive a 32-byte key from auth.SECRET_KEY using SHA256
    key = hashlib.sha256(auth.SECRET_KEY.encode()).digest()
    fernet = Fernet(base64.urlsafe_b64encode(key))
    return fernet.encrypt(password.encode()).decode()

def update_db():
    print("Updating database using SQLAlchemy...")
    
    # Create tables if they do not exist
    models.Base.metadata.create_all(bind=engine)
    
    # Run migration to add password_encrypted column if it doesn't exist
    db = SessionLocal()
    try:
        db.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS password_encrypted VARCHAR"))
        db.commit()
        print("Added password_encrypted column to users table if not existed.")
    except Exception as e:
        print("Migration warning (password_encrypted column might already exist or IF NOT EXISTS not supported by SQL dialect):", e)
        db.rollback()
        # Fallback for SQLite which doesn't support ADD COLUMN IF NOT EXISTS directly
        try:
            db.execute(text("ALTER TABLE users ADD COLUMN password_encrypted VARCHAR"))
            db.commit()
            print("Added password_encrypted column to users table.")
        except Exception as sqlite_err:
            print("SQLite Migration warning (column probably already exists):", sqlite_err)
            db.rollback()
            
    # Run migration to add intervention_unit column if it doesn't exist
    try:
        db.execute(text("ALTER TABLE interventions ADD COLUMN IF NOT EXISTS intervention_unit VARCHAR DEFAULT 'BELLİ DEĞİL'"))
        db.commit()
        print("Added intervention_unit column to interventions table if not existed.")
    except Exception as e:
        print("Migration warning (intervention_unit column might already exist or IF NOT EXISTS not supported):", e)
        db.rollback()
        # Fallback for SQLite
        try:
            db.execute(text("ALTER TABLE interventions ADD COLUMN intervention_unit VARCHAR DEFAULT 'BELLİ DEĞİL'"))
            db.commit()
            print("Added intervention_unit column to interventions table.")
        except Exception as sqlite_err:
            print("SQLite Migration warning (column probably already exists):", sqlite_err)
            db.rollback()
            
    try:
        # Create or update default users and encrypt their passwords
        # 1. Admin
        admin_user = db.query(models.User).filter(models.User.username == 'admin').first()
        if not admin_user:
            admin_user = models.User(
                username='admin',
                password_hash=hash_password('Fk.2238893'),
                password_encrypted=encrypt_password('Fk.2238893'),
                role='admin',
                default_il='Tümü',
                default_oms='Tümü'
            )
            db.add(admin_user)
            print("Created admin user.")
        else:
            admin_user.password_hash = hash_password('Fk.2238893')
            admin_user.password_encrypted = encrypt_password('Fk.2238893')
            admin_user.role = 'admin'
            print("Updated admin user password and encrypted password.")
            
        # 2. Ahmet
        ahmet_user = db.query(models.User).filter(models.User.username == 'ahmet').first()
        if not ahmet_user:
            ahmet_user = models.User(
                username='ahmet',
                password_hash=hash_password('123456'),
                password_encrypted=encrypt_password('123456'),
                role='user',
                default_il='Tümü',
                default_oms='Tümü'
            )
            db.add(ahmet_user)
            print("Created ahmet user.")
        else:
            ahmet_user.password_hash = hash_password('123456')
            ahmet_user.password_encrypted = encrypt_password('123456')
            ahmet_user.role = 'user'
            print("Updated ahmet user password and encrypted password.")
            
        db.commit()
        print("Database update complete.")
    except Exception as e:
        print("Error updating database users:", e)
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    update_db()
