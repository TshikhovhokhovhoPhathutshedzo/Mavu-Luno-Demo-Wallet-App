import express from 'express';
import { ensureAuth } from '../middlewares/ensureAuth.js';
import pool from '../auth/db.js';
import AIService from '../services/aiService.js';

const aiRouter = express.Router();

// Get user context for AI
async function getUserContext(user_id) {
  const client = await pool.connect();
  try {
    // Get current balance
    const balanceRes = await client.query(`
      SELECT balance_after FROM transaction_movements 
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `, [user_id]);

    // Get recent transactions
    const recentTransactions = await client.query(`
      SELECT 
        transaction_type,
        amount,
        TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI') as formatted_date,
        payment_method,
        status
      FROM transactions
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 10
    `, [user_id]);

    // Get credit score
    const creditScoreRes = await client.query(`
      SELECT score, grade, factors, recommendations
      FROM credit_scores
      WHERE user_id = $1
      ORDER BY last_updated DESC
      LIMIT 1
    `, [user_id]);

    const currentBalance = balanceRes.rowCount > 0 ? BigInt(balanceRes.rows[0].balance_after) : BigInt(0);
    const transactions = recentTransactions.rows;
    const creditScore = creditScoreRes.rows[0] || { score: 650, grade: 'C', factors: {}, recommendations: [] };

    return {
      balance: (parseFloat(currentBalance.toString()) / 100).toFixed(2),
      transactions: transactions,
      creditScore: creditScore
    };
  } finally {
    client.release();
  }
}

// Simple test endpoint
aiRouter.post('/test', async (req, res) => {
  try {
    const { message } = req.body;
    res.json({
      success: true,
      response: `Hello! You said: "${message}". This is a test response from LunoWallet AI.`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      response: "Test endpoint error"
    });
  }
});

// Enhanced AI chat endpoint with provider selection
aiRouter.post('/chat-enhanced', async (req, res) => {
  console.log('Enhanced AI Chat endpoint hit!', req.path, req.method);
  try {
    const { message, provider = 'openai' } = req.body;
    
    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Message is required and must be a string',
        response: 'Please provide a valid message.'
      });
    }
    
    // Get user context
    let context = null;
    try {
      if (req.user && req.user.user_id) {
        context = await getUserContext(req.user.user_id);
      } else {
        // Default context for testing
        context = {
          user_id: 'test-user',
          username: 'Test User',
          email: 'test@example.com',
          balance: 0,
          recent_transactions: [],
          creditScore: 750
        };
      }
      console.log('User context:', context);
    } catch (contextError) {
      console.error('Error getting user context:', contextError);
      context = {
        user_id: 'test-user',
        username: 'Test User',
        email: 'test@example.com',
        balance: 0,
        recent_transactions: [],
        creditScore: 750
      };
    }
    
    // Generate AI response using the AI service with full database context
    console.log(`Generating response using ${provider}...`);
    const result = await AIService.generateResponseWithDatabaseContext(message, context, provider);
    
    if (result.success) {
      console.log('AI response generated successfully');
      res.json({ 
        response: result.response,
        success: true,
        provider: result.provider,
        timestamp: result.timestamp
      });
    } else {
      console.error('AI response generation failed:', result.error);
      res.status(500).json({ 
        response: result.message || "I'm having trouble processing your request right now. Please try again.",
        success: false,
        error: result.error,
        provider: result.provider
      });
    }

  } catch (error) {
    console.error('Enhanced AI Chat error:', error);
    res.status(500).json({ 
      response: "I'm having trouble processing your request right now. Please try again.",
      success: false,
      error: error.message
    });
  }
});

// Get available AI providers
aiRouter.get('/providers', (req, res) => {
  try {
    const config = AIService.validateConfiguration();
    res.json({
      success: true,
      providers: config.providers,
      valid: config.valid,
      errors: config.errors
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Chat endpoint
aiRouter.post('/chat', async (req, res) => {
  console.log('AI Chat endpoint hit!', req.path, req.method);
  console.log('Request body:', req.body);
  try {
    const { message } = req.body;
    
    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Message is required and must be a string',
        response: 'Please provide a valid message.'
      });
    }
    
    // For testing without authentication, use a default user context
    let context = null;
    try {
      if (req.user && req.user.user_id) {
        context = await getUserContext(req.user.user_id);
      } else {
        // Default context for testing
        context = {
          user_id: 'test-user',
          username: 'Test User',
          email: 'test@example.com',
          balance: 0,
          recent_transactions: [],
          creditScore: 750
        };
      }
      console.log('User context:', context);
    } catch (contextError) {
      console.error('Error getting user context:', contextError);
      context = {
        user_id: 'test-user',
        username: 'Test User',
        email: 'test@example.com',
        balance: 0,
        recent_transactions: [],
        creditScore: 750
      };
    }
    
    // Create system prompt with user context
    const systemPrompt = `You are LunoWallet, an intelligent financial assistant for South African users. You are highly knowledgeable about personal finance, digital banking, and South African financial services.

USER CONTEXT:
- Current Balance: R${context.balance}
- Credit Score: ${context.creditScore || 'Not available'}
- Recent Transactions: ${context.recent_transactions ? context.recent_transactions.length : 0} transactions

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

    // Generate AI response using the AI service
    console.log('Generating response using AI service...');
    const result = await AIService.generateResponseWithFallback(message, context, 'openai');
    
    if (result.success) {
      console.log('AI response generated successfully');
      res.json({ 
        response: result.response,
        success: true,
        provider: result.provider
      });
    } else {
      console.error('AI response generation failed:', result.error);
      res.status(500).json({ 
        response: result.message || "I'm having trouble processing your request right now. Please try again.",
        success: false,
        error: result.error
      });
    }

  } catch (error) {
    console.error('AI Chat error:', error);
    res.status(500).json({ 
      response: "I'm having trouble processing your request right now. Please try again.",
      success: false,
      error: error.message
    });
  }
});

// Test route to debug authentication
aiRouter.get('/test', async (req, res) => {
  res.json({
    success: true,
    message: "AI route is working without auth",
    path: req.path,
    method: req.method
  });
});

// AI Service Status endpoint
aiRouter.get('/status', async (req, res) => {
  try {
    const config = AIService.validateConfiguration();
    const testMessage = "Hello, this is a test message.";
    const testContext = {
      user_id: 'test-user',
      username: 'Test User',
      balance: 1000,
      recent_transactions: [],
      creditScore: { score: 750 }
    };

    // Test offline response
    const offlineResponse = AIService.getOfflineResponse(testMessage, testContext);

    res.json({
      success: true,
      configuration: config,
      offlineResponse: {
        message: testMessage,
        response: offlineResponse
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: "Error checking AI service status"
    });
  }
});

// AI Database Functions Endpoints
aiRouter.get('/balance', ensureAuth, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const balance = await AIService.getCurrentBalance(userId);
    res.json({ success: true, ...balance });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

aiRouter.get('/transactions', ensureAuth, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { limit = 10, offset = 0 } = req.query;
    const transactions = await AIService.getTransactionHistory(userId, parseInt(limit), parseInt(offset));
    res.json({ success: true, transactions });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

aiRouter.get('/stats', ensureAuth, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const stats = await AIService.getTransactionStats(userId);
    res.json({ success: true, ...stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

aiRouter.get('/limits', ensureAuth, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const limits = await AIService.getDailyLimits(userId);
    res.json({ success: true, limits });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

aiRouter.post('/limits', ensureAuth, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { limitType, amount, isActive = true } = req.body;
    const result = await AIService.setDailyLimit(userId, limitType, amount, isActive);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

aiRouter.get('/credit-score', ensureAuth, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const creditScore = await AIService.getCreditScore(userId);
    res.json({ success: true, creditScore });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

aiRouter.get('/bills', ensureAuth, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { limit = 10 } = req.query;
    const bills = await AIService.getBillsHistory(userId, parseInt(limit));
    res.json({ success: true, bills });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

aiRouter.post('/bills/pay', ensureAuth, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { billType, amount, identifier, extra = {} } = req.body;
    const result = await AIService.payBill(userId, billType, amount, identifier, extra);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

aiRouter.get('/analytics', ensureAuth, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { period = '30' } = req.query;
    const analytics = await AIService.getSpendingAnalytics(userId, period);
    res.json({ success: true, analytics });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

aiRouter.get('/category-spending', ensureAuth, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { period = '30' } = req.query;
    const categorySpending = await AIService.getCategorySpending(userId, period);
    res.json({ success: true, categorySpending });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Chat page
aiRouter.get('/chat', ensureAuth, async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const context = await getUserContext(user_id);
    
    res.render('ai-chat', {
      user: req.user,
      context: context,
      active: 'chat'
    });
  } catch (error) {
    console.error('Chat page error:', error);
    res.status(500).send('Server error');
  }
});

export default aiRouter;
