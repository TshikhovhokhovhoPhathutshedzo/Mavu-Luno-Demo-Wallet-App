# Python Setup Guide for Face Recognition

## 🐍 **Step 1: Install Python**

### **Option A: Download from python.org (Recommended)**
1. Go to [https://python.org/downloads](https://python.org/downloads)
2. Download the latest Python version (3.10 or higher)
3. **IMPORTANT:** During installation, check "Add Python to PATH"
4. Complete the installation

### **Option B: Install from Microsoft Store**
1. Open Microsoft Store
2. Search for "Python"
3. Install the latest version
4. This automatically adds Python to PATH

## 🔍 **Step 2: Verify Python Installation**

Open a new terminal/command prompt and run:
```bash
python --version
```

You should see something like: `Python 3.10.x`

## 🚀 **Step 3: Start the Face Microservice**

### **Method 1: Using the provided script**
```powershell
# In PowerShell (run as Administrator if needed)
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
.\start-face-microservice.ps1
```

### **Method 2: Manual start**
```bash
# Navigate to the microservice directory
cd face_microservice

# Install required packages
pip install fastapi uvicorn torch facenet_pytorch pillow numpy

# Start the microservice
python app.py
```

### **Method 3: Using batch file**
```cmd
start-face-microservice.bat
```

## ✅ **Step 4: Verify the Microservice**

You should see output like:
```
INFO:     Started server process [xxxx]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:5001 (Press CTRL+C to quit)
```

## 🧪 **Step 5: Test in the Application**

1. Open your LunoBackend application
2. Go to Settings → Face Login
3. Click "Test Service"
4. You should see: "✅ Face recognition service is running!"

## 🔧 **Troubleshooting**

### **"Python was not found"**
- Python is not installed or not in PATH
- Reinstall Python and check "Add Python to PATH"
- Or use the full path: `C:\Users\[YourUsername]\AppData\Local\Programs\Python\Python310\python.exe`

### **"Execution policy" error**
- Run PowerShell as Administrator
- Execute: `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`

### **"Port 5001 already in use"**
- Another service is using port 5001
- Kill the process or change the port in `face_microservice/app.py`

### **"Module not found" errors**
- Install missing packages: `pip install [package_name]`
- Or install all requirements: `pip install -r requirements.txt`

## 📞 **Need Help?**

If you're still having issues:
1. Check if Python is installed: `python --version`
2. Check if pip is available: `pip --version`
3. Try installing packages manually: `pip install fastapi uvicorn`
4. Make sure you're in the correct directory: `cd face_microservice` 