"""
Flask Web Service Wrapper for Gemini Voice Assistant
Provides HTTP API endpoints for the Node.js backend to communicate with
"""

import os
import json
import logging
from datetime import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

# Global state for voice sessions
active_sessions = {}
session_counter = 0

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        "status": "healthy",
        "service": "Gemini Voice Web Service",
        "timestamp": datetime.now().isoformat(),
        "active_sessions": len(active_sessions)
    })

@app.route('/start_session', methods=['POST'])
def start_session():
    """Start a new voice session"""
    global session_counter
    
    try:
        data = request.get_json() or {}
        user_id = data.get('user_id')
        context = data.get('context', {})
        
        session_id = f"session_{session_counter}_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        session_counter += 1
        
        # Store session data
        active_sessions[session_id] = {
            "user_id": user_id,
            "context": context,
            "created_at": datetime.now().isoformat(),
            "status": "active"
        }
        
        logger.info(f"Started voice session {session_id} for user {user_id}")
        
        return jsonify({
            "success": True,
            "session_id": session_id,
            "message": "Voice session started successfully",
            "status": "active"
        })
        
    except Exception as e:
        logger.error(f"Error starting session: {str(e)}")
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

@app.route('/stop_session', methods=['POST'])
def stop_session():
    """Stop a voice session"""
    try:
        data = request.get_json() or {}
        session_id = data.get('session_id')
        
        if session_id and session_id in active_sessions:
            del active_sessions[session_id]
            logger.info(f"Stopped voice session {session_id}")
            return jsonify({
                "success": True,
                "message": "Voice session stopped successfully"
            })
        else:
            return jsonify({
                "success": False,
                "error": "Session not found"
            }), 404
            
    except Exception as e:
        logger.error(f"Error stopping session: {str(e)}")
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

@app.route('/process_command', methods=['POST'])
def process_command():
    """Process a voice command"""
    try:
        data = request.get_json() or {}
        command = data.get('command', '')
        user_id = data.get('user_id')
        
        if not command:
            return jsonify({
                "success": False,
                "error": "No command provided"
            }), 400
        
        # For now, return a mock response
        # In a real implementation, this would process the command with Gemini
        response = {
            "success": True,
            "command": command,
            "response": f"I received your command: '{command}'. This is a mock response from the Gemini Voice Service.",
            "timestamp": datetime.now().isoformat(),
            "user_id": user_id
        }
        
        logger.info(f"Processed command for user {user_id}: {command}")
        
        return jsonify(response)
        
    except Exception as e:
        logger.error(f"Error processing command: {str(e)}")
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

@app.route('/send_financial_data', methods=['POST'])
def send_financial_data():
    """Send financial data to the voice assistant"""
    try:
        data = request.get_json() or {}
        data_type = data.get('type')
        financial_data = data.get('data', {})
        user_id = data.get('user_id')
        
        logger.info(f"Received financial data for user {user_id}: {data_type}")
        
        return jsonify({
            "success": True,
            "message": f"Financial data received and processed: {data_type}",
            "timestamp": datetime.now().isoformat()
        })
        
    except Exception as e:
        logger.error(f"Error processing financial data: {str(e)}")
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

@app.route('/status', methods=['GET'])
def get_status():
    """Get service status"""
    return jsonify({
        "success": True,
        "service": "Gemini Voice Web Service",
        "status": "running",
        "active_sessions": len(active_sessions),
        "timestamp": datetime.now().isoformat()
    })

if __name__ == '__main__':
    # Set the API key from environment
    api_key = os.environ.get('GEMINI_API_KEY')
    if not api_key:
        logger.warning("GEMINI_API_KEY not set. Some features may not work.")
    
    logger.info("Starting Gemini Voice Web Service on port 5002")
    app.run(host='0.0.0.0', port=5002, debug=True)
