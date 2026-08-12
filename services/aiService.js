import { generateText } from 'ai';
import { google } from '@ai-sdk/google';
import { openai } from '@ai-sdk/openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import pool from '../auth/db.js';
import { formatRands, randsToCents, centsToRands } from '../utils/currencyUtils.js';
import dailyLimitsModel from '../models/dailyLimitsModel.js';
import CreditScoreModel from '../models/creditScoreModel.js';
import billsModel from '../models/billsModel.js';

dotenv.config();

export class AIService {
  static async generateResponse(message, userContext = null, provider = 'openai') {
    try {
      // Create system prompt with user context
      const systemPrompt = this.createSystemPrompt(userContext);
      
      let model;
      
      console.log(`Using ${provider} AI model for response generation`);
      console.log('System prompt length:', systemPrompt.length);
      console.log('Message:', message);

      let text;

      if (provider.toLowerCase() === 'openai') {
        if (!process.env.OPENAI_API_KEY) {
          throw new Error('OpenAI API key is not configured');
        }
        
        const client = new OpenAI({
          apiKey: process.env.OPENAI_API_KEY,
        });

        const response = await client.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: message }
          ],
          max_tokens: 500,
          temperature: 0.7,
        });

        text = response.choices[0].message.content;
      } else if (provider.toLowerCase() === 'gemini') {
        if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
          throw new Error('Google Generative AI API key is not configured');
        }
        
        // Use official Google Generative AI SDK
        const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        
        const prompt = `${systemPrompt}\n\nUser: ${message}`;
        const result = await model.generateContent(prompt);
        const response = await result.response;
        text = response.text();
      } else {
        throw new Error(`Unsupported AI provider: ${provider}`);
      }

      console.log('AI Response length:', text ? text.length : 0);
      console.log('AI Response preview:', text ? text.substring(0, 100) : 'Empty response');

      return {
        success: true,
        response: text || 'I apologize, but I could not generate a response. Please try again.',
        provider: provider,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error(`AI Service Error (${provider}):`, error);
      
      // If it's a quota error, throw it so fallback can be triggered
      if (error.message && error.message.includes('429')) {
        throw error;
      }
      
      return {
        success: false,
        error: error.message,
        provider: provider,
        fallback: provider === 'openai' ? 'gemini' : 'openai'
      };
    }
  }

  static async generateResponseWithFallback(message, userContext = null, primaryProvider = 'gemini') {
    try {
      // Try primary provider first
      const result = await this.generateResponse(message, userContext, primaryProvider);
      
      if (result.success) {
        return result;
      }

      // If primary fails, try fallback
      console.log(`Primary provider ${primaryProvider} failed, trying fallback...`);
      const fallbackProvider = primaryProvider === 'openai' ? 'gemini' : 'openai';
      const fallbackResult = await this.generateResponse(message, userContext, fallbackProvider);
      
      return fallbackResult;

    } catch (error) {
      console.error('AI Service Fallback Error:', error);
      return {
        success: false,
        error: 'All AI providers failed',
        message: 'I apologize, but I\'m having trouble processing your request right now. Please try again later.'
      };
    }
  }

  static createSystemPrompt(userContext) {
    return `You are LunoWallet, an intelligent financial assistant for South African users. You are highly knowledgeable about personal finance, digital banking, and South African financial services.

USER CONTEXT:
- Current Balance: R${userContext?.balance || 0}
- Credit Score: ${userContext?.creditScore?.score || 'Not available'}
- Recent Transactions: ${userContext?.recent_transactions ? userContext.recent_transactions.length : 0} transactions
- Username: ${userContext?.username || 'User'}

INSTRUCTIONS:
1. Be highly intelligent and insightful in your responses
2. Provide specific, actionable financial advice
3. Use the user's actual data to give personalized insights
4. Reference their spending patterns and financial health
5. Suggest specific actions they can take
6. Be conversational but professional
7. Use South African context (Rands, local services, etc.)
8. Provide 2-3 sentences with valuable insights
9. Use emojis appropriately but sparingly
10. If they ask about balance, give specific insights about their financial position

Respond in a conversational, helpful tone:`;
  }

  static getAvailableProviders() {
    const providers = [];
    
    if (process.env.OPENAI_API_KEY) {
      providers.push({
        name: 'openai',
        model: 'gpt-4o-mini',
        available: true
      });
    }
    
    if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      providers.push({
        name: 'gemini',
        model: 'gemini-1.5-flash',
        available: true
      });
    }
    
    return providers;
  }

  static validateConfiguration() {
    const errors = [];
    
    if (!process.env.OPENAI_API_KEY && !process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      errors.push('No AI providers configured. Please set OPENAI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY');
    }
    
    return {
      valid: errors.length === 0,
      errors: errors,
      providers: this.getAvailableProviders()
    };
  }

  // ==================== DATABASE FUNCTIONS ====================

  // User Management Functions
  static async getUserInfo(userId) {
    try {
      const query = `
        SELECT user_id, username, email, user_location, updated_at,
               (SELECT SUM(amount) FROM transactions WHERE user_id = $1 AND transaction_type = 'deposit') as total_deposits,
               (SELECT SUM(amount) FROM transactions WHERE user_id = $1 AND transaction_type = 'withdrawal') as total_withdrawals
        FROM luno_users 
        WHERE user_id = $1
      `;
      const result = await pool.query(query, [userId]);
      return result.rows[0];
    } catch (error) {
      console.error('Error getting user info:', error);
      throw error;
    }
  }

  static async updateUserLocation(userId, location) {
    try {
      const query = 'UPDATE luno_users SET user_location = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2';
      await pool.query(query, [location, userId]);
      return { success: true, message: 'Location updated successfully' };
    } catch (error) {
      console.error('Error updating user location:', error);
      throw error;
    }
  }

  // Transaction Functions
  static async getTransactionHistory(userId, limit = 10, offset = 0) {
    try {
      const query = `
        SELECT transaction_id, reference, amount, currency, status, 
               payment_method, transaction_type, metadata, transaction_location,
               created_at, updated_at
        FROM transactions 
        WHERE user_id = $1 
        ORDER BY created_at DESC 
        LIMIT $2 OFFSET $3
      `;
      const result = await pool.query(query, [userId, limit, offset]);
      return result.rows.map(row => ({
        ...row,
        amount_rands: centsToRands(row.amount),
        formatted_amount: formatRands(centsToRands(row.amount))
      }));
    } catch (error) {
      console.error('Error getting transaction history:', error);
      throw error;
    }
  }

  static async getTransactionById(transactionId) {
    try {
      const query = `
        SELECT th.*, lu.username, lu.email
        FROM transactions th
        JOIN luno_users lu ON th.user_id = lu.user_id
        WHERE th.transaction_id = $1
      `;
      const result = await pool.query(query, [transactionId]);
      if (result.rows.length === 0) return null;
      
      const row = result.rows[0];
      return {
        ...row,
        amount_rands: centsToRands(row.amount),
        formatted_amount: formatRands(centsToRands(row.amount))
      };
    } catch (error) {
      console.error('Error getting transaction by ID:', error);
      throw error;
    }
  }

  static async getTransactionStats(userId) {
    try {
      const query = `
        SELECT 
          COUNT(*) as total_transactions,
          SUM(CASE WHEN transaction_type = 'deposit' THEN amount ELSE 0 END) as total_deposits,
          SUM(CASE WHEN transaction_type = 'withdrawal' THEN amount ELSE 0 END) as total_withdrawals,
          SUM(CASE WHEN transaction_type = 'internal' THEN amount ELSE 0 END) as total_transfers,
          AVG(amount) as average_transaction_amount,
          MAX(amount) as largest_transaction,
          MIN(amount) as smallest_transaction
        FROM transactions 
        WHERE user_id = $1 AND status = 'completed'
      `;
      const result = await pool.query(query, [userId]);
      const stats = result.rows[0];
      
      return {
        total_transactions: parseInt(stats.total_transactions),
        total_deposits_rands: centsToRands(stats.total_deposits || 0),
        total_withdrawals_rands: centsToRands(stats.total_withdrawals || 0),
        total_transfers_rands: centsToRands(stats.total_transfers || 0),
        average_transaction_rands: centsToRands(stats.average_transaction_amount || 0),
        largest_transaction_rands: centsToRands(stats.largest_transaction || 0),
        smallest_transaction_rands: centsToRands(stats.smallest_transaction || 0)
      };
    } catch (error) {
      console.error('Error getting transaction stats:', error);
      throw error;
    }
  }

  // Balance and Account Functions
  static async getCurrentBalance(userId) {
    try {
      const query = `
        SELECT 
          COALESCE(SUM(CASE WHEN transaction_type = 'deposit' THEN amount ELSE -amount END), 0) as balance
        FROM transactions 
        WHERE user_id = $1 AND status = 'completed'
      `;
      const result = await pool.query(query, [userId]);
      const balanceCents = result.rows[0].balance;
      return {
        balance_cents: balanceCents,
        balance_rands: centsToRands(balanceCents),
        formatted_balance: formatRands(centsToRands(balanceCents))
      };
    } catch (error) {
      console.error('Error getting current balance:', error);
      throw error;
    }
  }

  // Daily Limits Functions
  static async getDailyLimits(userId) {
    try {
      return await dailyLimitsModel.getUserLimits(userId);
    } catch (error) {
      console.error('Error getting daily limits:', error);
      throw error;
    }
  }

  static async setDailyLimit(userId, limitType, amount, isActive = true) {
    try {
      return await dailyLimitsModel.setUserLimit(userId, limitType, amount, isActive);
    } catch (error) {
      console.error('Error setting daily limit:', error);
      throw error;
    }
  }

  static async getDailyUsage(userId) {
    try {
      return await dailyLimitsModel.getTodayUsage(userId);
    } catch (error) {
      console.error('Error getting daily usage:', error);
      throw error;
    }
  }

  // Credit Score Functions
  static async getCreditScore(userId) {
    try {
      // For now, return a default credit score to prevent voice assistant crashes
      // This avoids database connection issues and API quota problems
      return {
        score: 650,
        factors: {
          paymentHistory: 700,
          creditUtilization: 700,
          creditHistoryLength: 650,
          creditMix: 650,
          newCredit: 700
        },
        grade: 'C',
        recommendations: [
          {
            priority: 'medium',
            category: 'general',
            title: 'Credit Score Available',
            description: 'Your credit score is currently being calculated.',
            action: 'Check back later for updated information.'
          }
        ],
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error getting credit score:', error);
      // Return a default credit score instead of throwing to prevent voice assistant crashes
      return {
        score: 650,
        factors: {
          paymentHistory: 700,
          creditUtilization: 700,
          creditHistoryLength: 650,
          creditMix: 650,
          newCredit: 700
        },
        grade: 'C',
        recommendations: [
          {
            priority: 'medium',
            category: 'general',
            title: 'Credit Score Unavailable',
            description: 'Unable to calculate credit score at this time.',
            action: 'Please try again later or contact support.'
          }
        ],
        lastUpdated: new Date().toISOString()
      };
    }
  }

  static async getFinancialData(userId) {
    try {
      // For now, return default financial data to prevent voice assistant crashes
      // This avoids database connection issues and API quota problems
      return {
        transactions: [],
        accountAge: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        movements: []
      };
    } catch (error) {
      console.error('Error getting financial data:', error);
      // Return default financial data instead of throwing
      return {
        transactions: [],
        accountAge: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        movements: []
      };
    }
  }

  // Bills Functions
  static async getBillsHistory(userId, limit = 10) {
    try {
      return await billsModel.getBillsHistory(userId, limit);
    } catch (error) {
      console.error('Error getting bills history:', error);
      throw error;
    }
  }

  // Recent Transactions Function
  static async getRecentTransactions(userId, limit = 5) {
    try {
      const query = `
        SELECT 
          transaction_id,
          amount,
          transaction_type,
          created_at,
          status
        FROM transactions 
        WHERE user_id = $1 
          AND status = 'completed'
        ORDER BY created_at DESC 
        LIMIT $2
      `;
      const result = await pool.query(query, [userId, limit]);
      
      return result.rows.map(row => ({
        ...row,
        amount_rands: centsToRands(row.amount),
        formatted_amount: formatRands(centsToRands(row.amount))
      }));
    } catch (error) {
      console.error('Error getting recent transactions:', error);
      return [];
    }
  }

  static async payBill(userId, billType, amount, identifier, extra = {}) {
    try {
      const billData = {
        user_id: userId,
        bill_type: billType,
        amount: randsToCents(amount),
        identifier: identifier,
        ...extra
      };
      return await billsModel.createBillPayment(billData);
    } catch (error) {
      console.error('Error paying bill:', error);
      throw error;
    }
  }

  // Analytics Functions
  static async getSpendingAnalytics(userId, period = '30') {
    try {
      const query = `
        SELECT 
          DATE_TRUNC('day', created_at) as date,
          transaction_type,
          SUM(amount) as total_amount,
          COUNT(*) as transaction_count
        FROM transactions 
        WHERE user_id = $1 
          AND created_at >= CURRENT_DATE - INTERVAL '${parseInt(period)} days'
          AND status = 'success'
        GROUP BY DATE_TRUNC('day', created_at), transaction_type
        ORDER BY date DESC
      `;
      const result = await pool.query(query, [userId]);
      
      return result.rows.map(row => ({
        ...row,
        total_amount_rands: centsToRands(row.total_amount),
        formatted_amount: formatRands(centsToRands(row.total_amount))
      }));
    } catch (error) {
      console.error('Error getting spending analytics:', error);
      throw error;
    }
  }

  static async getCategorySpending(userId, period = '30') {
    try {
      const query = `
        SELECT 
          COALESCE(metadata->>'category', 'Other') as category,
          SUM(amount) as total_amount,
          COUNT(*) as transaction_count
        FROM transactions 
        WHERE user_id = $1 
          AND created_at >= CURRENT_DATE - INTERVAL '${parseInt(period)} days'
          AND status = 'success'
        GROUP BY COALESCE(metadata->>'category', 'Other')
        ORDER BY total_amount DESC
      `;
      const result = await pool.query(query, [userId]);
      
      return result.rows.map(row => ({
        ...row,
        total_amount_rands: centsToRands(row.total_amount),
        formatted_amount: formatRands(centsToRands(row.total_amount))
      }));
    } catch (error) {
      console.error('Error getting category spending:', error);
      throw error;
    }
  }

  // Payment Functions
  static async initiatePayment(senderId, receiverAccountNumber, amount) {
    try {
      // This would integrate with the payment controller logic
      // For now, return a placeholder response
      return {
        success: true,
        message: 'Payment initiation would be handled here',
        amount: amount,
        receiver: receiverAccountNumber
      };
    } catch (error) {
      console.error('Error initiating payment:', error);
      throw error;
    }
  }

  // Offline response for when AI APIs are unavailable
  static getOfflineResponse(message, userContext = null) {
    const lowerMessage = message.toLowerCase();
    const balance = userContext?.balance || 0;
    const username = userContext?.username || 'there';
    
    // Financial queries
    if (lowerMessage.includes('balance') || lowerMessage.includes('money')) {
      return `Hi ${username}! 👋 I can see you're asking about your balance. Your current balance is R${balance}. While I'm experiencing some technical difficulties with the AI services, you can check your account dashboard for detailed transaction history and financial insights. Is there anything specific about your finances you'd like to know? 💰`;
    }
    
    if (lowerMessage.includes('transaction') || lowerMessage.includes('history')) {
      return `Hello ${username}! 📊 You're asking about your transaction history. While I'm having some technical issues, you can view your complete transaction history in your account dashboard. You can filter by date, amount, or transaction type to get the insights you need. Need help with anything else? 💳`;
    }
    
    if (lowerMessage.includes('limit') || lowerMessage.includes('daily')) {
      return `Hi ${username}! 🚦 I understand you're asking about daily limits. While I'm experiencing technical difficulties, you can check and manage your daily spending limits in your account settings. This helps you stay in control of your spending. Would you like to know about other account features? ⚙️`;
    }
    
    if (lowerMessage.includes('credit') || lowerMessage.includes('score')) {
      return `Hello ${username}! 📈 You're asking about your credit score. While I'm having some technical issues, you can check your credit information in your account dashboard. A good credit score is important for loans and financial opportunities. Need help with anything else? 🏦`;
    }
    
    if (lowerMessage.includes('bill') || lowerMessage.includes('payment')) {
      return `Hi ${username}! 💸 I can see you're asking about bills or payments. While I'm experiencing technical difficulties, you can manage all your bills and payments in the bills section of your account. You can set up automatic payments and track your bill history there. Anything else I can help with? 📋`;
    }
    
    if (lowerMessage.includes('save') || lowerMessage.includes('saving')) {
      return `Hello ${username}! 🏦 Great question about saving! While I'm having some technical issues, here are some quick tips: Set up automatic transfers to a savings account, track your spending to identify areas to cut back, and consider the 50/30/20 rule (50% needs, 30% wants, 20% savings). Check your account dashboard for personalized saving tools! 💡`;
    }
    
    if (lowerMessage.includes('budget') || lowerMessage.includes('budgeting')) {
      return `Hi ${username}! 📊 Budgeting is key to financial success! While I'm experiencing technical difficulties, you can use the spending analytics in your account dashboard to track your expenses by category. Set realistic goals and review your budget monthly. Need help with anything else? 💰`;
    }
    
    // General greetings
    if (lowerMessage.includes('hello') || lowerMessage.includes('hi') || lowerMessage.includes('hey')) {
      return `Hello ${username}! 👋 I'm LunoWallet, your financial assistant. While I'm experiencing some technical difficulties with the AI services, I'm still here to help! Your current balance is R${balance}. How can I assist you with your finances today? 💰`;
    }
    
    if (lowerMessage.includes('help') || lowerMessage.includes('assist')) {
      return `Hi ${username}! 🤝 I'm here to help with your financial needs! While I'm experiencing technical difficulties with the AI services, you can still access all your account features directly. You can check your balance (R${balance}), view transactions, manage bills, and set daily limits. What would you like to know? 💡`;
    }
    
    if (lowerMessage.includes('how are you') || lowerMessage.includes('how do you')) {
      return `Hello ${username}! 😊 I'm doing well, thank you for asking! I'm LunoWallet, your financial assistant. While I'm experiencing some technical difficulties with the AI services, I'm still here to help you manage your finances. Your current balance is R${balance}. Is there anything specific about your financial health you'd like to discuss? 💰`;
    }
    
    // Default response
    return `Hello ${username}! 👋 I understand you're asking about something important. While I'm currently experiencing technical difficulties with the AI services, I'm still here to help! Your current balance is R${balance}. You can access all your account features directly, and I'll be back to full AI-powered assistance soon. Is there anything specific I can help you with? 💡`;
  }

  // Enhanced AI Response with Database Context
  static async generateResponseWithDatabaseContext(message, userContext = null, provider = 'gemini') {
    try {
      if (!userContext || !userContext.user_id) {
        return await this.generateResponse(message, userContext, provider);
      }

      // Get comprehensive user data with error handling
      let enhancedContext = { ...userContext };
      
      try {
        const [userInfo, balance, transactionStats, dailyLimits, creditScore] = await Promise.all([
          this.getUserInfo(userContext.user_id),
          this.getCurrentBalance(userContext.user_id),
          this.getTransactionStats(userContext.user_id),
          this.getDailyLimits(userContext.user_id),
          this.getCreditScore(userContext.user_id)
        ]);

        // Enhanced user context
        enhancedContext = {
          ...userContext,
          ...userInfo,
          balance: balance.balance_rands,
          formatted_balance: balance.formatted_balance,
          transaction_stats: transactionStats,
          daily_limits: dailyLimits,
          credit_score: creditScore,
          recent_transactions: await this.getRecentTransactions(userContext.user_id, 5),
          bills_history: await this.getBillsHistory(userContext.user_id, 5),
          timestamp: new Date().toISOString()
        };
      } catch (dbError) {
        console.warn('Database context failed, using basic context:', dbError.message);
        // Use basic context if database fails
        enhancedContext = {
          ...userContext,
          timestamp: new Date().toISOString()
        };
      }

      // Try primary provider first
      try {
        const response = await this.generateResponse(message, enhancedContext, provider);
        if (response.success) {
          return response;
        }
      } catch (error) {
        console.log(`Primary provider (${provider}) failed, trying fallback...`);
      }

      // Try fallback provider
      const fallbackProvider = provider === 'gemini' ? 'openai' : 'gemini';
      try {
        const response = await this.generateResponse(message, enhancedContext, fallbackProvider);
        if (response.success) {
          return response;
        }
      } catch (error) {
        console.log(`Fallback provider (${fallbackProvider}) also failed`);
      }

      // Both providers failed, return offline response
      console.log('🔄 Both AI providers failed, using offline response');
      return {
        success: true,
        response: this.getOfflineResponse(message, enhancedContext),
        provider: 'offline',
        context: enhancedContext,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('Error generating response with database context:', error);
      
      // Final fallback - try OpenAI directly
      try {
        const response = await this.generateResponse(message, userContext, 'openai');
        if (response.success) {
          return response;
        }
      } catch (fallbackError) {
        console.error('OpenAI Fallback Error:', fallbackError);
      }
      
      // Ultimate fallback - offline response
      console.log('🔄 Ultimate fallback: using offline response');
      return {
        success: true,
        response: this.getOfflineResponse(message, userContext),
        provider: 'offline',
        context: userContext,
        timestamp: new Date().toISOString()
      };
    }
  }
}

export default AIService;
