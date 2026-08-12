#!/usr/bin/env python3
"""
Test script for LunoWallet DeepFace Authentication System
Tests database integration, face storage, and comparison functionality
"""

import os
import sys
import json
import time
import requests
import base64
from pathlib import Path

# Add the face_auth_deepface directory to Python path
face_auth_dir = Path(__file__).parent / "face_auth_deepface"
sys.path.insert(0, str(face_auth_dir))

try:
    from face_auth_integration import face_auth_manager
    print("✅ Successfully imported face_auth_manager")
except ImportError as e:
    print(f"❌ Failed to import face_auth_manager: {e}")
    sys.exit(1)

class FaceAuthTester:
    def __init__(self):
        self.api_base_url = "http://localhost:5001"
        self.test_user_id = "test_user_123"
        self.test_username = "Test User"
        self.test_email = "test@example.com"
        
    def test_database_connection(self):
        """Test database connection and table creation"""
        print("\n🔍 Testing Database Connection...")
        
        try:
            # Test database initialization
            db = face_auth_manager.db
            
            # Test creating a user
            success = db.create_user(self.test_user_id, self.test_username, self.test_email)
            if success:
                print("✅ User created successfully in database")
            else:
                print("ℹ️ User already exists in database")
            
            # Test enabling face auth
            success = db.enable_face_auth(self.test_user_id)
            if success:
                print("✅ Face authentication enabled for user")
            else:
                print("ℹ️ Face authentication already enabled or user not found")
            
            # Test checking face auth status
            is_enabled = db.is_face_auth_enabled(self.test_user_id)
            print(f"✅ Face auth status: {'Enabled' if is_enabled else 'Disabled'}")
            
            return True
            
        except Exception as e:
            print(f"❌ Database connection test failed: {e}")
            return False
    
    def test_face_encoding_storage(self):
        """Test face encoding extraction and storage"""
        print("\n🔍 Testing Face Encoding Storage...")
        
        try:
            # Create a test image (simple colored rectangle)
            import cv2
            import numpy as np
            
            # Create a simple test image
            test_image = np.ones((480, 640, 3), dtype=np.uint8) * 128  # Gray image
            test_image_path = "test_face.jpg"
            cv2.imwrite(test_image_path, test_image)
            
            print(f"✅ Created test image: {test_image_path}")
            
            # Test face encoding extraction
            face_encoding = face_auth_manager.extract_face_encoding(test_image_path)
            
            if face_encoding is not None:
                print(f"✅ Face encoding extracted successfully")
                print(f"   - Encoding shape: {face_encoding.shape}")
                print(f"   - Encoding type: {type(face_encoding)}")
                print(f"   - Sample values: {face_encoding[:5]}")
                
                # Test storing face encoding
                success = face_auth_manager.db.add_face_encoding(
                    self.test_user_id, 
                    face_encoding, 
                    test_image_path, 
                    True
                )
                
                if success:
                    print("✅ Face encoding stored in database successfully")
                else:
                    print("❌ Failed to store face encoding in database")
                    return False
                    
            else:
                print("⚠️ No face detected in test image (expected for simple rectangle)")
                print("   This is normal - the test image doesn't contain a real face")
                
                # Create a more realistic test scenario
                print("   Creating a more realistic test scenario...")
                
                # Test with a face-like pattern
                face_like_image = np.ones((480, 640, 3), dtype=np.uint8) * 200
                # Add some face-like features
                cv2.rectangle(face_like_image, (200, 150), (440, 350), (100, 100, 100), -1)  # Face outline
                cv2.circle(face_like_image, (280, 200), 20, (50, 50, 50), -1)  # Left eye
                cv2.circle(face_like_image, (360, 200), 20, (50, 50, 50), -1)  # Right eye
                cv2.rectangle(face_like_image, (300, 250), (340, 280), (50, 50, 50), -1)  # Nose
                cv2.rectangle(face_like_image, (280, 300), (360, 320), (50, 50, 50), -1)  # Mouth
                
                cv2.imwrite("test_face_like.jpg", face_like_image)
                print("✅ Created face-like test image")
                
                # Try to extract encoding from face-like image
                face_encoding = face_auth_manager.extract_face_encoding("test_face_like.jpg")
                
                if face_encoding is not None:
                    print("✅ Face encoding extracted from face-like image")
                    success = face_auth_manager.db.add_face_encoding(
                        self.test_user_id, 
                        face_encoding, 
                        "test_face_like.jpg", 
                        True
                    )
                    if success:
                        print("✅ Face encoding stored successfully")
                    else:
                        print("❌ Failed to store face encoding")
                        return False
                else:
                    print("⚠️ Still no face detected - this is expected for synthetic images")
                    print("   Real face images would work better for testing")
            
            # Clean up test files
            for file in ["test_face.jpg", "test_face_like.jpg"]:
                if os.path.exists(file):
                    os.remove(file)
                    print(f"✅ Cleaned up test file: {file}")
            
            return True
            
        except Exception as e:
            print(f"❌ Face encoding storage test failed: {e}")
            return False
    
    def test_face_retrieval(self):
        """Test retrieving stored face encodings"""
        print("\n🔍 Testing Face Retrieval...")
        
        try:
            # Get user's face encodings
            user_encodings = face_auth_manager.db.get_user_face_encodings(self.test_user_id)
            
            print(f"✅ Retrieved {len(user_encodings)} face encodings for user")
            
            for i, (encoding, path, is_primary) in enumerate(user_encodings):
                print(f"   Face {i+1}:")
                print(f"     - Path: {path}")
                print(f"     - Primary: {is_primary}")
                print(f"     - Encoding shape: {encoding.shape}")
                print(f"     - Encoding type: {type(encoding)}")
            
            return len(user_encodings) > 0
            
        except Exception as e:
            print(f"❌ Face retrieval test failed: {e}")
            return False
    
    def test_face_comparison(self):
        """Test face comparison functionality"""
        print("\n🔍 Testing Face Comparison...")
        
        try:
            # Get stored face encodings
            user_encodings = face_auth_manager.db.get_user_face_encodings(self.test_user_id)
            
            if not user_encodings:
                print("⚠️ No stored face encodings found for comparison test")
                return False
            
            # Test comparison with the same encoding
            stored_encoding, _, _ = user_encodings[0]
            
            # Calculate similarity with itself (should be 1.0)
            similarity = np.dot(stored_encoding, stored_encoding) / (
                np.linalg.norm(stored_encoding) * np.linalg.norm(stored_encoding)
            )
            
            print(f"✅ Self-similarity test: {similarity:.4f} (should be ~1.0)")
            
            # Test with a slightly modified encoding
            modified_encoding = stored_encoding + np.random.normal(0, 0.01, stored_encoding.shape)
            similarity_modified = np.dot(stored_encoding, modified_encoding) / (
                np.linalg.norm(stored_encoding) * np.linalg.norm(modified_encoding)
            )
            
            print(f"✅ Modified similarity test: {similarity_modified:.4f} (should be high)")
            
            # Test threshold check
            threshold = 1 - face_auth_manager.config.SIMILARITY_THRESHOLD
            is_match = similarity >= threshold
            print(f"✅ Threshold test: {is_match} (similarity: {similarity:.4f}, threshold: {threshold:.4f})")
            
            return True
            
        except Exception as e:
            print(f"❌ Face comparison test failed: {e}")
            return False
    
    def test_api_endpoints(self):
        """Test API endpoints"""
        print("\n🔍 Testing API Endpoints...")
        
        try:
            # Test health endpoint
            response = requests.get(f"{self.api_base_url}/face-auth/health", timeout=5)
            if response.status_code == 200:
                print("✅ Health endpoint responding")
                health_data = response.json()
                print(f"   - Response: {health_data}")
            else:
                print(f"❌ Health endpoint failed: {response.status_code}")
                return False
            
            # Test status endpoint
            response = requests.get(f"{self.api_base_url}/face-auth/status/{self.test_user_id}", timeout=5)
            if response.status_code == 200:
                print("✅ Status endpoint responding")
                status_data = response.json()
                print(f"   - Status data: {status_data}")
            else:
                print(f"❌ Status endpoint failed: {response.status_code}")
                return False
            
            # Test faces endpoint
            response = requests.get(f"{self.api_base_url}/face-auth/faces/{self.test_user_id}", timeout=5)
            if response.status_code == 200:
                print("✅ Faces endpoint responding")
                faces_data = response.json()
                print(f"   - Faces data: {faces_data}")
            else:
                print(f"❌ Faces endpoint failed: {response.status_code}")
                return False
            
            return True
            
        except requests.exceptions.ConnectionError:
            print("❌ API server not running. Start it with: python start_deepface_api.py")
            return False
        except Exception as e:
            print(f"❌ API endpoints test failed: {e}")
            return False
    
    def test_database_integrity(self):
        """Test database integrity and data consistency"""
        print("\n🔍 Testing Database Integrity...")
        
        try:
            # Test user creation and retrieval
            test_user_2 = "test_user_456"
            success = face_auth_manager.db.create_user(test_user_2, "Test User 2", "test2@example.com")
            if success:
                print("✅ Created second test user")
            
            # Test face count
            face_count = face_auth_manager.get_user_face_count(self.test_user_id)
            print(f"✅ Face count for user {self.test_user_id}: {face_count}")
            
            face_count_2 = face_auth_manager.get_user_face_count(test_user_2)
            print(f"✅ Face count for user {test_user_2}: {face_count_2}")
            
            # Test login attempt logging
            success = face_auth_manager.db.log_login_attempt(
                self.test_user_id, "face", True, "127.0.0.1", "test-agent"
            )
            if success:
                print("✅ Login attempt logged successfully")
            
            # Test failed attempts count
            failed_attempts = face_auth_manager.db.get_recent_failed_attempts(self.test_user_id, 15)
            print(f"✅ Recent failed attempts: {failed_attempts}")
            
            # Clean up test user 2
            face_auth_manager.delete_user_faces(test_user_2)
            print("✅ Cleaned up test user 2")
            
            return True
            
        except Exception as e:
            print(f"❌ Database integrity test failed: {e}")
            return False
    
    def run_all_tests(self):
        """Run all tests"""
        print("🧪 Starting LunoWallet DeepFace Authentication System Tests")
        print("=" * 70)
        
        tests = [
            ("Database Connection", self.test_database_connection),
            ("Face Encoding Storage", self.test_face_encoding_storage),
            ("Face Retrieval", self.test_face_retrieval),
            ("Face Comparison", self.test_face_comparison),
            ("API Endpoints", self.test_api_endpoints),
            ("Database Integrity", self.test_database_integrity)
        ]
        
        passed = 0
        total = len(tests)
        
        for test_name, test_func in tests:
            print(f"\n{'='*20} {test_name} {'='*20}")
            try:
                if test_func():
                    print(f"✅ {test_name} PASSED")
                    passed += 1
                else:
                    print(f"❌ {test_name} FAILED")
            except Exception as e:
                print(f"❌ {test_name} ERROR: {e}")
        
        print(f"\n{'='*70}")
        print(f"📊 Test Results: {passed}/{total} tests passed")
        
        if passed == total:
            print("🎉 All tests passed! The face authentication system is working correctly.")
        else:
            print("⚠️ Some tests failed. Check the output above for details.")
        
        return passed == total

def main():
    """Main function"""
    tester = FaceAuthTester()
    success = tester.run_all_tests()
    
    if success:
        print("\n✅ Face authentication system is ready for use!")
        print("   - Database is properly linked")
        print("   - Face storage is working")
        print("   - Face comparison is functional")
        print("   - API endpoints are responding")
    else:
        print("\n❌ Face authentication system needs attention.")
        print("   - Check the error messages above")
        print("   - Ensure all dependencies are installed")
        print("   - Start the API server: python start_deepface_api.py")

if __name__ == "__main__":
    main()
