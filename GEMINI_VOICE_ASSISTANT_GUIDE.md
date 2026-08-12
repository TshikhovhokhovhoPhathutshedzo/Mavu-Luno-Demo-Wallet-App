# 🎤 Enhanced Voice Assistant with Gemini Live API

## 🚀 Overview

The Enhanced Voice Assistant integrates Google's Gemini Live API with LunoWallet's existing voice functionality, providing real-time voice conversation capabilities with full access to financial data and operations.

## ✨ Features

### **Real-time Voice Conversation**
- **Live Audio Processing**: Real-time speech-to-text and text-to-speech
- **Natural Language Understanding**: Advanced AI-powered command processing
- **Contextual Responses**: AI responses based on user's financial data
- **Multi-modal Input**: Voice, text, and visual input support

### **Financial Integration**
- **Real-time Data Access**: Live balance, transactions, and financial metrics
- **Command Processing**: Execute financial operations through voice
- **Context Awareness**: AI understands user's financial situation
- **Secure Operations**: All financial operations require authentication

### **Advanced Capabilities**
- **Video Input**: Camera feed for visual context (optional)
- **Screen Sharing**: Screen capture for visual assistance
- **Customizable Voice**: Adjustable voice speed and volume
- **Command Recognition**: Extensive voice command library

## 🛠️ Installation & Setup

### **Prerequisites**
- Python 3.8+ installed
- Node.js application running
- Google Gemini API key
- Microphone and speakers

### **Step 1: Install Python Dependencies**

```bash
cd voice_ai_service
pip install -r requirements_gemini.txt
```

### **Step 2: Set Environment Variables**

Add to your `.env` file:
```env
GEMINI_API_KEY=your_gemini_api_key_here
VOICE_SERVICE_URL=http://localhost:5002
```

### **Step 3: Start the Voice Service**

**Windows:**
```bash
start-gemini-voice.bat
```

**Linux/Mac:**
```bash
chmod +x start-gemini-voice.sh
./start-gemini-voice.sh
```

**Manual:**
```bash
cd voice_ai_service
python gemini_voice_service.py
```

### **Step 4: Start the Main Application**

```bash
npm start
```

## 🎯 Usage

### **Access the Voice Assistant**

1. Navigate to `http://localhost:3000/api/voice-ai/chat`
2. Click the microphone button to start voice conversation
3. Speak your financial commands naturally

### **Voice Commands**

#### **💰 Balance & Account**
- "What's my balance?"
- "How much money do I have?"
- "Check my account balance"
- "Show me my funds"

#### **📊 Transactions**
- "Show my transactions"
- "Recent transaction history"
- "Last 5 transactions"
- "What did I spend money on?"

#### **🧾 Bills & Payments**
- "Pay electricity bill"
- "Recharge my airtime"
- "Pay water bill"
- "Show my bills"

#### **💸 Money Transfers**
- "Send money to John"
- "Transfer funds"
- "Make a payment"

#### **⚙️ Settings & Limits**
- "Set daily limit to R5000"
- "Update my spending limit"
- "What's my daily limit?"

#### **📈 Analytics & Insights**
- "Show my spending patterns"
- "Financial insights"
- "Where am I spending most?"

#### **💳 Credit & Financial Health**
- "What's my credit score?"
- "How can I improve my credit?"
- "Credit analysis"

## 🔧 API Endpoints

### **Voice Service Status**
```http
GET /api/voice-ai/status
```

### **Start Voice Session**
```http
POST /api/voice-ai/start-session
Authorization: Required
```

### **Stop Voice Session**
```http
POST /api/voice-ai/stop-session
Authorization: Required
```

### **Process Voice Command**
```http
POST /api/voice-ai/process-command
Content-Type: application/json
Authorization: Required

{
  "command": "What's my balance?"
}
```

### **Send Financial Data**
```http
POST /api/voice-ai/send-data
Content-Type: application/json
Authorization: Required

{
  "type": "balance",
  "data": {
    "balance": 1500.00,
    "currency": "ZAR"
  }
}
```

### **Get Available Commands**
```http
GET /api/voice-ai/commands
```

### **Get User Context**
```http
GET /api/voice-ai/context
Authorization: Required
```

## 🏗️ Architecture

### **Components**

1. **Gemini Voice Service** (`voice_ai_service/gemini_voice_service.py`)
   - Python Flask service with Gemini Live API integration
   - Real-time audio processing
   - Voice session management

2. **Node.js Integration** (`services/geminiVoiceService.js`)
   - JavaScript service for Node.js integration
   - Financial data access
   - API endpoint management

3. **Voice AI Routes** (`routes/voiceAiRoutes.js`)
   - Express.js routes for voice functionality
   - Authentication and authorization
   - Request/response handling

4. **Frontend Interface** (`views/voice-ai-chat.ejs`)
   - Web-based voice interface
   - Real-time status indicators
   - Command visualization

### **Data Flow**

```
User Voice Input → Browser Speech Recognition → Node.js API → Python Voice Service → Gemini Live API → AI Response → Voice Output
```

## 🔒 Security Features

- **Authentication Required**: All voice operations require user authentication
- **Secure Data Transmission**: All API calls use HTTPS
- **User Context Isolation**: Each user's data is isolated
- **Command Validation**: All voice commands are validated before processing

## 🎛️ Configuration

### **Voice Settings**
- **Voice Speed**: Adjustable from 0.5x to 2.0x
- **Voice Volume**: Adjustable from 0 to 100%
- **Language**: Currently supports English (US)
- **Voice Type**: Uses Gemini's "Charon" voice

### **Audio Settings**
- **Input Sample Rate**: 16kHz
- **Output Sample Rate**: 24kHz
- **Chunk Size**: 1024 samples
- **Channels**: Mono (1 channel)

## 🐛 Troubleshooting

### **Common Issues**

1. **Voice Recognition Not Working**
   - Check microphone permissions
   - Ensure HTTPS is enabled
   - Try different browsers

2. **Voice Service Not Connecting**
   - Verify Python service is running on port 5002
   - Check GEMINI_API_KEY is set correctly
   - Ensure all dependencies are installed

3. **Audio Playback Issues**
   - Check speaker/headphone connection
   - Verify audio output settings
   - Try adjusting volume settings

### **Debug Mode**

Enable debug logging by setting:
```env
DEBUG_VOICE=true
```

## 📊 Performance

### **Latency**
- **Voice Input Processing**: ~200-500ms
- **AI Response Generation**: ~1-3 seconds
- **Voice Output**: ~100-300ms

### **Resource Usage**
- **Memory**: ~200-400MB for Python service
- **CPU**: Moderate usage during active sessions
- **Network**: Low bandwidth for audio streaming

## 🔄 Integration with Existing Features

The Enhanced Voice Assistant seamlessly integrates with:

- **AI Chat Service**: Shares the same AI service and database access
- **Financial Operations**: Full access to all financial functions
- **User Authentication**: Uses existing authentication system
- **Database Access**: Direct access to all financial data
- **LiveKit Integration**: Can work alongside LiveKit features

## 🚀 Future Enhancements

- **Multi-language Support**: Support for multiple languages
- **Custom Voice Training**: Train custom voices
- **Advanced Analytics**: Voice-based financial insights
- **Mobile App Integration**: Native mobile voice support
- **Offline Mode**: Basic offline voice functionality

## 📞 Support

For technical support or questions about the Enhanced Voice Assistant:

1. Check the troubleshooting section above
2. Review the API documentation
3. Check server logs for error messages
4. Ensure all dependencies are properly installed

---

**🎤 Enjoy your enhanced voice banking experience with LunoWallet!**
