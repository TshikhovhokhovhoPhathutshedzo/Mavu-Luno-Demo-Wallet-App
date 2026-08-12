#!/usr/bin/env python3
"""
Startup script for LunoWallet DeepFace Authentication API
This script starts the DeepFace API server for face authentication
"""

import os
import sys
import subprocess
import time
import signal
import threading
from pathlib import Path

class DeepFaceAPIManager:
    def __init__(self):
        self.script_dir = Path(__file__).parent
        self.face_auth_dir = self.script_dir / "face_auth_deepface"
        self.api_script = self.face_auth_dir / "face_auth_api.py"
        self.requirements_file = self.face_auth_dir / "requirements.txt"
        self.python_process = None
        self.running = False

    def check_dependencies(self):
        """Check if required dependencies are installed"""
        print("🔍 Checking dependencies...")
        
        try:
            import deepface
            import cv2
            import numpy
            import flask
            import werkzeug
            import requests
            print("✅ All dependencies are installed")
            return True
        except ImportError as e:
            print(f"❌ Missing dependency: {e}")
            print("Installing dependencies...")
            return self.install_dependencies()

    def install_dependencies(self):
        """Install required dependencies"""
        try:
            subprocess.check_call([
                sys.executable, "-m", "pip", "install", "-r", str(self.requirements_file)
            ])
            print("✅ Dependencies installed successfully")
            return True
        except subprocess.CalledProcessError as e:
            print(f"❌ Failed to install dependencies: {e}")
            return False

    def start_api(self):
        """Start the DeepFace API server"""
        if self.python_process:
            print("⚠️ DeepFace API is already running")
            return True

        try:
            print("🚀 Starting DeepFace API server...")
            print(f"📍 Working directory: {self.face_auth_dir}")
            print(f"📍 API script: {self.api_script}")
            
            # Change to the face_auth_deepface directory
            os.chdir(self.face_auth_dir)
            
            # Start the Python process
            self.python_process = subprocess.Popen([
                sys.executable, str(self.api_script)
            ], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            
            self.running = True
            
            # Start monitoring thread
            monitor_thread = threading.Thread(target=self.monitor_process)
            monitor_thread.daemon = True
            monitor_thread.start()
            
            # Wait a moment for the server to start
            time.sleep(3)
            
            print("✅ DeepFace API server started successfully")
            print("📍 API available at: http://localhost:5001")
            print("📍 Health check: http://localhost:5001/face-auth/health")
            print("🛑 Press Ctrl+C to stop the server")
            
            return True
            
        except Exception as e:
            print(f"❌ Failed to start DeepFace API: {e}")
            return False

    def monitor_process(self):
        """Monitor the Python process"""
        while self.running and self.python_process:
            if self.python_process.poll() is not None:
                print("⚠️ DeepFace API process stopped unexpectedly")
                self.running = False
                break
            time.sleep(1)

    def stop_api(self):
        """Stop the DeepFace API server"""
        if self.python_process:
            print("🛑 Stopping DeepFace API server...")
            self.running = False
            self.python_process.terminate()
            
            # Wait for process to terminate
            try:
                self.python_process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                print("⚠️ Force killing DeepFace API process...")
                self.python_process.kill()
                self.python_process.wait()
            
            self.python_process = None
            print("✅ DeepFace API server stopped")

    def signal_handler(self, signum, frame):
        """Handle shutdown signals"""
        print("\n🛑 Shutdown signal received...")
        self.stop_api()
        sys.exit(0)

    def run(self):
        """Main run method"""
        print("🔐 LunoWallet DeepFace Authentication API")
        print("=" * 50)
        
        # Set up signal handlers
        signal.signal(signal.SIGINT, self.signal_handler)
        signal.signal(signal.SIGTERM, self.signal_handler)
        
        # Check dependencies
        if not self.check_dependencies():
            print("❌ Failed to install dependencies")
            sys.exit(1)
        
        # Start API
        if not self.start_api():
            print("❌ Failed to start DeepFace API")
            sys.exit(1)
        
        try:
            # Keep the main thread alive
            while self.running:
                time.sleep(1)
        except KeyboardInterrupt:
            self.signal_handler(signal.SIGINT, None)

def main():
    """Main function"""
    manager = DeepFaceAPIManager()
    manager.run()

if __name__ == "__main__":
    main()
