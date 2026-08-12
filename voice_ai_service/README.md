# Enhanced Voice AI Service with Gemini Live API (TypeScript)

Advanced AI-powered voice assistant microservice for the Luno Backend application, powered by Google's Gemini Live API and built with TypeScript.

## Features

- **Real-time Voice Conversation**: Live speech-to-text and text-to-speech using Gemini Live API
- **Natural Language Understanding**: Advanced AI-powered command processing
- **Financial Integration**: Full access to user financial data and operations
- **Multi-modal Input**: Voice, text, and visual input support
- **Contextual Responses**: AI responses based on real-time financial data
- **RESTful API**: Easy integration with existing Node.js backend
- **TypeScript**: Full type safety and modern development experience

## Installation

1. Install dependencies:
```bash
npm install
```

2. Set environment variables:
```bash
export GEMINI_API_KEY=your_gemini_api_key_here
```

3. Run the service:
```bash
# Development mode
npm run dev

# Production mode
npm run build
npm start
```

## API Endpoints

### Health Check
- **GET** `/health` - Service health status

### Voice Session Management
- **POST** `/start_session` - Start a new voice session
  - Input: JSON with user context
  - Output: JSON with session status

- **POST** `/stop_session` - Stop current voice session
  - Output: JSON with session status

### Financial Data Integration
- **POST** `/send_financial_data` - Send financial data to voice assistant
  - Input: JSON with data type and financial data
  - Output: JSON with confirmation

- **POST** `/process_command` - Process a financial command
  - Input: JSON with command and user ID
  - Output: JSON with processing status

## Supported Commands

### 💰 **Balance & Account**
- "What's my balance?"
- "How much money do I have?"
- "Check my account balance"
- "Show me my funds"

### 📊 **Transactions**
- "Show my transactions"
- "Recent transaction history"
- "Last 5 transactions"
- "What did I spend money on?"

### 🧾 **Bills & Payments**
- "Pay electricity bill"
- "Recharge my airtime"
- "Pay water bill"
- "Show my bills"

### 💸 **Money Transfers**
- "Send money to John"
- "Transfer funds"
- "Make a payment"

### ⚙️ **Settings & Limits**
- "Set daily limit to R5000"
- "Update my spending limit"
- "What's my daily limit?"

### 📈 **Analytics & Insights**
- "Show my spending patterns"
- "Financial insights"
- "Where am I spending most?"

### 💳 **Credit & Financial Health**
- "What's my credit score?"
- "How can I improve my credit?"
- "Credit analysis"
- **Help**: "What can you do?", "Help me"

## Integration

The service runs on port 5002 and integrates seamlessly with the main Node.js application through the Gemini Voice Service:

### **Node.js Integration**
- **Service**: `services/geminiVoiceService.js`
- **Routes**: `routes/voiceAiRoutes.js`
- **Frontend**: `views/voice-ai-chat.ejs`

### **Access Points**
- **Main Voice Page**: `http://localhost:3000/voice` (redirects to new system)
- **Direct Access**: `http://localhost:3000/api/voice-ai/chat`
- **API Endpoints**: `http://localhost:3000/api/voice-ai/*`

### **Features**
- Real-time voice conversation with financial context
- Full database access for financial operations
- Secure authentication and user data isolation
- Multi-modal input support (voice, text, visual)

## Quick Start

1. **Start the Voice Service:**
   ```bash
   # Windows
   start-gemini-voice.bat
   
   # Linux/Mac
   ./start-gemini-voice.sh
   ```

2. **Access the Voice Assistant:**
   - Navigate to `http://localhost:3000/voice`
   - Click the microphone button to start voice conversation
   - Speak your financial commands naturally

3. **Test Commands:**
   - "What's my balance?"
   - "Show my recent transactions"
   - "Pay electricity bill"
   - "Set daily limit to R5000"

## Configuration

- **Voice Model**: Gemini 2.5 Flash Preview with Native Audio Dialog
- **Voice Type**: Zephyr (Gemini's prebuilt voice)
- **Audio Format**: 16kHz input, 24kHz output
- **Language**: English (US)
- **Port**: 5002
- **Runtime**: Node.js with TypeScript

## Dependencies

See `package.json` for the complete list of dependencies:
- `@google/genai`: Google's Gemini Live API client
- `express`: Web framework
- `cors`: Cross-origin resource sharing
- `mime`: MIME type utilities
- `typescript`: TypeScript compiler
- `ts-node`: TypeScript execution for Node.js
