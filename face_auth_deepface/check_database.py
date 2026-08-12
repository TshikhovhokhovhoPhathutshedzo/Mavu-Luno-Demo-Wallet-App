#!/usr/bin/env python3
"""
Check face authentication database contents
"""

import sqlite3
import os
from face_auth_integration import FaceAuthConfig

def check_database():
    config = FaceAuthConfig()
    db_path = config.DATABASE_PATH
    
    print(f"Database path: {db_path}")
    print(f"Database exists: {os.path.exists(db_path)}")
    
    if not os.path.exists(db_path):
        print("Database does not exist!")
        return
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Check users table
    cursor.execute("SELECT COUNT(*) FROM users")
    user_count = cursor.fetchone()[0]
    print(f"Users in database: {user_count}")
    
    # Check face_encodings table
    cursor.execute("SELECT COUNT(*) FROM face_encodings")
    encoding_count = cursor.fetchone()[0]
    print(f"Face encodings in database: {encoding_count}")
    
    # Check users with face auth enabled
    cursor.execute("SELECT user_id, username, face_enabled FROM users WHERE face_enabled = 1")
    face_users = cursor.fetchall()
    print(f"Users with face auth enabled: {len(face_users)}")
    for user_id, username, face_enabled in face_users:
        print(f"  - {username} ({user_id}): face_enabled={face_enabled}")
    
    # Check face encodings details
    cursor.execute("SELECT user_id, face_image_path, is_primary FROM face_encodings")
    encodings = cursor.fetchall()
    print(f"Face encodings details:")
    for user_id, face_path, is_primary in encodings:
        print(f"  - User: {user_id}, Path: {face_path}, Primary: {is_primary}")
    
    # Check login attempts
    cursor.execute("SELECT COUNT(*) FROM login_attempts")
    attempt_count = cursor.fetchone()[0]
    print(f"Login attempts recorded: {attempt_count}")
    
    conn.close()

if __name__ == "__main__":
    check_database()
