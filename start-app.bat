@echo off
echo Starting LunoBackend Application...
echo.

echo Checking if Node.js is installed...
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

echo Checking if Python is installed...
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python is not installed or not in PATH
    echo Please install Python from https://python.org/
    pause
    exit /b 1
)

echo Checking if .env file exists...
if not exist ".env" (
    echo WARNING: .env file not found
    echo Please copy env.example to .env and configure your settings
    echo.
)

echo Installing Node.js dependencies...
npm install
if errorlevel 1 (
    echo ERROR: Failed to install Node.js dependencies
    pause
    exit /b 1
)

echo.
echo Setting up face recognition microservice...
cd face_microservice

echo Creating Python virtual environment...
python -m venv venv
if errorlevel 1 (
    echo ERROR: Failed to create virtual environment
    pause
    exit /b 1
)

echo Activating virtual environment...
call venv\Scripts\activate.bat

echo Installing Python dependencies...
pip install -r requirements.txt
if errorlevel 1 (
    echo ERROR: Failed to install Python dependencies
    pause
    exit /b 1
)

echo Starting face recognition microservice...
start "Face Recognition Service" cmd /k "python app.py"

cd ..

echo.
echo Starting main application...
echo The application will be available at http://localhost:3000
echo Face recognition service will be available at http://localhost:5001
echo.
echo Press Ctrl+C to stop the application
echo.

npm start 