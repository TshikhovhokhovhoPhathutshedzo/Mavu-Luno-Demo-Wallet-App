# LunoWallet Face Authentication Integration Guide

This guide explains how to integrate the face authentication system into your LunoWallet application.

## Overview

The face authentication system provides:
- Face registration in user settings
- Face-based login authentication
- Secure face data storage
- Multiple face support per user
- Primary face designation
- Security measures (rate limiting, lockout)

## Files Created

1. **`face_auth_integration.py`** - Core face authentication logic
2. **`face_auth_api.py`** - REST API endpoints
3. **`face_auth_frontend.js`** - Frontend JavaScript components
4. **`lunowallet_face_integration_guide.md`** - This integration guide

## Backend Integration

### 1. Install Dependencies

Add these dependencies to your LunoWallet requirements:

```bash
pip install deepface opencv-python numpy sqlite3
```

### 2. Database Integration

The face authentication system uses SQLite by default. You can integrate it with your existing database by modifying the `FaceAuthDatabase` class in `face_auth_integration.py`.

### 3. API Integration

Add the face authentication API to your LunoWallet Flask app:

```python
# In your main LunoWallet app.py
from face_auth_api import face_auth_app

# Register the face auth blueprint
app.register_blueprint(face_auth_app, url_prefix='/api')

# Or run as separate service on different port
# face_auth_app.run(port=5001)
```

### 4. User Management Integration

Update the `getCurrentUserId()` and `getCurrentUsername()` methods in `face_auth_frontend.js` to work with your user management system.

## Frontend Integration

### 1. Add to Settings Page

Add this HTML to your LunoWallet settings page:

```html
<!-- Face Authentication Settings Section -->
<div class="settings-section">
    <h2>Face Authentication</h2>
    <div id="face-registration-container"></div>
</div>

<!-- Include the JavaScript -->
<script src="face_auth_frontend.js"></script>
```

### 2. Add to Login Page

Add this HTML to your LunoWallet login page:

```html
<!-- Face Login Option -->
<div class="login-option">
    <h3>Or login with your face</h3>
    <div id="face-login-container"></div>
</div>

<!-- Include the JavaScript -->
<script src="face_auth_frontend.js"></script>
```

### 3. CSS Styling

Add these CSS styles to match your LunoWallet design:

```css
.face-registration-container,
.face-login-container {
    max-width: 500px;
    margin: 20px auto;
    padding: 20px;
    border: 1px solid #ddd;
    border-radius: 8px;
    background: #f9f9f9;
}

.camera-container {
    text-align: center;
    margin: 20px 0;
}

.capture-controls,
.login-controls {
    text-align: center;
    margin: 20px 0;
}

.btn {
    padding: 10px 20px;
    margin: 5px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
}

.btn-primary { background: #007bff; color: white; }
.btn-success { background: #28a745; color: white; }
.btn-secondary { background: #6c757d; color: white; }
.btn-danger { background: #dc3545; color: white; }
.btn-warning { background: #ffc107; color: black; }
.btn-outline { background: transparent; border: 1px solid #007bff; color: #007bff; }

.status-success { color: #28a745; }
.status-error { color: #dc3545; }
.status-info { color: #007bff; }

.faces-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 15px;
    margin-top: 20px;
}

.face-item {
    text-align: center;
    border: 1px solid #ddd;
    border-radius: 8px;
    padding: 10px;
    background: white;
}

.face-thumbnail {
    width: 100px;
    height: 100px;
    object-fit: cover;
    border-radius: 4px;
    margin-bottom: 10px;
}

.face-actions {
    display: flex;
    flex-direction: column;
    gap: 5px;
}

.btn-sm {
    padding: 5px 10px;
    font-size: 12px;
}
```

## API Endpoints

### Face Registration
- **POST** `/face-auth/register` - Register a new face
- **GET** `/face-auth/status/{user_id}` - Get face auth status
- **GET** `/face-auth/faces/{user_id}` - Get user's faces
- **DELETE** `/face-auth/faces/{user_id}` - Delete all faces
- **DELETE** `/face-auth/faces/{user_id}/{face_index}` - Delete specific face
- **POST** `/face-auth/faces/{user_id}/{face_index}/primary` - Set primary face

### Face Login
- **POST** `/face-auth/login` - Authenticate with face
- **GET** `/face-auth/health` - Health check

### Configuration
- **GET** `/face-auth/config` - Get configuration
- **POST** `/face-auth/config` - Update configuration

## Security Features

1. **Rate Limiting**: Maximum 3 failed attempts per 15 minutes
2. **Face Encoding Storage**: Faces stored as encrypted embeddings, not images
3. **Secure File Handling**: Temporary files cleaned up after processing
4. **IP Tracking**: Login attempts logged with IP addresses
5. **Similarity Threshold**: Configurable face matching threshold

## Configuration Options

```python
# In face_auth_integration.py
class FaceAuthConfig:
    SIMILARITY_THRESHOLD = 0.4  # Lower = more strict
    MAX_LOGIN_ATTEMPTS = 3
    LOCKOUT_DURATION_MINUTES = 15
    MODEL_NAME = "ArcFace"  # DeepFace model
    DETECTOR_BACKEND = "retinaface"  # Face detection backend
```

## Usage Examples

### Register a Face (Settings Page)
```javascript
// The face registration component handles this automatically
// User clicks "Start Camera" -> positions face -> clicks "Capture Face"
```

### Login with Face (Login Page)
```javascript
// The face login component handles this automatically
// User enters user ID -> clicks "Start Camera" -> positions face -> clicks "Login with Face"
```

### Check Face Auth Status
```javascript
const status = await faceAuthManager.getFaceAuthStatus(userId);
if (status.success && status.face_auth_enabled) {
    // Show face login option
}
```

## Error Handling

The system handles common errors:
- Camera access denied
- No face detected in image
- Face doesn't match registered faces
- Too many failed attempts
- Network errors

## Testing

1. Start the face auth API server:
```bash
python face_auth_api.py
```

2. Test the endpoints using curl or Postman
3. Test the frontend components in your LunoWallet app

## Production Considerations

1. **HTTPS**: Always use HTTPS in production
2. **Database**: Consider using PostgreSQL/MySQL instead of SQLite
3. **File Storage**: Use cloud storage (AWS S3, etc.) for face images
4. **Monitoring**: Add logging and monitoring for security events
5. **Backup**: Regular backups of face data
6. **Privacy**: Ensure compliance with privacy regulations (GDPR, etc.)

## Troubleshooting

### Common Issues

1. **Camera not working**: Check browser permissions
2. **Face not detected**: Ensure good lighting and clear face visibility
3. **Low similarity scores**: Adjust similarity threshold or retrain with better images
4. **API errors**: Check server logs and network connectivity

### Debug Mode

Enable debug mode in the API:
```python
face_auth_app.run(debug=True, port=5001)
```

## Support

For issues or questions:
1. Check the console logs for errors
2. Verify API endpoints are accessible
3. Test with different face images
4. Check camera permissions in browser

## Future Enhancements

- Liveness detection to prevent spoofing
- Multiple face models support
- Face aging adaptation
- Mobile app integration
- Advanced security features
