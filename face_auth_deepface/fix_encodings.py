#!/usr/bin/env python3
"""
Fix face encodings to match current model dimensions
"""

import os
import numpy as np
from face_auth_integration import face_auth_manager

def fix_encodings():
    print("=== Fixing Face Encodings ===")
    
    with face_auth_manager.db.get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT user_id, face_encoding, face_image_path FROM face_encodings")
        encodings = cursor.fetchall()
        
        print(f"Found {len(encodings)} face encodings to fix")
        
        for i, (user_id, encoding_blob, face_path) in enumerate(encodings):
            print(f"\nFixing encoding {i+1} for user {user_id}")
            print(f"  Face path: {face_path}")
            
            if not os.path.exists(face_path):
                print(f"  ERROR: Face image file does not exist, skipping")
                continue
            
            try:
                # Extract new encoding with current model
                new_encoding = face_auth_manager.extract_face_encoding(face_path)
                
                if new_encoding is None:
                    print(f"  ERROR: Failed to extract face from image, skipping")
                    continue
                
                print(f"  New encoding dimension: {len(new_encoding)}")
                
                # Update the database with new encoding
                new_encoding_blob = new_encoding.astype(np.float32).tobytes()
                
                cursor.execute("""
                    UPDATE face_encodings 
                    SET face_encoding = ? 
                    WHERE user_id = ? AND face_image_path = ?
                """, (new_encoding_blob, user_id, face_path))
                
                print(f"  SUCCESS: Updated encoding to {len(new_encoding)} dimensions")
                
            except Exception as e:
                print(f"  ERROR: Failed to fix encoding: {e}")
                import traceback
                traceback.print_exc()
        
        conn.commit()
        print(f"\n=== Fix Complete ===")

if __name__ == "__main__":
    fix_encodings()
