"""
Face Authentication Integration Module for LunoWallet
Integrates DeepFace functionality for face-based login authentication
"""

import os
import shutil
import glob
import cv2
import numpy as np
import time
import hashlib
import json
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
from deepface import DeepFace
from werkzeug.utils import secure_filename
import sqlite3
from contextlib import contextmanager

class FaceAuthConfig:
    """Configuration for face authentication system"""
    BASE_DIR = os.path.abspath(os.path.dirname(__file__))
    FACE_DATA_FOLDER = os.path.join(BASE_DIR, "face_data")
    USER_FACES_FOLDER = os.path.join(FACE_DATA_FOLDER, "user_faces")
    TEMP_FOLDER = os.path.join(FACE_DATA_FOLDER, "temp")
    DATABASE_PATH = os.path.join(FACE_DATA_FOLDER, "face_auth.db")
    
    # DeepFace configuration
    MODEL_NAME = "ArcFace"
    DISTANCE_METRIC = "cosine"
    DETECTOR_BACKEND = "retinaface"
    SIMILARITY_THRESHOLD = 0.4  # Lower = more strict
    
    # Security settings
    MAX_LOGIN_ATTEMPTS = 3
    LOCKOUT_DURATION_MINUTES = 15
    FACE_ENCODING_SIZE = 512  # ArcFace embedding size
    
    ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif'}

class FaceAuthDatabase:
    """Database management for face authentication"""
    
    def __init__(self, db_path: str):
        self.db_path = db_path
        self.init_database()
    
    def init_database(self):
        """Initialize database tables"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            
            # Users table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT UNIQUE NOT NULL,
                    username TEXT NOT NULL,
                    email TEXT,
                    face_enabled BOOLEAN DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            # Face encodings table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS face_encodings (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT NOT NULL,
                    face_encoding BLOB NOT NULL,
                    face_image_path TEXT,
                    is_primary BOOLEAN DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users (user_id)
                )
            ''')
            
            # Login attempts table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS login_attempts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT,
                    attempt_type TEXT NOT NULL,  -- 'face' or 'password'
                    success BOOLEAN NOT NULL,
                    ip_address TEXT,
                    user_agent TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users (user_id)
                )
            ''')
            
            conn.commit()
    
    @contextmanager
    def get_connection(self):
        """Get database connection with proper cleanup"""
        conn = sqlite3.connect(self.db_path)
        try:
            yield conn
        finally:
            conn.close()
    
    def create_user(self, user_id: str, username: str, email: str = None) -> bool:
        """Create a new user in the database"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('''
                    INSERT INTO users (user_id, username, email)
                    VALUES (?, ?, ?)
                ''', (user_id, username, email))
                conn.commit()
                return True
        except sqlite3.IntegrityError:
            return False  # User already exists
    
    def enable_face_auth(self, user_id: str) -> bool:
        """Enable face authentication for a user"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('''
                    UPDATE users SET face_enabled = 1, updated_at = CURRENT_TIMESTAMP
                    WHERE user_id = ?
                ''', (user_id,))
                conn.commit()
                return cursor.rowcount > 0
        except Exception:
            return False
    
    def disable_face_auth(self, user_id: str) -> bool:
        """Disable face authentication for a user"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('''
                    UPDATE users SET face_enabled = 0, updated_at = CURRENT_TIMESTAMP
                    WHERE user_id = ?
                ''', (user_id,))
                conn.commit()
                return cursor.rowcount > 0
        except Exception:
            return False
    
    def add_face_encoding(self, user_id: str, face_encoding: np.ndarray, 
                         face_image_path: str, is_primary: bool = False) -> bool:
        """Add face encoding to database"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                
                # If this is primary, unset other primary faces
                if is_primary:
                    cursor.execute('''
                        UPDATE face_encodings SET is_primary = 0 WHERE user_id = ?
                    ''', (user_id,))
                
                # Insert new face encoding
                cursor.execute('''
                    INSERT INTO face_encodings (user_id, face_encoding, face_image_path, is_primary)
                    VALUES (?, ?, ?, ?)
                ''', (user_id, face_encoding.tobytes(), face_image_path, is_primary))
                conn.commit()
                return True
        except Exception:
            return False
    
    def get_user_face_encodings(self, user_id: str) -> List[Tuple[np.ndarray, str, bool]]:
        """Get all face encodings for a user"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('''
                    SELECT face_encoding, face_image_path, is_primary
                    FROM face_encodings WHERE user_id = ?
                    ORDER BY is_primary DESC, created_at DESC
                ''', (user_id,))
                
                results = []
                for row in cursor.fetchall():
                    face_encoding = np.frombuffer(row[0], dtype=np.float32)
                    results.append((face_encoding, row[1], bool(row[2])))
                return results
        except Exception:
            return []
    
    def is_face_auth_enabled(self, user_id: str) -> bool:
        """Check if face authentication is enabled for user"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('''
                    SELECT face_enabled FROM users WHERE user_id = ?
                ''', (user_id,))
                result = cursor.fetchone()
                return result[0] if result else False
        except Exception:
            return False
    
    def log_login_attempt(self, user_id: str, attempt_type: str, success: bool, 
                         ip_address: str = None, user_agent: str = None) -> bool:
        """Log login attempt for security monitoring"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('''
                    INSERT INTO login_attempts (user_id, attempt_type, success, ip_address, user_agent)
                    VALUES (?, ?, ?, ?, ?)
                ''', (user_id, attempt_type, success, ip_address, user_agent))
                conn.commit()
                return True
        except Exception:
            return False
    
    def get_recent_failed_attempts(self, user_id: str, minutes: int = 15) -> int:
        """Get count of recent failed login attempts"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cutoff_time = datetime.now() - timedelta(minutes=minutes)
                cursor.execute('''
                    SELECT COUNT(*) FROM login_attempts
                    WHERE user_id = ? AND success = 0 AND created_at > ?
                ''', (user_id, cutoff_time))
                return cursor.fetchone()[0]
        except Exception:
            return 0

class FaceAuthManager:
    """Main face authentication manager"""
    
    def __init__(self):
        self.config = FaceAuthConfig()
        self.db = FaceAuthDatabase(self.config.DATABASE_PATH)
        self.create_directories()
    
    def create_directories(self):
        """Create necessary directories"""
        for folder in [self.config.FACE_DATA_FOLDER, self.config.USER_FACES_FOLDER, self.config.TEMP_FOLDER]:
            os.makedirs(folder, exist_ok=True)
    
    def allowed_file(self, filename: str) -> bool:
        """Check if file extension is allowed"""
        return '.' in filename and filename.rsplit('.', 1)[1].lower() in self.config.ALLOWED_EXTENSIONS
    
    def extract_face_encoding(self, image_path: str) -> Optional[np.ndarray]:
        """Extract face encoding from image"""
        try:
            # Handle PNG with alpha channel
            if image_path.lower().endswith('.png'):
                img = cv2.imread(image_path, cv2.IMREAD_UNCHANGED)
                if img is not None and img.shape[-1] == 4:
                    img = cv2.cvtColor(img, cv2.COLOR_BGRA2BGR)
                    cv2.imwrite(image_path, img)
            
            # Extract face and get embedding with consistent model
            face_objs = DeepFace.represent(
                img_path=image_path,
                model_name=self.config.MODEL_NAME,
                detector_backend=self.config.DETECTOR_BACKEND,
                enforce_detection=True,
                align=True
            )
            
            if face_objs and len(face_objs) > 0:
                # Get the first face's embedding
                embedding = np.array(face_objs[0]["embedding"])
                
                # Validate embedding dimension
                if len(embedding) != self.config.FACE_ENCODING_SIZE:
                    print(f"Warning: Expected {self.config.FACE_ENCODING_SIZE} dimensions, got {len(embedding)}")
                    # If dimension doesn't match, we need to handle this
                    # For now, let's try to resize or use a different approach
                    if len(embedding) == 1024:
                        # If it's 1024, we might be using a different model
                        # Let's try to use the first 512 dimensions or pad with zeros
                        if len(embedding) > self.config.FACE_ENCODING_SIZE:
                            embedding = embedding[:self.config.FACE_ENCODING_SIZE]
                        else:
                            # Pad with zeros if too short
                            padding = np.zeros(self.config.FACE_ENCODING_SIZE - len(embedding))
                            embedding = np.concatenate([embedding, padding])
                
                return embedding
            
        except Exception as e:
            print(f"Error extracting face encoding: {e}")
        
        return None
    
    def register_user_face(self, user_id: str, image_path: str, is_primary: bool = False) -> Dict:
        """Register a face for a user"""
        try:
            # Extract face encoding
            face_encoding = self.extract_face_encoding(image_path)
            if face_encoding is None:
                return {
                    "success": False,
                    "message": "No face detected in the image"
                }
            
            # Save face image to user folder
            user_folder = os.path.join(self.config.USER_FACES_FOLDER, user_id)
            os.makedirs(user_folder, exist_ok=True)
            
            timestamp = int(time.time())
            face_filename = f"face_{timestamp}.jpg"
            face_path = os.path.join(user_folder, face_filename)
            
            # Copy and process image
            shutil.copy2(image_path, face_path)
            
            # Store face encoding in database
            success = self.db.add_face_encoding(user_id, face_encoding, face_path, is_primary)
            
            if success:
                return {
                    "success": True,
                    "message": "Face registered successfully",
                    "face_path": face_path
                }
            else:
                return {
                    "success": False,
                    "message": "Failed to store face data"
                }
                
        except Exception as e:
            return {
                "success": False,
                "message": f"Error registering face: {str(e)}"
            }
    
    def verify_face_login(self, user_id: str, login_image_path: str, 
                         ip_address: str = None, user_agent: str = None) -> Dict:
        """Verify face for login"""
        try:
            # Check if face auth is enabled
            if not self.db.is_face_auth_enabled(user_id):
                return {
                    "success": False,
                    "message": "Face authentication not enabled for this user"
                }
            
            # Check for recent failed attempts
            failed_attempts = self.db.get_recent_failed_attempts(user_id, self.config.LOCKOUT_DURATION_MINUTES)
            if failed_attempts >= self.config.MAX_LOGIN_ATTEMPTS:
                return {
                    "success": False,
                    "message": f"Too many failed attempts. Try again in {self.config.LOCKOUT_DURATION_MINUTES} minutes"
                }
            
            # Get user's registered face encodings
            user_encodings = self.db.get_user_face_encodings(user_id)
            if not user_encodings:
                return {
                    "success": False,
                    "message": "No registered faces found for this user"
                }
            
            # Extract face from login image
            login_encoding = self.extract_face_encoding(login_image_path)
            if login_encoding is None:
                self.db.log_login_attempt(user_id, "face", False, ip_address, user_agent)
                return {
                    "success": False,
                    "message": "No face detected in login image"
                }
            
            # Compare with registered faces
            best_similarity = 0
            for registered_encoding, _, _ in user_encodings:
                # Ensure both encodings have the same dimension
                if len(login_encoding) != len(registered_encoding):
                    print(f"Dimension mismatch: login={len(login_encoding)}, registered={len(registered_encoding)}")
                    # Skip this encoding if dimensions don't match
                    continue
                
                # Calculate cosine similarity
                similarity = np.dot(login_encoding, registered_encoding) / (
                    np.linalg.norm(login_encoding) * np.linalg.norm(registered_encoding)
                )
                best_similarity = max(best_similarity, similarity)
            
            # Check if similarity meets threshold
            similarity_percent = best_similarity * 100
            is_match = best_similarity >= (1 - self.config.SIMILARITY_THRESHOLD)
            
            # Log the attempt
            self.db.log_login_attempt(user_id, "face", is_match, ip_address, user_agent)
            
            if is_match:
                return {
                    "success": True,
                    "message": "Face authentication successful",
                    "similarity": f"{similarity_percent:.2f}%"
                }
            else:
                return {
                    "success": False,
                    "message": f"Face does not match. Similarity: {similarity_percent:.2f}%"
                }
                
        except Exception as e:
            self.db.log_login_attempt(user_id, "face", False, ip_address, user_agent)
            return {
                "success": False,
                "message": f"Error during face verification: {str(e)}"
            }
    
    def verify_face_against_all_users(self, login_image_path: str, 
                                    ip_address: str = None, user_agent: str = None) -> Dict:
        """Verify face against all users (for login page)"""
        try:
            # Extract face from login image
            login_encoding = self.extract_face_encoding(login_image_path)
            if login_encoding is None:
                return {
                    "success": False,
                    "message": "No face detected in image"
                }
            
            # Get all users with face auth enabled
            with self.db.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('''
                    SELECT user_id FROM users 
                    WHERE face_enabled = 1
                ''')
                users = cursor.fetchall()
            
            best_match = None
            best_similarity = 0
            best_user_id = None
            
            # Check against all users
            for (user_id,) in users:
                # Check for recent failed attempts
                failed_attempts = self.db.get_recent_failed_attempts(user_id, self.config.LOCKOUT_DURATION_MINUTES)
                if failed_attempts >= self.config.MAX_LOGIN_ATTEMPTS:
                    continue
                
                # Get user's registered face encodings
                user_encodings = self.db.get_user_face_encodings(user_id)
                if not user_encodings:
                    continue
                
                # Compare with this user's faces
                for registered_encoding, _, _ in user_encodings:
                    # Ensure both encodings have the same dimension
                    if len(login_encoding) != len(registered_encoding):
                        print(f"Dimension mismatch: login={len(login_encoding)}, registered={len(registered_encoding)}")
                        # Skip this encoding if dimensions don't match
                        continue
                    
                    # Calculate cosine similarity
                    similarity = np.dot(login_encoding, registered_encoding) / (
                        np.linalg.norm(login_encoding) * np.linalg.norm(registered_encoding)
                    )
                    
                    if similarity > best_similarity:
                        best_similarity = similarity
                        best_user_id = user_id
                        best_match = {
                            "user_id": user_id,
                            "similarity": similarity
                        }
            
            # Check if best match meets threshold
            similarity_percent = best_similarity * 100
            is_match = best_similarity >= (1 - self.config.SIMILARITY_THRESHOLD)
            
            if is_match and best_user_id:
                # Log successful attempt
                self.db.log_login_attempt(best_user_id, "face", True, ip_address, user_agent)
                
                return {
                    "success": True,
                    "message": "Face authentication successful",
                    "user_id": best_user_id,
                    "similarity": f"{similarity_percent:.2f}%"
                }
            else:
                # Log failed attempt (if we have a best match, log it for that user)
                if best_user_id:
                    self.db.log_login_attempt(best_user_id, "face", False, ip_address, user_agent)
                
                return {
                    "success": False,
                    "message": f"Face not recognized. Best match: {similarity_percent:.2f}%"
                }
                
        except Exception as e:
            return {
                "success": False,
                "message": f"Error during face verification: {str(e)}"
            }
    
    def get_user_face_count(self, user_id: str) -> int:
        """Get number of registered faces for a user"""
        return len(self.db.get_user_face_encodings(user_id))
    
    def cleanup_invalid_encodings(self) -> Dict:
        """Clean up face encodings with invalid dimensions"""
        try:
            cleaned_count = 0
            with self.db.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('SELECT user_id, face_encoding, face_image_path FROM face_encodings')
                all_encodings = cursor.fetchall()
                
                for user_id, encoding_blob, face_path in all_encodings:
                    try:
                        # Load the encoding
                        encoding = np.frombuffer(encoding_blob, dtype=np.float32)
                        
                        # Check if dimension is correct
                        if len(encoding) != self.config.FACE_ENCODING_SIZE:
                            print(f"Removing invalid encoding for user {user_id}: {len(encoding)} dimensions")
                            
                            # Delete the invalid encoding
                            cursor.execute('DELETE FROM face_encodings WHERE user_id = ? AND face_image_path = ?', 
                                         (user_id, face_path))
                            
                            # Delete the face image file
                            if os.path.exists(face_path):
                                os.remove(face_path)
                            
                            cleaned_count += 1
                    except Exception as e:
                        print(f"Error processing encoding for user {user_id}: {e}")
                        # Remove corrupted encoding
                        cursor.execute('DELETE FROM face_encodings WHERE user_id = ? AND face_image_path = ?', 
                                     (user_id, face_path))
                        cleaned_count += 1
                
                conn.commit()
            
            return {
                "success": True,
                "message": f"Cleaned up {cleaned_count} invalid face encodings",
                "cleaned_count": cleaned_count
            }
        except Exception as e:
            return {
                "success": False,
                "message": f"Error cleaning up encodings: {str(e)}"
            }
    
    def delete_user_faces(self, user_id: str) -> bool:
        """Delete all face data for a user"""
        try:
            # Get face image paths
            user_encodings = self.db.get_user_face_encodings(user_id)
            
            # Delete face images
            for _, face_path, _ in user_encodings:
                if os.path.exists(face_path):
                    os.remove(face_path)
            
            # Delete from database
            with self.db.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('DELETE FROM face_encodings WHERE user_id = ?', (user_id,))
                conn.commit()
            
            # Disable face auth
            self.db.disable_face_auth(user_id)
            
            return True
        except Exception:
            return False

# Global instance for use in Flask routes
face_auth_manager = FaceAuthManager()
