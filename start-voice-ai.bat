@echo off
echo Starting Voice AI Service...
cd voice_ai_service
python -m venv venv
call venv\Scripts\activate
pip install -r requirements.txt
python app.py
pause
