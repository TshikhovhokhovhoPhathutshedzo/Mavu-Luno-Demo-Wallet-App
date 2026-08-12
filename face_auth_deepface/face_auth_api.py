"""
Face Authentication API Endpoints for LunoWallet Integration
Provides REST API endpoints for face registration and login
"""

import os
import time
import json
from flask import Flask, request, jsonify, send_from_directory
from werkzeug.utils import secure_filename
from face_auth_integration import face_auth_manager, FaceAuthConfig

# Initialize Flask app for face auth API
face_auth_app = Flask(__name__)
face_auth_app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size

def get_client_info():
    """Extract client information from request"""
    return {
        'ip_address': request.environ.get('HTTP_X_FORWARDED_FOR', request.remote_addr),
        'user_agent': request.headers.get('User-Agent', '')
    }

@face_auth_app.route('/face-auth/register', methods=['POST'])
def register_face():
    """
    Register a face for a user
    Expected JSON payload:
    {
        "user_id": "string",
        "username": "string", 
        "email": "string" (optional),
        "is_primary": boolean (optional, default: false)
    }
    Expected file: 'face_image' (multipart/form-data)
    """
    try:
        # Validate request
        if 'face_image' not in request.files:
            return jsonify({
                "success": False,
                "message": "No face image provided"
            }), 400
        
        file = request.files['face_image']
        if file.filename == '':
            return jsonify({
                "success": False,
                "message": "No file selected"
            }), 400
        
        if not face_auth_manager.allowed_file(file.filename):
            return jsonify({
                "success": False,
                "message": "Invalid file type. Only PNG, JPG, JPEG, GIF are allowed"
            }), 400
        
        # Get JSON data
        try:
            data = json.loads(request.form.get('data', '{}'))
        except json.JSONDecodeError:
            data = {}
        
        user_id = data.get('user_id')
        username = data.get('username')
        email = data.get('email')
        is_primary = data.get('is_primary', False)
        
        if not user_id or not username:
            return jsonify({
                "success": False,
                "message": "user_id and username are required"
            }), 400
        
        # Save uploaded file temporarily
        filename = secure_filename(file.filename)
        timestamp = int(time.time())
        temp_filename = f"{user_id}_{timestamp}_{filename}"
        temp_path = os.path.join(face_auth_manager.config.TEMP_FOLDER, temp_filename)
        file.save(temp_path)
        
        try:
            # Create user if doesn't exist
            face_auth_manager.db.create_user(user_id, username, email)
            
            # Register the face
            result = face_auth_manager.register_user_face(user_id, temp_path, is_primary)
            
            if result["success"]:
                # Enable face authentication for user
                face_auth_manager.db.enable_face_auth(user_id)
                
                # Get updated face count
                face_count = face_auth_manager.get_user_face_count(user_id)
                
                return jsonify({
                    "success": True,
                    "message": "Face registered successfully",
                    "face_count": face_count,
                    "is_primary": is_primary
                })
            else:
                return jsonify(result), 400
                
        finally:
            # Clean up temporary file
            if os.path.exists(temp_path):
                os.remove(temp_path)
    
    except Exception as e:
        return jsonify({
            "success": False,
            "message": f"Error registering face: {str(e)}"
        }), 500

@face_auth_app.route('/face-auth/login', methods=['POST'])
def face_login():
    """
    Authenticate user using face recognition
    Expected file: 'face_image' (multipart/form-data)
    Expected JSON payload:
    {
        "user_id": "string"
    }
    """
    try:
        # Validate request
        if 'face_image' not in request.files:
            return jsonify({
                "success": False,
                "message": "No face image provided"
            }), 400
        
        file = request.files['face_image']
        if file.filename == '':
            return jsonify({
                "success": False,
                "message": "No file selected"
            }), 400
        
        if not face_auth_manager.allowed_file(file.filename):
            return jsonify({
                "success": False,
                "message": "Invalid file type. Only PNG, JPG, JPEG, GIF are allowed"
            }), 400
        
        # Get JSON data
        try:
            data = json.loads(request.form.get('data', '{}'))
        except json.JSONDecodeError:
            data = {}
        
        user_id = data.get('user_id')
        if not user_id:
            return jsonify({
                "success": False,
                "message": "user_id is required"
            }), 400
        
        # Save uploaded file temporarily
        filename = secure_filename(file.filename)
        timestamp = int(time.time())
        temp_filename = f"login_{user_id}_{timestamp}_{filename}"
        temp_path = os.path.join(face_auth_manager.config.TEMP_FOLDER, temp_filename)
        file.save(temp_path)
        
        try:
            # Get client info
            client_info = get_client_info()
            
            # Verify face
            result = face_auth_manager.verify_face_login(
                user_id, 
                temp_path,
                client_info['ip_address'],
                client_info['user_agent']
            )
            
            return jsonify(result)
            
        finally:
            # Clean up temporary file
            if os.path.exists(temp_path):
                os.remove(temp_path)
    
    except Exception as e:
        return jsonify({
            "success": False,
            "message": f"Error during face login: {str(e)}"
        }), 500

@face_auth_app.route('/face-auth/verify-any-user', methods=['POST'])
def verify_any_user():
    """
    Verify face against all users (for login page)
    Expected JSON payload:
    {
        "image": "data:image/jpeg;base64,..."
    }
    """
    try:
        data = request.get_json()
        if not data or 'image' not in data:
            return jsonify({
                "success": False,
                "message": "No image data provided"
            }), 400
        
        image_data = data['image']
        if not image_data.startswith('data:image/'):
            return jsonify({
                "success": False,
                "message": "Invalid image format"
            }), 400
        
        # Extract base64 data
        header, base64_data = image_data.split(',', 1)
        
        # Save to temporary file
        timestamp = int(time.time())
        temp_filename = f"verify_any_{timestamp}.jpg"
        temp_path = os.path.join(face_auth_manager.config.TEMP_FOLDER, temp_filename)
        
        with open(temp_path, 'wb') as f:
            import base64
            f.write(base64.b64decode(base64_data))
        
        try:
            # Get client info
            client_info = get_client_info()
            
            # Verify against all users
            result = face_auth_manager.verify_face_against_all_users(
                temp_path,
                client_info['ip_address'],
                client_info['user_agent']
            )
            
            return jsonify(result)
            
        finally:
            # Clean up temporary file
            if os.path.exists(temp_path):
                os.remove(temp_path)
    
    except Exception as e:
        return jsonify({
            "success": False,
            "message": f"Error during face verification: {str(e)}"
        }), 500

@face_auth_app.route('/face-auth/status/<user_id>', methods=['GET'])
def get_face_auth_status(user_id):
    """Get face authentication status for a user"""
    try:
        is_enabled = face_auth_manager.db.is_face_auth_enabled(user_id)
        face_count = face_auth_manager.get_user_face_count(user_id)
        
        return jsonify({
            "success": True,
            "user_id": user_id,
            "face_auth_enabled": is_enabled,
            "registered_faces": face_count
        })
    
    except Exception as e:
        return jsonify({
            "success": False,
            "message": f"Error getting face auth status: {str(e)}"
        }), 500

@face_auth_app.route('/face-auth/faces/<user_id>', methods=['GET'])
def get_user_faces(user_id):
    """Get list of registered faces for a user"""
    try:
        face_encodings = face_auth_manager.db.get_user_face_encodings(user_id)
        faces = []
        
        for i, (_, face_path, is_primary) in enumerate(face_encodings):
            faces.append({
                "index": i,
                "path": face_path,
                "is_primary": is_primary,
                "filename": os.path.basename(face_path)
            })
        
        return jsonify({
            "success": True,
            "user_id": user_id,
            "faces": faces
        })
    
    except Exception as e:
        return jsonify({
            "success": False,
            "message": f"Error getting user faces: {str(e)}"
        }), 500

@face_auth_app.route('/face-auth/faces/<user_id>', methods=['DELETE'])
def delete_user_faces(user_id):
    """Delete all face data for a user"""
    try:
        success = face_auth_manager.delete_user_faces(user_id)
        
        if success:
            return jsonify({
                "success": True,
                "message": "All face data deleted successfully"
            })
        else:
            return jsonify({
                "success": False,
                "message": "Failed to delete face data"
            }), 500
    
    except Exception as e:
        return jsonify({
            "success": False,
            "message": f"Error deleting face data: {str(e)}"
        }), 500

@face_auth_app.route('/face-auth/faces/<user_id>/<int:face_index>', methods=['DELETE'])
def delete_specific_face(user_id, face_index):
    """Delete a specific face for a user"""
    try:
        face_encodings = face_auth_manager.db.get_user_face_encodings(user_id)
        
        if face_index >= len(face_encodings):
            return jsonify({
                "success": False,
                "message": "Face index out of range"
            }), 400
        
        _, face_path, _ = face_encodings[face_index]
        
        # Delete face image file
        if os.path.exists(face_path):
            os.remove(face_path)
        
        # Delete from database
        with face_auth_manager.db.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                DELETE FROM face_encodings 
                WHERE user_id = ? AND face_image_path = ?
            ''', (user_id, face_path))
            conn.commit()
        
        return jsonify({
            "success": True,
            "message": "Face deleted successfully"
        })
    
    except Exception as e:
        return jsonify({
            "success": False,
            "message": f"Error deleting face: {str(e)}"
        }), 500

@face_auth_app.route('/face-auth/faces/<user_id>/<int:face_index>/primary', methods=['POST'])
def set_primary_face(user_id, face_index):
    """Set a specific face as primary for a user"""
    try:
        face_encodings = face_auth_manager.db.get_user_face_encodings(user_id)
        
        if face_index >= len(face_encodings):
            return jsonify({
                "success": False,
                "message": "Face index out of range"
            }), 400
        
        _, face_path, _ = face_encodings[face_index]
        
        # Update database
        with face_auth_manager.db.get_connection() as conn:
            cursor = conn.cursor()
            # Unset all primary faces
            cursor.execute('''
                UPDATE face_encodings SET is_primary = 0 WHERE user_id = ?
            ''', (user_id,))
            # Set selected face as primary
            cursor.execute('''
                UPDATE face_encodings SET is_primary = 1 
                WHERE user_id = ? AND face_image_path = ?
            ''', (user_id, face_path))
            conn.commit()
        
        return jsonify({
            "success": True,
            "message": "Primary face updated successfully"
        })
    
    except Exception as e:
        return jsonify({
            "success": False,
            "message": f"Error setting primary face: {str(e)}"
        }), 500

@face_auth_app.route('/face-auth/faces/<user_id>/<path:filename>')
def serve_face_image(user_id, filename):
    """Serve face images for display"""
    try:
        user_folder = os.path.join(face_auth_manager.config.USER_FACES_FOLDER, user_id)
        return send_from_directory(user_folder, filename)
    except Exception:
        return jsonify({"error": "Image not found"}), 404

@face_auth_app.route('/face-auth/config', methods=['GET'])
def get_config():
    """Get current face authentication configuration"""
    return jsonify({
        "success": True,
        "config": {
            "model_name": face_auth_manager.config.MODEL_NAME,
            "distance_metric": face_auth_manager.config.DISTANCE_METRIC,
            "detector_backend": face_auth_manager.config.DETECTOR_BACKEND,
            "similarity_threshold": face_auth_manager.config.SIMILARITY_THRESHOLD,
            "max_login_attempts": face_auth_manager.config.MAX_LOGIN_ATTEMPTS,
            "lockout_duration_minutes": face_auth_manager.config.LOCKOUT_DURATION_MINUTES
        }
    })

@face_auth_app.route('/face-auth/config', methods=['POST'])
def update_config():
    """Update face authentication configuration"""
    try:
        data = request.get_json()
        
        if 'similarity_threshold' in data:
            face_auth_manager.config.SIMILARITY_THRESHOLD = float(data['similarity_threshold'])
        
        if 'max_login_attempts' in data:
            face_auth_manager.config.MAX_LOGIN_ATTEMPTS = int(data['max_login_attempts'])
        
        if 'lockout_duration_minutes' in data:
            face_auth_manager.config.LOCKOUT_DURATION_MINUTES = int(data['lockout_duration_minutes'])
        
        return jsonify({
            "success": True,
            "message": "Configuration updated successfully"
        })
    
    except Exception as e:
        return jsonify({
            "success": False,
            "message": f"Error updating configuration: {str(e)}"
        }), 500

@face_auth_app.route('/face-auth/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        "success": True,
        "message": "Face authentication service is running",
        "timestamp": time.time()
    })

@face_auth_app.route('/face-auth/cleanup', methods=['POST'])
def cleanup_encodings():
    """Clean up invalid face encodings"""
    try:
        result = face_auth_manager.cleanup_invalid_encodings()
        return jsonify(result)
    except Exception as e:
        return jsonify({
            "success": False,
            "message": f"Error during cleanup: {str(e)}"
        }), 500

if __name__ == '__main__':
    # Run the face auth API server
    face_auth_app.run(debug=True, port=5001)
