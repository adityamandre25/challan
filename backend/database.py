import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "challans.db")

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS challans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            vehicle_number TEXT NOT NULL,
            reason TEXT NOT NULL,
            fine_amount INTEGER NOT NULL,
            timestamp TEXT NOT NULL,
            image_data TEXT NOT NULL,  -- Base64 encoded image or path
            status TEXT NOT NULL DEFAULT 'Pending'
        )
    """)
    # Check if location column exists in the table info
    cursor.execute("PRAGMA table_info(challans)")
    columns = [col[1] for col in cursor.fetchall()]
    if "location" not in columns:
        cursor.execute("ALTER TABLE challans ADD COLUMN location TEXT")
    conn.commit()
    conn.close()

def add_challan(vehicle_number, reason, fine_amount, timestamp, image_data, location="Camera Zone A"):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO challans (vehicle_number, reason, fine_amount, timestamp, image_data, status, location)
        VALUES (?, ?, ?, ?, ?, 'Pending', ?)
    """, (vehicle_number, reason, fine_amount, timestamp, image_data, location))
    conn.commit()
    new_id = cursor.lastrowid
    conn.close()
    return new_id

def get_all_challans():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM challans ORDER BY id DESC")
    rows = cursor.fetchall()
    conn.close()
    
    challans = []
    for row in rows:
        challans.append({
            "id": row["id"],
            "vehicle_number": row["vehicle_number"],
            "reason": row["reason"],
            "fine_amount": row["fine_amount"],
            "timestamp": row["timestamp"],
            "image_data": row["image_data"],
            "status": row["status"],
            "location": row["location"] if ("location" in row.keys() and row["location"] is not None) else "Camera Zone A"
        })
    return challans

# Auto initialize when loaded
init_db()
