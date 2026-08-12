#!/bin/bash
echo "Starting Voice AI Service..."
cd voice_ai_service
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python app.py
