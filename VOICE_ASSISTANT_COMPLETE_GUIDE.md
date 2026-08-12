# 🎤 Complete Voice Assistant Usage Guide

## 🚀 Quick Start (5 Minutes)

### Step 1: Start the Voice AI Service

**Option A: Simple Version (No ML Dependencies)**
```bash
cd voice_ai_service
python simple_voice_service.py
```

**Option B: Full AI Version (With ML Dependencies)**
```bash
cd voice_ai_service
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

### Step 2: Start the Main Application
```bash
# In a new terminal
npm start
```

### Step 3: Access Voice Assistant
1. Open your browser to `http://localhost:3000`
2. Navigate to the **Voice** page
3. Click **"Listen"** and speak your command

## 🎯 Voice Commands You Can Use

### 💰 **Balance & Account**
- **"What's my balance?"** - Check current balance
- **"How much money do I have?"** - Check balance
- **"Show my account"** - View account information

### 📊 **Transactions**
- **"Show my transactions"** - View recent transactions
- **"Transaction history"** - View transaction history
- **"Last 5 transactions"** - View recent activity

### 💡 **Bill Payments**

#### **Electricity Bills**
- **"Pay electricity meter 1234567890 for R150"**
- **"Electricity bill 9876543210 R200"**
- **"Pay electric meter 1111111111"**

#### **Water Bills**
- **"Pay water meter 01234 R60"**
- **"Water bill 54321 R80"**
- **"Pay water meter 99999"**

#### **Airtime Recharge**
- **"Recharge my phone 0712345678 with R50"**
- **"Airtime 0823456789 R100"**
- **"Recharge 0834567890"**

### ⚙️ **Settings & Limits**
- **"Update daily limit to R5000"**
- **"Set daily limit R10000"**
- **"Change limit to 2000 rand"**

### 🆘 **Help & Navigation**
- **"Help me"** - Get assistance
- **"What can you do?"** - See available commands
- **"Go to bills"** - Navigate to bills page
- **"Open transactions"** - Navigate to transactions

## 🎤 How to Use the Voice Assistant

### **Basic Usage**
1. **Click "Listen"** - The microphone will activate
2. **Speak clearly** - Say your command naturally
3. **Wait for response** - The AI will process and respond
4. **Follow instructions** - The system will guide you through actions

### **Advanced Usage**
1. **Be specific** - Include amounts, meter numbers, phone numbers
2. **Use natural language** - "Pay electricity bill" instead of "electricity"
3. **Include details** - "R150" instead of just "150"
4. **Wait for confirmation** - Listen to the response before continuing

## 🔧 System Features

### **Smart Recognition**
- **Natural Language Processing** - Understands context and intent
- **Entity Extraction** - Automatically extracts amounts, phone numbers, meter numbers
- **Intent Classification** - Knows what you want to do
- **Fallback Support** - Works even if AI models fail

### **Financial Operations**
- **Bill Payment Processing** - Handles electricity, water, airtime payments
- **Daily Limit Enforcement** - Prevents overspending
- **Transaction Recording** - All actions are logged
- **Email Integration** - Sends recharge codes automatically

### **Validation & Security**
- **Phone Number Validation** - Validates South African phone numbers
- **Meter Number Validation** - Ensures correct meter number formats
- **Amount Validation** - Checks for reasonable amounts
- **Daily Limit Checks** - Prevents exceeding spending limits

## 📱 User Interface

### **Voice Page Layout**
```
┌─────────────────────────────────────┐
│  🎤 Voice Assistant                 │
├─────────────────────────────────────┤
│  [What's my balance?] [Show last]   │
│  [🎤 Listen] Status: Ready          │
│  Response: [AI Response Here]       │
└─────────────────────────────────────┘
```

### **Status Indicators**
- **🟢 Advanced AI Voice Assistant Ready** - Full AI features available
- **🟡 Basic Voice Assistant Ready** - Fallback mode active
- **🔴 Error** - Service unavailable

## 🎯 Example Conversations

### **Example 1: Electricity Bill Payment**
```
You: "Pay electricity meter 1234567890 for R150"
AI: "I'll help you pay your electricity bill. Processing payment of R150 for meter 1234567890."
System: Processes payment, updates balance, records transaction
```

### **Example 2: Airtime Recharge**
```
You: "Recharge my phone 0712345678 with R50"
AI: "I'll help you recharge your airtime. Processing R50 recharge for 0712345678."
System: Processes payment, generates recharge code, sends email
```

### **Example 3: Balance Check**
```
You: "What's my balance?"
AI: "I'll check your current balance for you."
System: Opens dashboard showing current balance
```

## 🔧 Troubleshooting

### **Common Issues**

#### **"Speech recognition not supported"**
- **Solution**: Use Chrome, Firefox, or Safari
- **Check**: Microphone permissions are granted
- **Try**: Refresh the page and try again

#### **"AI Voice Service not available"**
- **Solution**: Start the voice AI service
- **Check**: Service is running on port 5001
- **Try**: Use the simple voice service for testing

#### **"Could not transcribe audio"**
- **Solution**: Speak more clearly and slowly
- **Check**: Microphone is working
- **Try**: Move to a quieter environment

#### **"Invalid phone number"**
- **Solution**: Use South African format (0712345678 or +27712345678)
- **Check**: Number starts with 0 or +27
- **Try**: Include area code

#### **"Invalid meter number"**
- **Solution**: 
  - Electricity: Exactly 10 digits
  - Water: Exactly 5 digits
- **Check**: No spaces or special characters
- **Try**: Read the number slowly

### **Performance Issues**

#### **Slow Response**
- **Solution**: Use the simple voice service for testing
- **Check**: Internet connection for AI models
- **Try**: Restart the voice service

#### **High Memory Usage**
- **Solution**: Use CPU mode instead of GPU
- **Check**: Available RAM (8GB+ recommended)
- **Try**: Restart the service

## 🚀 Advanced Features

### **Fine-tuning for South African Accents**
```bash
cd voice_ai_service
export FT_DATASET_NAME="intron/afrispeech-200"
python fine_tune_wav2vec2.py
```

### **Custom Voice Commands**
You can extend the system by adding new commands in:
- `voice_ai_service/enhanced_pipeline.py` - Add new intents
- `services/advancedVoiceService.js` - Add new command processing

### **Integration with Main App**
The voice assistant integrates seamlessly with your existing Luno Backend:
- **Database**: Uses your existing user and transaction data
- **Authentication**: Respects your user sessions
- **Navigation**: Can navigate to any page in your app

## 📊 Monitoring & Analytics

### **Check Service Health**
```bash
curl http://localhost:5001/health
```

### **View Logs**
- **Voice Service**: Check terminal where service is running
- **Main App**: Check browser console for errors
- **Database**: Check transaction logs

### **Performance Metrics**
- **Transcription Accuracy**: WER (Word Error Rate)
- **Response Time**: Average processing time
- **Success Rate**: Percentage of successful commands

## 🎉 Success Tips

### **For Best Results**
1. **Speak clearly** - Enunciate words properly
2. **Use complete sentences** - "Pay electricity bill" not "electricity"
3. **Include all details** - Amount, meter number, phone number
4. **Wait for confirmation** - Don't interrupt the AI
5. **Use the right format** - SA phone numbers, correct meter lengths

### **Voice Command Best Practices**
- **Start with action words**: "Pay", "Show", "Check", "Update"
- **Be specific**: Include amounts and identifiers
- **Use natural language**: "I want to pay my electricity bill"
- **Include context**: "for R150" not just "150"

## 🔒 Security & Privacy

### **Data Protection**
- **Audio Processing**: Audio is processed locally when possible
- **Data Storage**: Only necessary data is stored
- **Email Security**: Recharge codes sent securely
- **Transaction Security**: All payments are validated

### **Privacy Features**
- **No Audio Storage**: Audio is not permanently stored
- **Secure Transmission**: All data is encrypted in transit
- **User Control**: Users can control what data is processed

## 🎤 Ready to Use!

Your voice assistant is now ready! Here's what you can do:

1. **Start the service** using the quick start guide above
2. **Navigate to the Voice page** in your application
3. **Click "Listen"** and start speaking
4. **Try the example commands** provided
5. **Explore the advanced features** as needed

The system is designed to be intuitive and user-friendly, with comprehensive error handling and fallback mechanisms to ensure it always works, even if some components fail.

**Enjoy your enhanced voice assistant! 🎤✨**
