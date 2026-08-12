# CMD Setup Guide for Face Recognition

## 🚀 **Why Use CMD Instead of PowerShell?**

- **No execution policy issues** - CMD doesn't have script restrictions
- **Simpler syntax** - No complex quoting or escaping needed
- **Better compatibility** - Works with all batch files
- **No security prompts** - Direct execution without permissions

## 📋 **Step-by-Step Instructions**

### **Step 1: Open Command Prompt**
1. Press `Windows + R`
2. Type `cmd` and press Enter
3. Or search for "Command Prompt" in Start menu

### **Step 2: Navigate to Project**
```cmd
cd C:\Users\TSHIKHOVHOKHOVHO\Desktop\LunoBackend
```

### **Step 3: Start the Microservice**
```cmd
start-face-microservice.cmd
```

### **Step 4: Wait for Installation**
- First time will install TensorFlow (may take 5-10 minutes)
- You'll see progress messages
- Wait for "Running on http://0.0.0.0:5001"

### **Step 5: Test in Application**
1. Open your LunoBackend application
2. Go to Settings → Face Login
3. Click "Test Service"
4. Should see: "✅ Face recognition service is running!"

## 🔧 **Manual CMD Commands (if needed)**

If the batch file doesn't work, run these commands manually:

```cmd
cd face_microservice
py -m pip install fastapi uvicorn tensorflow opencv-python pillow numpy
py app.py
```

## ✅ **Expected Output**

When successful, you should see:
```
INFO:     Started server process [xxxx]
INFO:     Waiting for application startup.
INFO:     Uvicorn running on http://0.0.0.0:5001 (Press CTRL+C to quit)
```

## 🔍 **Troubleshooting**

### **"Python was not found"**
- Make sure Python is installed and in PATH
- Try: `py --version`

### **"Module not found"**
- Run: `py -m pip install [package_name]`
- Or run the batch file again

### **"Port 5001 already in use"**
- Close other applications using port 5001
- Or change port in `app.py`

## 🎯 **Benefits of CMD Approach**

- **No PowerShell execution policy** - Works immediately
- **No complex syntax** - Simple commands
- **Better error messages** - Clear feedback
- **Faster execution** - No security checks

## 📞 **Need Help?**

If you're still having issues:
1. Make sure you're using CMD, not PowerShell
2. Check if Python 3.10+ is installed: `py --version`
3. Try running commands manually step by step
4. Ensure you have internet connection for downloads 