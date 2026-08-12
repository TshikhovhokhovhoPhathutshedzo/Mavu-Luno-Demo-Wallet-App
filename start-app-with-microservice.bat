@echo off
echo ========================================
echo    Luno Backend with Microservices
echo ========================================
echo.

echo Starting Face Recognition Service...
start "Face Recognition Service" cmd /k "cd face_microservice && python enhanced_app.py"
timeout /t 3 /nobreak >nul

echo Starting Voice AI Service...
start "Voice AI Service" cmd /k "cd voice_ai_service && python app.py"
timeout /t 3 /nobreak >nul

echo Starting Luno Backend application...
echo All microservices are starting up.
echo.

echo Press Ctrl+C to stop the main app.
echo Close the microservice windows to stop them.
echo.

node server.js

pause
