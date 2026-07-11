import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from models import Base, Intervention, Request, User, Line

# Paths & URLs
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SQLITE_URL = f"sqlite:///{os.path.join(BASE_DIR, 'database.db')}"

POSTGRES_URL = os.environ.get("POSTGRES_URL")

def migrate():
    if not POSTGRES_URL:
        print("Error: POSTGRES_URL environment variable is not set.")
        return

    print("Connecting to SQLite...")
    sqlite_engine = create_engine(SQLITE_URL)
    SqliteSession = sessionmaker(bind=sqlite_engine)
    sqlite_session = SqliteSession()

    print("Connecting to PostgreSQL...")
    postgres_engine = create_engine(POSTGRES_URL)
    
    print("Dropping and recreating tables in PostgreSQL...")
    Base.metadata.drop_all(postgres_engine)
    Base.metadata.create_all(postgres_engine)
    
    PostgresSession = sessionmaker(bind=postgres_engine)
    postgres_session = PostgresSession()

    try:
        # 1. Migrate Users
        print("Migrating Users...")
        sqlite_users = sqlite_session.query(User).all()
        for su in sqlite_users:
            new_user = User(
                username=su.username,
                password_hash=su.password_hash,
                role=su.role,
                default_il=su.default_il,
                default_oms=su.default_oms,
                dashboard_preferences=su.dashboard_preferences
            )
            postgres_session.add(new_user)
        postgres_session.commit()
        
        # 2. Migrate Lines
        print("Migrating Lines...")
        sqlite_lines = sqlite_session.query(Line).all()
        seen_sira_no = set()
        for sl in sqlite_lines:
            if sl.sira_no in seen_sira_no:
                continue
            new_line = Line(
                sira_no=sl.sira_no,
                dagitim_sirketi=sl.dagitim_sirketi,
                il=sl.il,
                ilce=sl.ilce,
                operasyon_merkezi=sl.operasyon_merkezi,
                hat_ismi=sl.hat_ismi,
                gerilim_seviyesi=sl.gerilim_seviyesi,
                hat_uzunlugu=sl.hat_uzunlugu,
                mevcut_risk=sl.mevcut_risk,
                planlanan_bakim=sl.planlanan_bakim,
                gerceklesen_bakim=sl.gerceklesen_bakim,
                siparis_no=sl.siparis_no
            )
            postgres_session.add(new_line)
            seen_sira_no.add(sl.sira_no)
        postgres_session.commit()

        # 3. Migrate Interventions
        print("Migrating Interventions...")
        sqlite_intervs = sqlite_session.query(Intervention).all()
        seen_intervention_ids = set()
        for si in sqlite_intervs:
            if si.id in seen_intervention_ids:
                continue
            new_interv = Intervention(
                id=si.id,
                sira_no=si.sira_no if si.sira_no in seen_sira_no else None,
                asset_id=si.asset_id,
                category=si.category,
                description=si.description,
                status=si.status,
                created_at=si.created_at,
                length_km=si.length_km,
                quantity=si.quantity,
                created_by=si.created_by,
                flag_request=si.flag_request
            )
            postgres_session.add(new_interv)
            seen_intervention_ids.add(si.id)
        postgres_session.commit()

        # 4. Migrate Requests
        print("Migrating Requests...")
        sqlite_reqs = sqlite_session.query(Request).all()
        for sr in sqlite_reqs:
            if sr.intervention_id not in seen_intervention_ids:
                continue
            new_req = Request(
                id=sr.id,
                intervention_id=sr.intervention_id,
                request_type=sr.request_type,
                new_data=sr.new_data,
                status=sr.status,
                requested_by=sr.requested_by,
                created_at=sr.created_at
            )
            postgres_session.add(new_req)
        postgres_session.commit()

        print("Migration complete!")
        
    except Exception as e:
        print("Error during migration:", e)
        postgres_session.rollback()
    finally:
        sqlite_session.close()
        postgres_session.close()

if __name__ == "__main__":
    migrate()
