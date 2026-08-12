#!/usr/bin/env python3
"""
Debug face verification process
"""

import os
import numpy as np
from face_auth_integration import face_auth_manager

def debug_verification():
    print("=== Face Verification Debug ===")
    
    # Check if there are any face encodings
    with face_auth_manager.db.get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT user_id, face_encoding, face_image_path FROM face_encodings")
        encodings = cursor.fetchall()
        
        print(f"Found {len(encodings)} face encodings in database")
        
        for i, (user_id, encoding_blob, face_path) in enumerate(encodings):
            print(f"\nEncoding {i+1}:")
            print(f"  User ID: {user_id}")
            print(f"  Face Path: {face_path}")
            print(f"  Path exists: {os.path.exists(face_path)}")
            
            # Load and check encoding
            try:
                encoding = np.frombuffer(encoding_blob, dtype=np.float32)
                print(f"  Encoding shape: {encoding.shape}")
                print(f"  Encoding dimension: {len(encoding)}")
                print(f"  Expected dimension: {face_auth_manager.config.FACE_ENCODING_SIZE}")
                print(f"  Dimension match: {len(encoding) == face_auth_manager.config.FACE_ENCODING_SIZE}")
                
                # Test face extraction from the stored image
                if os.path.exists(face_path):
                    print(f"  Testing face extraction from stored image...")
                    extracted_encoding = face_auth_manager.extract_face_encoding(face_path)
                    if extracted_encoding is not None:
                        print(f"  Extracted encoding shape: {extracted_encoding.shape}")
                        print(f"  Extracted dimension: {len(extracted_encoding)}")
                        
                        # Compare with stored encoding
                        if len(encoding) == len(extracted_encoding):
                            similarity = np.dot(encoding, extracted_encoding) / (
                                np.linalg.norm(encoding) * np.linalg.norm(extracted_encoding)
                            )
                            print(f"  Self-similarity: {similarity:.4f} ({similarity*100:.2f}%)")
                        else:
                            print(f"  Dimension mismatch: stored={len(encoding)}, extracted={len(extracted_encoding)}")
                    else:
                        print(f"  Failed to extract face from stored image")
                else:
                    print(f"  Stored image file does not exist")
                    
            except Exception as e:
                print(f"  Error processing encoding: {e}")
    
    # Test the verify_face_against_all_users method with a dummy image
    print(f"\n=== Testing verify_face_against_all_users ===")
    
    # Create a simple test image path (this won't work but will show the process)
    test_image_path = "test_image.jpg"
    print(f"Testing with dummy image path: {test_image_path}")
    
    try:
        result = face_auth_manager.verify_face_against_all_users(
            test_image_path, 
            "127.0.0.1", 
            "Debug Test"
        )
        print(f"Result: {result}")
    except Exception as e:
        print(f"Error in verify_face_against_all_users: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    debug_verification()
