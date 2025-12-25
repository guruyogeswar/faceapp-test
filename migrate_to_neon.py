# migrate_to_neon.py
# Migrates data from local SQLite to Neon PostgreSQL
# Run: set DATABASE_URL=postgresql://... && py migrate_to_neon.py

import os
import sqlite3
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from werkzeug.security import generate_password_hash

# Target: Neon PostgreSQL (from environment)
NEON_URL = os.environ.get('DATABASE_URL')
if not NEON_URL:
    print("ERROR: Set DATABASE_URL environment variable first!")
    print("Example: set DATABASE_URL=postgresql://neondb_owner:...@.../neondb?sslmode=require")
    exit(1)

# Handle postgres:// vs postgresql://
if NEON_URL.startswith('postgres://'):
    NEON_URL = NEON_URL.replace('postgres://', 'postgresql://', 1)

# Source: Local SQLite
SQLITE_PATH = 'face_recognition_app.db'

def migrate():
    print(f"Source: {SQLITE_PATH}")
    print(f"Target: Neon PostgreSQL")
    
    # Check if SQLite exists
    if not os.path.exists(SQLITE_PATH):
        print(f"SQLite database not found at {SQLITE_PATH}")
        print("Creating fresh admin user in Neon instead...")
        create_admin_only()
        return
    
    # Connect to both databases
    sqlite_conn = sqlite3.connect(SQLITE_PATH)
    sqlite_conn.row_factory = sqlite3.Row
    sqlite_cursor = sqlite_conn.cursor()
    
    neon_engine = create_engine(NEON_URL, pool_pre_ping=True)
    NeonSession = sessionmaker(bind=neon_engine)
    neon_session = NeonSession()
    
    try:
        # Clear Neon tables (in correct order due to foreign keys)
        print("Clearing Neon database...")
        neon_session.execute(text("DELETE FROM user_album_access"))
        neon_session.execute(text("DELETE FROM albums"))
        neon_session.execute(text("DELETE FROM users"))
        neon_session.commit()
        print("Neon database cleared.")
        
        # Migrate users
        sqlite_cursor.execute("SELECT * FROM users")
        users = sqlite_cursor.fetchall()
        print(f"Found {len(users)} users in SQLite")
        
        for user in users:
            neon_session.execute(text("""
                INSERT INTO users (id, username, email, password, role, ref_photo_path, google_id, is_active, created_at, updated_at)
                VALUES (:id, :username, :email, :password, :role, :ref_photo_path, :google_id, :is_active, :created_at, :updated_at)
            """), {
                'id': user['id'],
                'username': user['username'],
                'email': user['email'],
                'password': user['password'],
                'role': user['role'],
                'ref_photo_path': user['ref_photo_path'],
                'google_id': user['google_id'],
                'is_active': bool(user['is_active']),
                'created_at': user['created_at'],
                'updated_at': user['updated_at']
            })
        neon_session.commit()
        print(f"Migrated {len(users)} users")
        
        # Migrate albums
        sqlite_cursor.execute("SELECT * FROM albums")
        albums = sqlite_cursor.fetchall()
        print(f"Found {len(albums)} albums in SQLite")
        
        for album in albums:
            neon_session.execute(text("""
                INSERT INTO albums (id, album_id, name, photographer_id, is_public, created_at, updated_at)
                VALUES (:id, :album_id, :name, :photographer_id, :is_public, :created_at, :updated_at)
            """), {
                'id': album['id'],
                'album_id': album['album_id'],
                'name': album['name'],
                'photographer_id': album['photographer_id'],
                'is_public': bool(album['is_public']),
                'created_at': album['created_at'],
                'updated_at': album['updated_at']
            })
        neon_session.commit()
        print(f"Migrated {len(albums)} albums")
        
        # Migrate access permissions
        sqlite_cursor.execute("SELECT * FROM user_album_access")
        access_records = sqlite_cursor.fetchall()
        for rec in access_records:
            neon_session.execute(text("""
                INSERT INTO user_album_access (user_id, album_id, granted_at)
                VALUES (:user_id, :album_id, :granted_at)
            """), {
                'user_id': rec['user_id'],
                'album_id': rec['album_id'],
                'granted_at': rec['granted_at']
            })
        neon_session.commit()
        print(f"Migrated {len(access_records)} access records")
        
        print("\n✅ Migration complete!")
        
    except Exception as e:
        print(f"Error during migration: {e}")
        neon_session.rollback()
        raise
    finally:
        sqlite_conn.close()
        neon_session.close()

def create_admin_only():
    """Create just the admin user if no SQLite exists"""
    neon_engine = create_engine(NEON_URL, pool_pre_ping=True)
    NeonSession = sessionmaker(bind=neon_engine)
    neon_session = NeonSession()
    
    try:
        # Clear existing data
        print("Clearing Neon database...")
        neon_session.execute(text("DELETE FROM user_album_access"))
        neon_session.execute(text("DELETE FROM albums"))
        neon_session.execute(text("DELETE FROM users"))
        neon_session.commit()
        
        # Create admin user
        hashed_pw = generate_password_hash('admin123')
        neon_session.execute(text("""
            INSERT INTO users (username, email, password, role, is_active)
            VALUES ('admin', 'admin@example.com', :password, 'photographer', true)
        """), {'password': hashed_pw})
        neon_session.commit()
        
        print("✅ Created admin user (admin / admin123)")
        
    finally:
        neon_session.close()

if __name__ == "__main__":
    migrate()
