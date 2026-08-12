# 🔐 LunoWallet DeepFace Authentication Integration

## Quick Start

### 1. Install Dependencies
```bash
cd face_auth_deepface
pip install -r requirements.txt
```

### 2. Start DeepFace API
```bash
# Windows
start-deepface-api.bat

# Or manually
python start_deepface_api.py
```

### 3. Start LunoWallet
```bash
npm start
```

### 4. Test Integration
```bash
node test_deepface_integration.js
```

## 🎯 What's Added

- **Face Registration**: Users can register faces in settings
- **Face Login**: Secure face-based authentication
- **Multiple Faces**: Support for multiple faces per user
- **Primary Face**: Set one face as primary for faster recognition
- **Security**: Rate limiting, encrypted storage, IP tracking

## 📍 Access Points

- **Face Registration**: `http://localhost:3000/deepface-auth/enrollment`
- **DeepFace API**: `http://localhost:5001`
- **API Health**: `http://localhost:5001/face-auth/health`

## 🔧 API Endpoints

### Face Registration (Protected)
- `GET /deepface-auth/enrollment` - Enrollment page
- `POST /deepface-auth/enrollment/enroll` - Register face

### Face Login (Public)
- `POST /deepface-auth/verify-login` - Verify face login

### Face Management (Protected)
- `GET /deepface-auth/status` - Get face auth status
- `GET /deepface-auth/faces` - Get user's faces
- `DELETE /deepface-auth/faces` - Delete all faces

## 🛠️ Troubleshooting

### Common Issues

1. **Camera not working**
   - Check browser permissions
   - Use HTTPS in production

2. **API not responding**
   - Check if DeepFace API is running
   - Verify port 5001 is available

3. **Face not detected**
   - Ensure good lighting
   - Clear face visibility

### Debug Commands

```bash
# Check DeepFace API health
curl http://localhost:5001/face-auth/health

# Check LunoWallet health
curl http://localhost:3000/

# Run integration tests
node test_deepface_integration.js
```

## 📚 Documentation

- **Full Integration Guide**: `DEEPFACE_INTEGRATION_GUIDE.md`
- **API Documentation**: `face_auth_deepface/README.md`
- **Frontend Guide**: `public/js/face_auth_frontend.js`

## 🚀 Production Notes

- Use HTTPS for camera access
- Consider PostgreSQL instead of SQLite
- Implement proper logging and monitoring
- Ensure GDPR compliance

---

**Your LunoWallet now has advanced face authentication!** 🎉
