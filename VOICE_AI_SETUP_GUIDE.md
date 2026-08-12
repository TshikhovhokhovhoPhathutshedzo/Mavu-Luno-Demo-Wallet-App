# 🎤 Advanced Voice AI Assistant Setup Guide

This guide will help you set up the enhanced AI-powered voice assistant for your Luno Backend application.

## 🚀 Features

- **Advanced Speech Recognition** using OpenAI Whisper
- **Natural Text-to-Speech** using Coqui TTS
- **Intelligent Command Processing** with natural language understanding
- **Financial Commands** specialized for banking operations
- **Fallback Support** to basic voice when AI service is unavailable

## 📋 Prerequisites

- Python 3.8+ installed
- Node.js application running
- At least 4GB RAM available
- CUDA-compatible GPU (optional, for faster processing)

## 🛠️ Installation Steps

### Step 1: Install Python Dependencies

1. **Navigate to the voice AI service directory:**
   ```bash
   cd voice_ai_service
   ```

2. **Create a virtual environment:**
   ```bash
   # Windows
   python -m venv venv
   venv\Scripts\activate
   
   # Linux/Mac
   python3 -m venv venv
   source venv/bin/activate
   ```

3. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

### Step 2: Start the Voice AI Service

**Option A: Using the startup script**
```bash
# Windows
start-voice-ai.bat

# Linux/Mac
./start-voice-ai.sh
```

**Option B: Manual startup**
```bash
cd voice_ai_service
python app.py
```

The service will start on `http://localhost:5001`

### Step 3: Start the Main Application

In a separate terminal:
```bash
npm start
```

## 🎯 Usage

### Voice Commands Supported

- **Balance**: "What's my balance?", "How much money do I have?"
- **Transactions**: "Show my transactions", "Recent history"
- **Bills**: "Pay electricity bill", "Show my bills"
- **Send Money**: "Send money to John", "Transfer funds"
- **Deposit**: "Add money", "Make a deposit"
- **Withdraw**: "Take out money", "Cash withdrawal"
- **Analytics**: "Show spending", "Financial insights"
- **Help**: "What can you do?", "Help me"

### How to Use

1. **Navigate to the Voice page** in your application
2. **Click "Listen"** to start voice recognition
3. **Speak your command** naturally
4. **The AI will respond** with speech and take appropriate actions

## 🔧 Configuration

### AI Service Configuration

Edit `voice_ai_service/app.py` to customize:

- **ASR Model**: Change the Whisper model (line 45)
- **TTS Model**: Change the Coqui TTS model (line 50)
- **Device**: Force CPU/GPU usage (line 15)

### Voice Service Configuration

Edit `services/advancedVoiceService.js` to customize:

- **AI Service URL**: Change the service endpoint (line 6)
- **Command Processing**: Add new command patterns (line 45)
- **Fallback Behavior**: Modify fallback logic (line 85)

## 🐛 Troubleshooting

### Common Issues

1. **"AI Voice Service not available"**
   - Ensure the Python service is running on port 5001
   - Check firewall settings
   - Verify Python dependencies are installed

2. **"Speech recognition not supported"**
   - Use a modern browser (Chrome, Firefox, Safari)
   - Ensure microphone permissions are granted
   - Check HTTPS requirement for some browsers

3. **"Models loading failed"**
   - Ensure sufficient RAM (4GB+)
   - Check internet connection for model downloads
   - Verify PyTorch installation

4. **"Audio recording failed"**
   - Grant microphone permissions
   - Check browser audio settings
   - Ensure no other applications are using the microphone

### Performance Optimization

1. **For better performance:**
   - Use CUDA if available
   - Increase RAM allocation
   - Use faster Whisper models (whisper-small, whisper-medium)

2. **For lower resource usage:**
   - Use CPU-only mode
   - Use smaller models
   - Reduce audio quality

## 📊 Monitoring

### Health Check
```bash
curl http://localhost:5001/health
```

### Service Status
- **Green**: Advanced AI Voice Assistant Ready
- **Gray**: Basic Voice Assistant Ready (fallback)
- **Red**: Error or service unavailable

## 🔄 Updates

To update the voice AI service:

1. **Stop the service** (Ctrl+C)
2. **Update dependencies:**
   ```bash
   cd voice_ai_service
   pip install -r requirements.txt --upgrade
   ```
3. **Restart the service:**
   ```bash
   python app.py
   ```

## 🆘 Support

If you encounter issues:

1. Check the console logs for error messages
2. Verify all dependencies are installed correctly
3. Ensure the service is running on the correct port
4. Check browser compatibility and permissions

## 🎉 Success!

Once everything is set up, you'll have:

- ✅ Advanced AI-powered voice recognition
- ✅ Natural-sounding text-to-speech
- ✅ Intelligent financial command processing
- ✅ Seamless fallback to basic voice
- ✅ Enhanced user experience

Enjoy your enhanced voice assistant! 🎤✨
