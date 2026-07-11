import sqlite3
import hashlib
import os

def hash_password(password):
    return hashlib.sha256(password.encode()).hexdigest()

def update_db():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    db_path = os.path.join(base_dir, 'database.db')
    
    print(f"Updating database at {db_path}")
    conn = sqlite3.connect(db_path)
    
    # 1. Add created_by column
    try:
        conn.execute('ALTER TABLE interventions ADD COLUMN created_by TEXT')
        print("Added created_by column to interventions.")
    except sqlite3.OperationalError as e:
        print("created_by column might already exist:", e)
        
    # 2. Add flag_request column
    try:
        conn.execute('ALTER TABLE interventions ADD COLUMN flag_request TEXT')
        print("Added flag_request column to interventions.")
    except sqlite3.OperationalError as e:
        print("flag_request column might already exist:", e)
        
    # Update existing null created_by to 'bilinmeyen'
    conn.execute("UPDATE interventions SET created_by = 'bilinmeyen' WHERE created_by IS NULL")

    # 3. Create users table
    conn.execute('''
    CREATE TABLE IF NOT EXISTS users (
        username TEXT PRIMARY KEY,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL
    )
    ''')
    print("Checked/Created users table.")
    
    # 4. Insert default users
    # Admin
    try:
        conn.execute('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)',
                     ('admin', hash_password('Fk.2238893'), 'admin'))
        print("Created admin user.")
    except sqlite3.IntegrityError:
        print("admin user already exists.")
        # Update password just in case
        conn.execute('UPDATE users SET password_hash = ? WHERE username = ?', (hash_password('Fk.2238893'), 'admin'))
        
    # Ahmet
    try:
        conn.execute('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)',
                     ('ahmet', hash_password('123456'), 'user'))
        print("Created ahmet user.")
    except sqlite3.IntegrityError:
        print("ahmet user already exists.")

    # 5. Create requests table for approval workflow
    conn.execute('''
    CREATE TABLE IF NOT EXISTS requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        intervention_id INTEGER,
        request_type TEXT NOT NULL,
        new_data TEXT,
        status TEXT DEFAULT 'PENDING',
        requested_by TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(intervention_id) REFERENCES interventions(id)
    )
    ''')
    print("Checked/Created requests table.")

    conn.commit()
    conn.close()
    print("Database update complete.")

if __name__ == "__main__":
    update_db()
