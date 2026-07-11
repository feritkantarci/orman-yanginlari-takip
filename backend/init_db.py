import pandas as pd
import sqlite3
import os

def init_db():
    # Paths
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    excel_path = os.path.join(base_dir, 'Kopya Ormanlık Alan Bakım Takip - Toroslar.xlsx')
    db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'database.db')

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

    # Connect to SQLite
    conn = sqlite3.connect(db_path)
    
    # Save lines to database
    df.to_sql('lines', conn, if_exists='replace', index=False)

    # Create the interventions table for tracking Asset IDs
    conn.execute('''
    CREATE TABLE IF NOT EXISTS interventions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sira_no INTEGER,
        asset_id TEXT,
        category TEXT,
        description TEXT,
        status TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(sira_no) REFERENCES lines("Sıra No")
    )
    ''')
    
    conn.commit()
    conn.close()

    print(f"Database initialized successfully at {db_path} with {len(df)} lines.")

if __name__ == "__main__":
    init_db()
