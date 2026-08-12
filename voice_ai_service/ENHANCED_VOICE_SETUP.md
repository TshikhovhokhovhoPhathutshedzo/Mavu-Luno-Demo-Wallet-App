# 🎤 Enhanced Voice AI Assistant - Complete Setup Guide

This is a comprehensive voice assistant system with advanced AI capabilities, specifically designed for financial applications with South African accent support.

## 🚀 Features

### Core AI Capabilities
- **Advanced Speech Recognition**: Whisper + wav2vec2 fallback
- **Natural Language Understanding**: Zero-shot intent classification
- **Entity Extraction**: Automatic extraction of amounts, phone numbers, meter numbers
- **Text-to-Speech**: High-quality Coqui TTS
- **South African Accent Support**: Fine-tuning capabilities for SA English

### Financial Features
- **Bill Payments**: Electricity, Water, Airtime with validation
- **Daily Limit Enforcement**: Automatic hold/block system
- **Transaction Processing**: Complete financial transaction handling
- **Email Integration**: Recharge code delivery
- **Database Integration**: SQLAlchemy with PostgreSQL/SQLite

### Advanced Features
- **Hold Management**: Automatic retry system for held transactions
- **Testing Suite**: Comprehensive unit tests and evaluation
- **CI/CD**: GitHub Actions integration
- **Fine-tuning**: Custom model training for SA accents

## 📋 Prerequisites

- Python 3.8+
- Node.js application running
- At least 8GB RAM (16GB recommended)
- CUDA-compatible GPU (optional, for faster processing)
- PostgreSQL (optional, SQLite default)

## 🛠️ Installation

### Step 1: Clone and Setup

```bash
cd voice_ai_service
python -m venv venv

# Windows
venv\Scripts\activate

# Linux/Mac
source venv/bin/activate
```

### Step 2: Install Dependencies

```bash
pip install -r requirements.txt
```

### Step 3: Environment Configuration

Create a `.env` file:

```bash
# Database
VA_DB_URL=postgresql://user:password@localhost:5432/luno_voice
# or for SQLite: sqlite:///voice_assistant.db

# Email Configuration
VA_SMTP_SERVER=smtp.gmail.com
VA_SMTP_PORT=587
VA_SMTP_USER=your-email@gmail.com
VA_SMTP_PASS=your-app-password
VA_FROM_EMAIL=your-email@gmail.com

# Model Configuration
VA_WHISPER_MODEL=openai/whisper-large-v2
VA_WAV2VEC_MODEL=facebook/wav2vec2-xls-r-300m
VA_TTS_MODEL=tts_models/en/ljspeech/tacotron2-DDC

# Fine-tuning (optional)
FT_DATASET_NAME=intron/afrispeech-200
FT_OUTPUT_DIR=./wav2vec2-afri
FT_BASE_MODEL=facebook/wav2vec2-xls-r-300m
FT_BATCH=8
FT_EPOCHS=5

# Weights & Biases (optional)
WANDB_API_KEY=your-wandb-key
```

### Step 4: Initialize Database

```bash
python enhanced_pipeline.py
```

This will create the necessary database tables.

## 🎯 Usage

### Basic Voice Processing

```python
from enhanced_pipeline import run_pipeline

# Process voice command
result = run_pipeline("audio_file.wav", "user@example.com", user_id=1)
print(result)
```

### API Endpoints

Start the Flask service:
```bash
python app.py
```

Available endpoints:
- `GET /health` - Health check
- `POST /transcribe` - Speech-to-text
- `POST /synthesize` - Text-to-speech
- `POST /process_command` - Command processing
- `POST /full_voice_processing` - Complete pipeline
- `POST /process_bill_payment` - Bill payment processing

### Voice Commands Supported

- **Balance**: "What's my balance?", "How much money do I have?"
- **Transactions**: "Show my transactions", "Recent history"
- **Bills**: 
  - "Pay electricity meter 1234567890 for R150"
  - "Recharge my phone 0712345678 with R50"
  - "Pay water meter 01234 R60"
- **Settings**: "Update daily limit to R5000"
- **Help**: "What can you do?", "Help me"

## 🔧 Advanced Configuration

### Fine-tuning for SA Accents

1. **Prepare Dataset**:
   ```bash
   # Use AfriSpeech-200 or your custom dataset
   export FT_DATASET_NAME="intron/afrispeech-200"
   ```

2. **Start Fine-tuning**:
   ```bash
   python fine_tune_wav2vec2.py
   ```

3. **Update Model Path**:
   ```bash
   export VA_WAV2VEC_MODEL="./wav2vec2-afri"
   ```

### Testing and Evaluation

1. **Run Unit Tests**:
   ```bash
   pytest tests/ -v
   ```

2. **Evaluate on Test Set**:
   ```bash
   # Create test manifest
   echo '{"audio_filepath": "test.wav", "transcript": "test transcript"}' > test_manifest.jsonl
   
   # Run evaluation
   python eval_testset.py test_manifest.jsonl
   ```

### Hold Management

```python
from retry_holds_worker import retry_pending_holds

# Retry holds for user
result = retry_pending_holds(user_id=1)
```

## 🚀 Integration with Luno Backend

### 1. Update Main Application

The voice assistant integrates seamlessly with your existing Luno Backend:

```javascript
// In your voice page
const response = await fetch('http://localhost:5001/full_voice_processing', {
    method: 'POST',
    body: formData
});
```

### 2. Database Integration

The voice assistant uses its own database tables that can be integrated with your main PostgreSQL database:

```sql
-- Add to your main database
CREATE TABLE voice_users (
    id SERIAL PRIMARY KEY,
    email VARCHAR UNIQUE,
    name VARCHAR,
    balance DECIMAL(10,2) DEFAULT 0.0,
    daily_limit DECIMAL(10,2) DEFAULT 10000.0,
    daily_total DECIMAL(10,2) DEFAULT 0.0,
    daily_total_last_reset TIMESTAMP DEFAULT NOW()
);
```

### 3. Environment Variables

Add to your main application's environment:

```bash
VOICE_AI_SERVICE_URL=http://localhost:5001
VOICE_AI_ENABLED=true
```

## 📊 Monitoring and Maintenance

### Health Monitoring

```bash
curl http://localhost:5001/health
```

### Logs

The service logs all activities:
- Transcription accuracy
- Intent classification results
- Transaction processing
- Error handling

### Performance Optimization

1. **GPU Usage**: Set `CUDA_VISIBLE_DEVICES=0` for specific GPU
2. **Memory**: Increase batch size for better GPU utilization
3. **Caching**: Implement model caching for faster startup

## 🔒 Security Considerations

1. **API Security**: Implement authentication for production
2. **Data Privacy**: Encrypt sensitive audio data
3. **Rate Limiting**: Implement request rate limiting
4. **Input Validation**: Validate all user inputs
5. **Secure Storage**: Use secure storage for recharge codes

## 🐛 Troubleshooting

### Common Issues

1. **"Model not found"**:
   - Check internet connection for model downloads
   - Verify model names in environment variables

2. **"CUDA out of memory"**:
   - Reduce batch size
   - Use CPU mode: `export CUDA_VISIBLE_DEVICES=""`

3. **"Database connection failed"**:
   - Check database URL
   - Ensure database is running
   - Verify credentials

4. **"Email sending failed"**:
   - Check SMTP credentials
   - Verify email server settings
   - Check firewall settings

### Performance Issues

1. **Slow transcription**:
   - Use smaller Whisper model
   - Enable GPU acceleration
   - Implement audio preprocessing

2. **High memory usage**:
   - Use model quantization
   - Implement model caching
   - Optimize batch processing

## 📈 Scaling and Production

### Production Deployment

1. **Docker Containerization**:
   ```dockerfile
   FROM python:3.10-slim
   COPY . /app
   WORKDIR /app
   RUN pip install -r requirements.txt
   CMD ["python", "app.py"]
   ```

2. **Load Balancing**: Use multiple instances behind a load balancer

3. **Database Scaling**: Use connection pooling and read replicas

4. **Monitoring**: Implement comprehensive monitoring and alerting

### CI/CD Pipeline

The included GitHub Actions workflow provides:
- Automated testing
- Code quality checks
- Model validation
- Deployment automation

## 🎉 Success!

Once everything is set up, you'll have:

- ✅ Advanced AI-powered voice recognition
- ✅ Natural language understanding for financial commands
- ✅ Automatic bill payment processing
- ✅ Daily limit enforcement with hold management
- ✅ South African accent support
- ✅ Comprehensive testing and evaluation
- ✅ Production-ready deployment

## 📞 Support

For issues and questions:
1. Check the troubleshooting section
2. Review the logs for error details
3. Test with the provided evaluation scripts
4. Verify all environment variables are set correctly

Enjoy your enhanced voice assistant! 🎤✨
