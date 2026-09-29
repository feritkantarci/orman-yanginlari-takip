import pandas as pd
import os
import models
from database import engine, SessionLocal

def init_db():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    excel_path = os.path.join(base_dir, 'Kopya Ormanlık Alan Bakım Takip - Toroslar.xlsx')

    print(f"Reading excel from: {excel_path}")
    
    if not os.path.exists(excel_path):
        print(f"Error: Excel file not found at {excel_path}")
        return

    # Read the excel file (skip the first two rows which are title and empty)
    df = pd.read_excel(excel_path, header=2)

    # Clean column names (strip whitespace and newlines)
    df.columns = [str(c).strip().replace('\n', ' ') for c in df.columns]

    print("Columns found:")
    for col in df.columns:
        print(f" - {col}")

    # Ensure date columns are parsed correctly for PostgreSQL
    df['Planlanan Bakım Tarihi'] = pd.to_datetime(df['Planlanan Bakım Tarihi'], errors='coerce')
    df['Gerçekleşen Bakım Tarihi'] = pd.to_datetime(df['Gerçekleşen Bakım Tarihi'], errors='coerce')

    # Create tables if not exist
    print("Creating tables if they do not exist...")
    models.Base.metadata.create_all(bind=engine)

    # Clean existing lines to avoid duplicates
    print("Clearing old lines data...")
    db = SessionLocal()
    try:
        db.query(models.Line).delete()
        db.commit()
    except Exception as e:
        print("Error clearing lines table:", e)
        db.rollback()
    finally:
        db.close()

    # Save lines to database using SQLAlchemy engine connection
    print("Saving lines to database...")
    df.to_sql('lines', con=engine, if_exists='append', index=False)
    print("Database initialized successfully.")

if __name__ == "__main__":
    init_db()
