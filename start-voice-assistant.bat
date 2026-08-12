@echo off
echo ========================================
echo    Voice Assistant Startup Script
echo ========================================
echo.

echo Starting Voice AI Service...
start "Voice AI Service" cmd /k "cd voice_ai_service && python simple_voice_service.py"
timeout /t 3 /nobreak >nul

echo Starting Main Application...
start "Main Application" cmd /k "npm start"
timeout /t 5 /nobreak >nul

echo.
echo ========================================
echo    Voice Assistant Ready!
echo ========================================
echo.
echo Services started:
echo - Voice AI Service: http://localhost:5001
echo - Main Application: http://localhost:3000
echo - Voice Page: http://localhost:3000/voice
echo.
echo To test the system, run:
echo node test_voice_system.js
echo.
echo Press any key to open the voice page...
pause >nul

start http://localhost:3000/voice
