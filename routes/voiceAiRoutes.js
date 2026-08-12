import express from 'express';
import { ensureAuth } from '../middlewares/ensureAuth.js';
import GeminiVoiceService from '../services/geminiVoiceService.js';

const voiceAiRouter = express.Router();
const voiceService = new GeminiVoiceService();

// Initialize voice service on startup
voiceService.initialize().then(connected => {
  if (connected) {
    console.log('🎤 Enhanced Voice AI Service initialized');
  } else {
    console.log('⚠️ Voice AI Service not available - using fallback');
  }
});

// Voice service status
voiceAiRouter.get('/status', async (req, res) => {
  try {
    const status = await voiceService.getStatus();
    res.json({
      success: true,
      ...status
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Start voice session
voiceAiRouter.post('/start-session', ensureAuth, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const result = await voiceService.startVoiceSession(userId);
    
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Stop voice session
voiceAiRouter.post('/stop-session', ensureAuth, async (req, res) => {
  try {
    const result = await voiceService.stopVoiceSession();
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Process financial command
voiceAiRouter.post('/process-command', ensureAuth, async (req, res) => {
  try {
    const { command } = req.body;
    const userId = req.user.user_id;
    
    if (!command) {
      return res.status(400).json({
        success: false,
        error: 'Command is required'
      });
    }
    
    const result = await voiceService.processFinancialCommand(command, userId);
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Send financial data update
voiceAiRouter.post('/send-data', ensureAuth, async (req, res) => {
  try {
    const { type, data } = req.body;
    const userId = req.user.user_id;
    
    if (!type || !data) {
      return res.status(400).json({
        success: false,
        error: 'Type and data are required'
      });
    }
    
    // Add user_id to data
    const dataWithUserId = { ...data, user_id: userId };
    
    const result = await voiceService.handleFinancialUpdate(type, dataWithUserId);
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get available voice commands
voiceAiRouter.get('/commands', (req, res) => {
  try {
    const commands = voiceService.getAvailableCommands();
    res.json({
      success: true,
      commands: commands
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get user financial context for voice
voiceAiRouter.get('/context', ensureAuth, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const context = await voiceService.getUserFinancialContext(userId);
    
    res.json({
      success: true,
      context: context
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Voice chat page
voiceAiRouter.get('/chat', ensureAuth, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const context = await voiceService.getUserFinancialContext(userId);
    const commands = voiceService.getAvailableCommands();
    
    res.render('voice-ai-chat', {
      user: req.user,
      context: context,
      commands: commands,
      active: 'voice-ai'
    });
  } catch (error) {
    console.error('Voice AI chat page error:', error);
    res.status(500).send('Server error');
  }
});

// Simple test endpoint to verify voice service is working
voiceAiRouter.get('/simple-test', async (req, res) => {
  try {
    const testMessage = "What's my balance?";
    const testUserId = '071e1b99-c598-4cae-9735-37ebd9f0996b';
    
    console.log('🧪 Running simple voice test...');
    const result = await voiceService.processFinancialCommand(testMessage, testUserId);
    
    res.json({
      success: true,
      message: 'Voice service is working!',
      test_result: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Simple test error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Public voice test page (no authentication required)
voiceAiRouter.get('/test-page', async (req, res) => {
  try {
    res.render('voice-test-page', {
      title: 'Voice AI Test Page'
    });
  } catch (error) {
    console.error('Voice test page error:', error);
    res.status(500).send('Server error');
  }
});

// Test voice assistant (no auth required for testing)
voiceAiRouter.post('/test', async (req, res) => {
  try {
    console.log('🎤 Test endpoint called with body:', req.body);
    
    const { message, user_id } = req.body;
    
    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'Message is required'
      });
    }
    
    // Use a test user ID if not provided
    const userId = user_id || '071e1b99-c598-4cae-9735-37ebd9f0996b';
    
    console.log(`🎤 Processing test message: "${message}" for user: ${userId}`);
    
    // Process the test message
    const result = await voiceService.processFinancialCommand(message, userId);
    
    console.log('✅ Test result:', result);
    
    res.json({
      success: true,
      message: 'Test command processed',
      result: result
    });
  } catch (error) {
    console.error('❌ Test error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default voiceAiRouter;
