import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.declarative import declarative_base

# Load .env file manually if it exists to populate os.environ locally, only when not on Cloud Run
if "K_SERVICE" not in os.environ:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    env_path = os.path.join(BASE_DIR, '.env')
    if os.path.exists(env_path):
        with open(env_path, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, val = line.split('=', 1)
                    k = key.strip()
                    if k not in os.environ:
                        os.environ[k] = val.strip()

SQLALCHEMY_DATABASE_URL = os.environ.get("POSTGRES_URL")

if SQLALCHEMY_DATABASE_URL:
    # Production PostgreSQL connection
    connect_args = {}
else:
    # Local fallback to SQLite database
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    DB_PATH = os.path.join(BASE_DIR, 'database.db')
    SQLALCHEMY_DATABASE_URL = f"sqlite:///{DB_PATH}"
    connect_args = {"check_same_thread": False}

# Add check_same_thread=False only for SQLite
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args=connect_args
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
