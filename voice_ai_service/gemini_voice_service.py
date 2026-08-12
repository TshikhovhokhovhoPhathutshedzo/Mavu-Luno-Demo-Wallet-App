"""
Enhanced Voice AI Service with Gemini Live API (Python)
Provides realistic voice conversation capabilities with financial data access
"""

import os
import asyncio
import base64
import io
import traceback
import json
import logging
from typing import Optional, Dict, Any
from flask import Flask, request, jsonify
from flask_cors import CORS
import threading
import queue

import cv2
import pyaudio
import PIL.Image
import mss

from google import genai
from google.genai import types

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Audio configuration
FORMAT = pyaudio.paInt16
CHANNELS = 1
SEND_SAMPLE_RATE = 16000
RECEIVE_SAMPLE_RATE = 24000
CHUNK_SIZE = 1024

MODEL = "models/gemini-2.5-flash-preview-native-audio-dialog"

# Initialize Flask app
app = Flask(__name__)
CORS(app)

# Initialize Gemini client
client = genai.Client(
    http_options={"api_version": "v1beta"},
    api_key=os.environ.get("GEMINI_API_KEY"),
)

# Voice configuration for realistic speech
CONFIG = types.LiveConnectConfig(
    response_modalities=["AUDIO"],
    media_resolution="MEDIA_RESOLUTION_MEDIUM",
    speech_config=types.SpeechConfig(
        voice_config=types.VoiceConfig(
            prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name="Zephyr")
        )
    ),
    context_window_compression=types.ContextWindowCompressionConfig(
        trigger_tokens=25600,
        sliding_window=types.SlidingWindow(target_tokens=12800),
    ),
)

class GeminiVoiceService:
    def __init__(self):
        self.pya = pyaudio.PyAudio()
        self.active_sessions = {}
        self.audio_queues = {}
        self.text_queues = {}
        
    async def start_voice_session(self, user_id: str, context: Dict[str, Any] = None):
        """Start a new voice session for a user"""
        try:
            session_id = f"voice_session_{user_id}_{asyncio.get_event_loop().time()}"
            
            # Create queues for this session
            self.audio_queues[session_id] = asyncio.Queue()
            self.text_queues[session_id] = asyncio.Queue()
            
            # Store session info
            self.active_sessions[session_id] = {
                'user_id': user_id,
                'context': context or {},
                'status': 'active',
                'created_at': asyncio.get_event_loop().time()
            }
            
            logger.info(f"🎤 Voice session started: {session_id} for user: {user_id}")
            return session_id
            
        except Exception as e:
            logger.error(f"❌ Failed to start voice session: {e}")
            raise e
    
    async def process_text_command(self, session_id: str, text: str) -> str:
        """Process a text command and return AI response"""
        try:
            if session_id not in self.active_sessions:
                raise ValueError(f"Session {session_id} not found")
            
            # Get user context
            context = self.active_sessions[session_id].get('context', {})
            
            # Create system prompt with context
            system_prompt = self.create_system_prompt(context)
            
            # Process with Gemini Live API
            async with client.aio.live.connect(model=MODEL, config=CONFIG) as session:
                # Send the text command
                await session.send(input=f"{system_prompt}\n\nUser: {text}", end_of_turn=True)
                
                # Get response
                turn = session.receive()
                response_text = ""
                
                async for response in turn:
                    if response.text:
                        response_text += response.text
                
                logger.info(f"✅ Processed command for session {session_id}: {text[:50]}...")
                return response_text
                
        except Exception as e:
            logger.error(f"❌ Failed to process command: {e}")
            return f"Sorry, I couldn't process that request: {str(e)}"
    
    async def synthesize_speech(self, session_id: str, text: str) -> bytes:
        """Synthesize speech from text using Gemini Live API"""
        try:
            if session_id not in self.active_sessions:
                raise ValueError(f"Session {session_id} not found")
            
            # Create audio queue for this synthesis
            audio_queue = asyncio.Queue()
            
            async with client.aio.live.connect(model=MODEL, config=CONFIG) as session:
                # Send text for synthesis
                await session.send(input=text, end_of_turn=True)
                
                # Collect audio data
                turn = session.receive()
                audio_data = b""
                
                async for response in turn:
                    if response.data:
                        audio_data += response.data
                
                logger.info(f"🎵 Synthesized speech for session {session_id}: {len(audio_data)} bytes")
                return audio_data
                
        except Exception as e:
            logger.error(f"❌ Failed to synthesize speech: {e}")
            return b""
    
    def create_system_prompt(self, context: Dict[str, Any]) -> str:
        """Create system prompt with user context"""
        context_info = ""
        if context:
            context_info = f"""
User: {context.get('username', 'User')}
Balance: R{context.get('balance', 0)}
Credit Score: {context.get('creditScore', 'Not available')}
"""
        
        return f"""You are LunoWallet, a comprehensive financial assistant for South African users.{context_info}

Be friendly, helpful, and provide practical financial advice. Use South African context (Rands, local services)."""
    
    def stop_session(self, session_id: str):
        """Stop a voice session"""
        if session_id in self.active_sessions:
            self.active_sessions[session_id]['status'] = 'inactive'
            # Clean up queues
            if session_id in self.audio_queues:
                del self.audio_queues[session_id]
            if session_id in self.text_queues:
                del self.text_queues[session_id]
            logger.info(f"🛑 Stopped voice session: {session_id}")

# Initialize voice service
voice_service = GeminiVoiceService()

# API Routes
@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'service': 'Gemini Voice AI Service (Python)',
        'timestamp': asyncio.get_event_loop().time(),
        'active_sessions': len(voice_service.active_sessions)
    })

@app.route('/api/voice/start-session', methods=['POST'])
def start_session():
    """Start a new voice session"""
    try:
        data = request.get_json()
        user_id = data.get('user_id')
        context = data.get('context', {})
        
        if not user_id:
            return jsonify({'error': 'user_id is required'}), 400
        
        # Run async function in new event loop
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        session_id = loop.run_until_complete(voice_service.start_voice_session(user_id, context))
        loop.close()
        
        return jsonify({
            'success': True,
            'session_id': session_id,
            'message': 'Voice session started successfully'
        })
        
    except Exception as e:
        logger.error(f"Error starting session: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/voice/process-command', methods=['POST'])
def process_command():
    """Process a text command"""
    try:
        data = request.get_json()
        session_id = data.get('session_id')
        text = data.get('text')
        
        if not session_id or not text:
            return jsonify({'error': 'session_id and text are required'}), 400
        
        # Run async function in new event loop
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        response = loop.run_until_complete(voice_service.process_text_command(session_id, text))
        loop.close()
        
        return jsonify({
            'success': True,
            'response': response,
            'session_id': session_id
        })
        
    except Exception as e:
        logger.error(f"Error processing command: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/voice/synthesize', methods=['POST'])
def synthesize():
    """Synthesize speech from text"""
    try:
        data = request.get_json()
        session_id = data.get('session_id')
        text = data.get('text')
        
        if not session_id or not text:
            return jsonify({'error': 'session_id and text are required'}), 400
        
        # Run async function in new event loop
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        audio_data = loop.run_until_complete(voice_service.synthesize_speech(session_id, text))
        loop.close()
        
        # Return audio data as base64
        audio_base64 = base64.b64encode(audio_data).decode('utf-8')
        
        return jsonify({
            'success': True,
            'audio_data': audio_base64,
            'session_id': session_id
        })
        
    except Exception as e:
        logger.error(f"Error synthesizing speech: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/voice/stop-session', methods=['POST'])
def stop_session():
    """Stop a voice session"""
    try:
        data = request.get_json()
        session_id = data.get('session_id')
        
        if not session_id:
            return jsonify({'error': 'session_id is required'}), 400
        
        voice_service.stop_session(session_id)
        
        return jsonify({
            'success': True,
            'message': 'Voice session stopped successfully'
        })
        
    except Exception as e:
        logger.error(f"Error stopping session: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/voice/status', methods=['GET'])
def get_status():
    """Get service status"""
    return jsonify({
        'success': True,
        'active_sessions': len(voice_service.active_sessions),
        'sessions': list(voice_service.active_sessions.keys())
    })

if __name__ == '__main__':
    # Check for required environment variables
    if not os.environ.get('GEMINI_API_KEY'):
        logger.error("❌ GEMINI_API_KEY environment variable is required")
        exit(1)
    
    logger.info("🚀 Starting Gemini Voice AI Service (Python)")
    logger.info(f"📊 Using model: {MODEL}")
    logger.info(f"🎵 Voice: Zephyr (Realistic)")
    
    # Run the Flask app
    app.run(host='0.0.0.0', port=5002, debug=True)