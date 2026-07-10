import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.declarative import declarative_base

# Path to the existing SQLite database
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# The database is in ../app/database.db
DB_PATH = os.path.join(BASE_DIR, '..', 'app', 'database.db')

SQLALCHEMY_DATABASE_URL = f"sqlite:///{DB_PATH}"

# Add check_same_thread=False for SQLite
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
