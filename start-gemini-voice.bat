@echo off
echo Starting Enhanced Voice Assistant with Gemini Live API...
echo.

cd voice_ai_service

echo Installing Python dependencies...
pip install -r requirements_gemini.txt

echo.
echo Starting Gemini Voice Service...
echo Service will be available at: http://localhost:5002
echo.

python gemini_voice_service.py

pause
