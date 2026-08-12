@echo off
echo Starting LunoWallet DeepFace Authentication API...
echo.

REM Check if Python is available
python --version >nul 2>&1
if errorlevel 1 (
    echo Error: Python is not installed or not in PATH
    echo Please install Python 3.7+ and try again
    pause
    exit /b 1
)

REM Start the DeepFace API
python start_deepface_api.py

pause
