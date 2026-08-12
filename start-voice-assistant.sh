#!/bin/bash
echo "========================================"
echo "   Voice Assistant Startup Script"
echo "========================================"
echo

echo "Starting Voice AI Service..."
gnome-terminal -- bash -c "cd voice_ai_service && python simple_voice_service.py; exec bash" &
sleep 3

echo "Starting Main Application..."
gnome-terminal -- bash -c "npm start; exec bash" &
sleep 5

echo
echo "========================================"
echo "   Voice Assistant Ready!"
echo "========================================"
echo
echo "Services started:"
echo "- Voice AI Service: http://localhost:5001"
echo "- Main Application: http://localhost:3000"
echo "- Voice Page: http://localhost:3000/voice"
echo
echo "To test the system, run:"
echo "node test_voice_system.js"
echo
echo "Opening voice page..."
sleep 2
xdg-open http://localhost:3000/voice
