# Enhanced Face Verification System

A comprehensive, secure, and high-performance face verification system for the LunoBackend application.

## 🚀 Features

### Core Functionality
- **Face Enrollment**: Multi-image capture with quality validation
- **Face Verification**: Real-time authentication with liveness detection
- **Security**: Encrypted face embeddings, rate limiting, and spoof prevention
- **Performance**: Sub-second verification with optimized algorithms
- **Scalability**: Microservice architecture with PostgreSQL backend

### Security Features
- **Encryption**: AES-256-GCM encryption for face embeddings
- **Liveness Detection**: Texture and depth analysis to prevent spoofing
- **Rate Limiting**: Configurable attempt limits per user
- **Audit Logging**: Comprehensive logging of all verification attempts
- **Session Management**: Secure enrollment sessions with expiration

### User Experience
- **Intuitive UI**: Modern, responsive interface for enrollment and login
- **Real-time Feedback**: Live face detection and quality indicators
- **Progress Tracking**: Visual progress during enrollment process
- **Settings Management**: User-configurable security preferences

## 📋 Prerequisites

- Node.js 18+ 
- PostgreSQL 12+
- Python 3.10+
- OpenCV 4.8+
- Modern web browser with camera support

## 🛠️ Installation

### 1. Database Setup

```bash
# Run the enhanced face verification setup
npm run setup-face-verification
```

This will:
- Create the enhanced database schema
- Set up indexes for optimal performance
- Create cleanup functions for expired data
- Run basic tests to verify setup

### 2. Environment Configuration

Add these variables to your `.env` file:

```env
# Enhanced Face Verification Configuration
FACE_MICROSERVICE_URL=http://localhost:5001
FACE_ENCRYPTION_KEY=your-32-character-secret-key-here!
FACE_VERIFICATION_ENABLED=true
FACE_CONFIDENCE_THRESHOLD=0.6
FACE_MAX_ATTEMPTS_PER_HOUR=10
FACE_REQUIRE_LIVENESS_CHECK=true
FACE_ALLOW_MULTIPLE_FACES=false
FACE_AUTO_UPDATE_PRIMARY=true
```

### 3. Microservice Setup

```bash
# Navigate to microservice directory
cd face_microservice

# Install Python dependencies
pip install -r requirements.txt

# Start the microservice
python enhanced_face_service.py
```

### 4. Start the Application

```bash
# Option 1: Use the startup script
./start-enhanced-face-system.sh  # Linux/Mac
start-enhanced-face-system.bat   # Windows
.\start-enhanced-face-system.ps1 # PowerShell

# Option 2: Start manually
# Terminal 1: Start microservice
cd face_microservice && python enhanced_face_service.py

# Terminal 2: Start main application
node server.js
```

## 🏗️ Architecture

### Database Schema

#### Core Tables
- **`user_face_data`**: Stores encrypted face embeddings
- **`face_verification_settings`**: User-specific security settings
- **`auth_logs`**: Authentication attempt logs
- **`face_enrollment_sessions`**: Enrollment session management
- **`face_verification_attempts`**: Detailed verification logs
- **`liveness_detection_logs`**: Liveness detection results
- **`security_events`**: Security-related events and alerts

#### Key Features
- **Encrypted Storage**: Face embeddings are encrypted before storage
- **Audit Trail**: Complete logging of all verification attempts
- **Performance Optimization**: Indexed queries for fast lookups
- **Data Retention**: Automatic cleanup of old data

### Microservice Architecture

The face recognition microservice (`enhanced_face_service.py`) provides:

- **Face Detection**: Multi-parameter OpenCV-based detection
- **Feature Extraction**: Enhanced feature extraction with LBP and HOG
- **Similarity Calculation**: Cosine similarity for face matching
- **Liveness Detection**: Texture and depth analysis
- **Batch Processing**: Support for multiple image processing

### API Endpoints

#### Face Enrollment
- `GET /api/face/enroll` - Face enrollment page
- `POST /api/face/enroll/start` - Start enrollment session
- `POST /api/face/enroll/capture` - Capture face image

#### Face Login
- `GET /api/face/login` - Face login page
- `POST /api/face/login/verify` - Verify face for login

#### Settings Management
- `GET /api/face/settings` - Face auth settings page
- `POST /api/face/settings/update` - Update settings
- `POST /api/face/settings/disable` - Disable face auth

#### Status and Logs
- `GET /api/face/status` - Check face auth status
- `GET /api/face/logs` - Get verification logs
- `GET /api/face/test` - Test microservice health

## 🔧 Configuration

### Security Settings

| Setting | Description | Default | Range |
|---------|-------------|---------|-------|
| `confidence_threshold` | Similarity threshold for verification | 0.6 | 0.5 - 0.95 |
| `max_attempts_per_hour` | Maximum verification attempts per hour | 10 | 5 - 50 |
| `require_liveness_check` | Enable liveness detection | true | true/false |
| `allow_multiple_faces` | Allow multiple face records per user | false | true/false |
| `auto_update_primary` | Auto-update primary face with better quality | true | true/false |

### Performance Tuning

#### Database Optimization
- Regular cleanup of expired sessions and old logs
- Indexed queries for fast face lookups
- Connection pooling for concurrent requests

#### Microservice Optimization
- Efficient face detection with multiple parameters
- Optimized feature extraction algorithms
- Caching of face detection models

## 🔒 Security Considerations

### Data Protection
- **Encryption**: All face embeddings encrypted with AES-256-GCM
- **No Raw Images**: Only feature vectors stored, never raw images
- **Secure Transmission**: HTTPS required for all API calls
- **Session Security**: Enrollment sessions expire after 15 minutes

### Anti-Spoofing
- **Liveness Detection**: Texture and depth analysis
- **Quality Validation**: Image quality scoring
- **Rate Limiting**: Prevents brute force attacks
- **Behavioral Analysis**: Suspicious activity detection

### Privacy Compliance
- **Minimal Data**: Only necessary face features stored
- **User Control**: Users can disable face auth at any time
- **Audit Trail**: Complete logging for compliance
- **Data Retention**: Automatic cleanup of old data

## 📊 Monitoring and Analytics

### Verification Metrics
- Success/failure rates
- Average processing time
- Confidence score distribution
- Liveness detection accuracy

### Security Monitoring
- Failed attempt patterns
- Suspicious activity detection
- Rate limiting triggers
- Security event alerts

### Performance Metrics
- API response times
- Database query performance
- Microservice health status
- Resource utilization

## 🧪 Testing

### Unit Tests
```bash
# Test face verification service
npm test

# Test specific components
node test-face-verification.js
```

### Integration Tests
```bash
# Test complete enrollment flow
node test-face-enrollment.js

# Test verification flow
node test-face-login.js
```

### Load Testing
```bash
# Test concurrent verification requests
node test-face-load.js
```

## 🚨 Troubleshooting

### Common Issues

#### Camera Not Working
- Check browser permissions
- Ensure HTTPS is enabled
- Verify camera is not in use by another application

#### Face Detection Failing
- Ensure good lighting
- Check face is centered in frame
- Verify camera quality and resolution

#### Verification Accuracy Issues
- Adjust confidence threshold
- Enable liveness detection
- Ensure high-quality enrollment images

#### Microservice Connection Issues
- Check if microservice is running on port 5001
- Verify network connectivity
- Check microservice logs for errors

### Debug Mode

Enable debug logging by setting:
```env
DEBUG_FACE_VERIFICATION=true
NODE_ENV=development
```

### Logs Location
- Application logs: `logs/app.log`
- Microservice logs: `face_microservice/logs/`
- Database logs: Check PostgreSQL logs

## 🔄 Maintenance

### Regular Tasks
- Monitor verification success rates
- Review security logs for anomalies
- Clean up expired sessions and old data
- Update face recognition models if needed

### Backup Considerations
- Database backups should include face verification tables
- Encryption keys must be securely backed up
- Consider data retention policies for compliance

## 📈 Future Enhancements

### Planned Features
- **3D Face Recognition**: Depth-based verification
- **Mobile SDK**: Native mobile app integration
- **Advanced Liveness**: Eye tracking and facial movement
- **Multi-Factor**: Combine with other biometrics
- **Cloud Integration**: Optional cloud-based processing

### Performance Improvements
- **GPU Acceleration**: CUDA support for faster processing
- **Model Optimization**: Quantized models for mobile
- **Caching**: Redis-based caching for frequent lookups
- **Load Balancing**: Multiple microservice instances

## 📞 Support

For technical support or questions:
- Check the troubleshooting section
- Review the API documentation
- Check GitHub issues
- Contact the development team

## 📄 License

This enhanced face verification system is part of the LunoBackend project and follows the same licensing terms.

---

**Note**: This system is designed for production use with proper security measures. Always test thoroughly in a staging environment before deploying to production.
