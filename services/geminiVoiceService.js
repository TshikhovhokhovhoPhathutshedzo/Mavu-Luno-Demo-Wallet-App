import axios from 'axios';
import dotenv from 'dotenv';
import pool from '../auth/db.js';
import AIService from './aiService.js';

dotenv.config();

/**
 * Enhanced Voice Service with Gemini Live API Integration
 * Provides real-time voice conversation capabilities with financial data access
 */
export class GeminiVoiceService {
  constructor() {
    this.voiceServiceUrl = process.env.VOICE_SERVICE_URL || 'http://localhost:5002';
    this.isConnected = false;
    this.userContext = null;
    this.useIntegratedService = false; // Use external Python service for realistic voice
    this.activeSessions = new Map();
  }

  /**
   * Initialize voice service connection
   */
  async initialize() {
    try {
      if (this.useIntegratedService) {
        // Use integrated AI service - no external connection needed
        this.isConnected = true;
        console.log('✅ Gemini Voice Service (Integrated) ready');
        return true;
      } else {
        // Try to connect to external TypeScript service
        const response = await axios.get(`${this.voiceServiceUrl}/health`);
        this.isConnected = response.data.status === 'healthy';
        console.log('✅ Gemini Voice Service (External) connected:', this.isConnected);
        return this.isConnected;
      }
    } catch (error) {
      console.error('❌ Failed to connect to Gemini Voice Service:', error.message);
      this.isConnected = false;
      return false;
    }
  }

  /**
   * Start a voice session for a user
   */
  async startVoiceSession(userId) {
    try {
      console.log(`🎤 Starting voice session for user: ${userId}`);
      
      // Get comprehensive user context
      const userContext = await this.getUserFinancialContext(userId);
      this.userContext = userContext;
      this.isConnected = true; // Mark as connected since we're using internal AI service

      console.log(`✅ Voice session started successfully for user: ${userId}`);
      return {
        success: true,
        message: 'Voice session started with AI integration',
        user_context: userContext,
        session_id: `voice_session_${userId}_${Date.now()}`
      };
    } catch (error) {
      console.error('Error starting voice session:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get comprehensive financial context for the user
   */
  async getUserFinancialContext(userId) {
    try {
      const [
        userInfo,
        balance,
        transactionStats,
        dailyLimits,
        creditScore,
        recentTransactions,
        billsHistory
      ] = await Promise.all([
        AIService.getUserInfo(userId),
        AIService.getCurrentBalance(userId),
        AIService.getTransactionStats(userId),
        AIService.getDailyLimits(userId),
        AIService.getCreditScore(userId),
        AIService.getTransactionHistory(userId, 5),
        AIService.getBillsHistory(userId, 5)
      ]);

      return {
        user_id: userId,
        user_info: userInfo,
        balance: balance,
        transaction_stats: transactionStats,
        daily_limits: dailyLimits,
        credit_score: creditScore,
        recent_transactions: recentTransactions,
        bills_history: billsHistory,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error getting user financial context:', error);
      return {
        user_id: userId,
        error: 'Failed to load financial context',
        timestamp: new Date().toISOString()
      };
    }
  }


  /**
   * Process a financial command through voice assistant
   */
  async processFinancialCommand(command, userId) {
    try {
      console.log(`🎤 Processing voice command: "${command}" for user: ${userId}`);
      
      // Get user's financial context
      const context = await this.getUserFinancialContext(userId);
      
      // Process command using the existing AI service with proper fallback
      let aiResponse;
      try {
        // Try Gemini first with automatic fallback
        aiResponse = await AIService.generateResponseWithDatabaseContext(command, context, 'gemini');
      } catch (error) {
        console.error('AI Service Error:', error);
        // Final fallback - try OpenAI directly
        try {
          console.log('🔄 Trying OpenAI fallback...');
          aiResponse = await AIService.generateResponseWithDatabaseContext(command, context, 'openai');
        } catch (fallbackError) {
          console.error('OpenAI Fallback Error:', fallbackError);
          // Return a basic response if all AI services fail
          aiResponse = {
            success: true,
            response: "I'm having trouble processing your request right now. Please try again later or contact support.",
            provider: 'fallback',
            timestamp: new Date().toISOString()
          };
        }
      }
      
      // Send response to Python Gemini service for realistic voice synthesis
      if (this.isConnected && !this.useIntegratedService) {
        try {
          const sessionId = await this.ensureVoiceSession(userId);
          // Extract the actual text response from the AI response object
          const responseText = typeof aiResponse.response === 'string' 
            ? aiResponse.response 
            : aiResponse.response?.response || aiResponse.response?.text || JSON.stringify(aiResponse.response);
          await this.synthesizeSpeech(sessionId, responseText);
        } catch (voiceError) {
          console.warn('⚠️ Voice synthesis failed, but command processed:', voiceError.message);
        }
      }
      
      console.log(`✅ Voice command processed successfully`);
      return {
        success: true,
        command: command,
        response: aiResponse,
        context: context,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ Failed to process voice command:', error.message);
      return {
        success: false,
        error: error.message,
        fallback: true
      };
    }
  }

  /**
   * Stop the current voice session
   */
  async stopVoiceSession() {
    try {
      if (!this.isConnected) {
        return { success: true, message: 'No active session' };
      }

      console.log('🛑 Stopping voice session');
      this.userContext = null;
      this.isConnected = false;
      
      return { 
        success: true, 
        message: 'Voice session stopped successfully' 
      };
    } catch (error) {
      console.error('Error stopping voice session:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get voice service status
   */
  async getStatus() {
    try {
      return {
        connected: this.isConnected,
        service: 'Gemini Voice AI Service (Integrated)',
        timestamp: new Date().toISOString(),
        status: 'ready'
      };
    } catch (error) {
      return {
        connected: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Ensure a voice session exists for the user
   */
  async ensureVoiceSession(userId) {
    if (this.activeSessions.has(userId)) {
      return this.activeSessions.get(userId);
    }
    
    try {
      const response = await fetch(`${this.voiceServiceUrl}/api/voice/start-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: userId,
          context: this.userContext
        })
      });
      
      if (!response.ok) {
        throw new Error(`Voice service error: ${response.status}`);
      }
      
      const result = await response.json();
      const sessionId = result.session_id;
      this.activeSessions.set(userId, sessionId);
      
      console.log(`🎤 Voice session created: ${sessionId} for user: ${userId}`);
      return sessionId;
      
    } catch (error) {
      console.error('Error creating voice session:', error);
      throw error;
    }
  }

  /**
   * Synthesize speech using Python Gemini service
   */
  async synthesizeSpeech(sessionId, text) {
    try {
      const response = await fetch(`${this.voiceServiceUrl}/api/voice/synthesize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session_id: sessionId,
          text: text
        })
      });
      
      if (!response.ok) {
        throw new Error(`Voice synthesis error: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.success && result.audio_data) {
        // Convert base64 audio data to blob and play
        const audioBlob = this.base64ToBlob(result.audio_data, 'audio/wav');
        this.playAudioBlob(audioBlob);
        console.log(`🎵 Speech synthesized for session: ${sessionId}`);
      }
      
      return result;
      
    } catch (error) {
      console.error('Error synthesizing speech:', error);
      throw error;
    }
  }

  /**
   * Convert base64 string to Blob
   */
  base64ToBlob(base64, mimeType) {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
  }

  /**
   * Play audio blob (this would be called from frontend)
   */
  playAudioBlob(audioBlob) {
    // This method would be called from the frontend to play the audio
    // The actual audio playing logic should be in the frontend
    console.log('🎵 Audio blob ready for playback:', audioBlob.size, 'bytes');
    
    // Create a URL for the blob and send it to frontend
    const audioUrl = URL.createObjectURL(audioBlob);
    
    // Dispatch custom event for frontend to handle
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('geminiAudioReady', {
        detail: { audioUrl: audioUrl }
      }));
    }
  }

  /**
   * Handle real-time financial updates
   */
  async handleFinancialUpdate(updateType, data) {
    try {
      console.log(`📊 Handling financial update: ${updateType} for user: ${data.user_id}`);

      // Update local context if available
      if (this.userContext && this.userContext.user_id === data.user_id) {
        switch (updateType) {
          case 'balance':
            this.userContext.balance = data;
            break;
          case 'transaction':
            this.userContext.recent_transactions.unshift(data);
            if (this.userContext.recent_transactions.length > 10) {
              this.userContext.recent_transactions = this.userContext.recent_transactions.slice(0, 10);
            }
            break;
          case 'bill_payment':
            this.userContext.bills_history.unshift(data);
            if (this.userContext.bills_history.length > 10) {
              this.userContext.bills_history = this.userContext.bills_history.slice(0, 10);
            }
            break;
          case 'daily_limit':
            this.userContext.daily_limits = data;
            break;
        }
      }

      console.log(`✅ Financial update processed: ${updateType}`);
      return { success: true };
    } catch (error) {
      console.error('Error handling financial update:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get available voice commands
   */
  getAvailableCommands() {
    return {
      balance: [
        "What's my balance?",
        "How much money do I have?",
        "Check my account balance",
        "Show me my funds"
      ],
      transactions: [
        "Show my transactions",
        "Recent transaction history",
        "Last 5 transactions",
        "What did I spend money on?"
      ],
      bills: [
        "Pay electricity bill",
        "Recharge my airtime",
        "Pay water bill",
        "Show my bills"
      ],
      transfers: [
        "Send money to John",
        "Transfer funds",
        "Make a payment"
      ],
      limits: [
        "Set daily limit to R5000",
        "Update my spending limit",
        "What's my daily limit?"
      ],
      analytics: [
        "Show my spending patterns",
        "Financial insights",
        "Where am I spending most?"
      ],
      credit: [
        "What's my credit score?",
        "How can I improve my credit?",
        "Credit analysis"
      ]
    };
  }
}

export default GeminiVoiceService;
