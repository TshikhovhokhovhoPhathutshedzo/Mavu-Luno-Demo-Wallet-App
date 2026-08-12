#!/usr/bin/env python3
"""
Setup script for LunoWallet Face Authentication Integration
This script helps set up the face authentication system
"""

import os
import sys
import subprocess
import sqlite3
from pathlib import Path

def check_python_version():
    """Check if Python version is compatible"""
    if sys.version_info < (3, 7):
        print("❌ Python 3.7 or higher is required")
        sys.exit(1)
    print("✅ Python version check passed")

def install_dependencies():
    """Install required dependencies"""
    print("📦 Installing dependencies...")
    
    dependencies = [
        "deepface",
        "opencv-python",
        "numpy",
        "flask",
        "werkzeug",
        "requests",
        "tf-keras"
    ]
    
    for dep in dependencies:
        try:
            subprocess.check_call([sys.executable, "-m", "pip", "install", dep])
            print(f"✅ Installed {dep}")
        except subprocess.CalledProcessError:
            print(f"❌ Failed to install {dep}")
            return False
    
    return True

def create_directories():
    """Create necessary directories"""
    print("📁 Creating directories...")
    
    directories = [
        "face_data",
        "face_data/user_faces",
        "face_data/temp",
        "uploads",
        "uploads/compare",
        "uploads/target",
        "uploads/compare/extracted",
        "uploads/compare/selected",
        "uploads/target/extracted",
        "uploads/target/selected"
    ]
    
    for directory in directories:
        Path(directory).mkdir(parents=True, exist_ok=True)
        print(f"✅ Created directory: {directory}")

def test_imports():
    """Test if all required modules can be imported"""
    print("🧪 Testing imports...")
    
    try:
        import deepface
        print("✅ DeepFace imported successfully")
    except ImportError as e:
        print(f"❌ DeepFace import failed: {e}")
        return False
    
    try:
        import cv2
        print("✅ OpenCV imported successfully")
    except ImportError as e:
        print(f"❌ OpenCV import failed: {e}")
        return False
    
    try:
        import numpy as np
        print("✅ NumPy imported successfully")
    except ImportError as e:
        print(f"❌ NumPy import failed: {e}")
        return False
    
    try:
        import flask
        print("✅ Flask imported successfully")
    except ImportError as e:
        print(f"❌ Flask import failed: {e}")
        return False
    
    return True

def test_face_auth_system():
    """Test the face authentication system"""
    print("🔍 Testing face authentication system...")
    
    try:
        from face_auth_integration import face_auth_manager
        
        # Test database initialization
        print("✅ Face authentication manager initialized")
        
        # Test configuration
        config = face_auth_manager.config
        print(f"✅ Configuration loaded: {config.MODEL_NAME}, {config.DETECTOR_BACKEND}")
        
        return True
    except Exception as e:
        print(f"❌ Face authentication system test failed: {e}")
        return False

def create_demo_user():
    """Create a demo user for testing"""
    print("👤 Creating demo user...")
    
    try:
        from face_auth_integration import face_auth_manager
        
        # Create demo user
        success = face_auth_manager.db.create_user("demo_user", "Demo User", "demo@example.com")
        
        if success:
            print("✅ Demo user created successfully")
        else:
            print("ℹ️ Demo user already exists")
        
        return True
    except Exception as e:
        print(f"❌ Failed to create demo user: {e}")
        return False

def create_startup_script():
    """Create a startup script for the face auth API"""
    print("🚀 Creating startup script...")
    
    startup_script = """#!/usr/bin/env python3
'''
Startup script for LunoWallet Face Authentication API
'''

import sys
import os
from face_auth_api import face_auth_app

if __name__ == '__main__':
    print("🔐 Starting LunoWallet Face Authentication API...")
    print("📍 API will be available at: http://localhost:5001")
    print("📚 API documentation: http://localhost:5001/face-auth/health")
    print("🛑 Press Ctrl+C to stop the server")
    
    try:
        face_auth_app.run(debug=True, host='0.0.0.0', port=5001)
    except KeyboardInterrupt:
        print("\\n🛑 Server stopped by user")
    except Exception as e:
        print(f"❌ Server error: {e}")
"""
    
    with open("start_face_auth_api.py", "w") as f:
        f.write(startup_script)
    
    # Make it executable on Unix systems
    if os.name != 'nt':
        os.chmod("start_face_auth_api.py", 0o755)
    
    print("✅ Startup script created: start_face_auth_api.py")

def create_integration_example():
    """Create an example integration file"""
    print("📝 Creating integration example...")
    
    integration_example = """# LunoWallet Face Authentication Integration Example

## Quick Start

1. Start the Face Authentication API:
   ```bash
   python start_face_auth_api.py
   ```

2. Open the example pages in your browser:
   - Settings: `example_settings_page.html`
   - Login: `example_login_page.html`

## Integration Steps

### Backend Integration

1. Add to your LunoWallet Flask app:
   ```python
   from face_auth_api import face_auth_app
   app.register_blueprint(face_auth_app, url_prefix='/api')
   ```

2. Update user management to work with face auth:
   - Modify `getCurrentUserId()` in `face_auth_frontend.js`
   - Modify `getCurrentUsername()` in `face_auth_frontend.js`

### Frontend Integration

1. Include the JavaScript file:
   ```html
   <script src="face_auth_frontend.js"></script>
   ```

2. Add HTML containers to your pages:
   ```html
   <!-- Settings page -->
   <div id="face-registration-container"></div>
   
   <!-- Login page -->
   <div id="face-login-container"></div>
   ```

3. Initialize components:
   ```javascript
   const faceAuthManager = new FaceAuthManager('http://localhost:5001');
   const faceRegistrationComponent = new FaceRegistrationComponent('face-registration-container', faceAuthManager);
   const faceLoginComponent = new FaceLoginComponent('face-login-container', faceAuthManager);
   ```

## API Endpoints

- POST `/face-auth/register` - Register a face
- POST `/face-auth/login` - Login with face
- GET `/face-auth/status/{user_id}` - Get face auth status
- GET `/face-auth/faces/{user_id}` - Get user's faces
- DELETE `/face-auth/faces/{user_id}` - Delete all faces

## Security Features

- Rate limiting (3 attempts per 15 minutes)
- Encrypted face data storage
- IP address tracking
- Configurable similarity thresholds

## Troubleshooting

1. Check API server is running: http://localhost:5001/face-auth/health
2. Check browser console for JavaScript errors
3. Verify camera permissions are granted
4. Check server logs for backend errors

## Support

For issues or questions, check the integration guide: `lunowallet_face_integration_guide.md`
"""
    
    with open("INTEGRATION_EXAMPLE.md", "w") as f:
        f.write(integration_example)
    
    print("✅ Integration example created: INTEGRATION_EXAMPLE.md")

def main():
    """Main setup function"""
    print("🔐 LunoWallet Face Authentication Setup")
    print("=" * 50)
    
    # Check Python version
    check_python_version()
    
    # Install dependencies
    if not install_dependencies():
        print("❌ Setup failed: Could not install dependencies")
        sys.exit(1)
    
    # Create directories
    create_directories()
    
    # Test imports
    if not test_imports():
        print("❌ Setup failed: Import tests failed")
        sys.exit(1)
    
    # Test face auth system
    if not test_face_auth_system():
        print("❌ Setup failed: Face authentication system test failed")
        sys.exit(1)
    
    # Create demo user
    create_demo_user()
    
    # Create startup script
    create_startup_script()
    
    # Create integration example
    create_integration_example()
    
    print("\n" + "=" * 50)
    print("🎉 Setup completed successfully!")
    print("\n📋 Next steps:")
    print("1. Start the Face Auth API: python start_face_auth_api.py")
    print("2. Open example_settings_page.html in your browser")
    print("3. Open example_login_page.html in your browser")
    print("4. Follow the integration guide: lunowallet_face_integration_guide.md")
    print("\n🔗 API will be available at: http://localhost:5001")
    print("📚 Health check: http://localhost:5001/face-auth/health")

if __name__ == "__main__":
    main()
