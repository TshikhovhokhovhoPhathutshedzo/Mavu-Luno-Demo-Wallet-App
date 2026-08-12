import pool from "../auth/db.js";
import bcrypt from "bcryptjs";
import anomalyDetection from "../services/anomalyDetection.js";
import crypto from "crypto";
import axios from "axios";
import { storeTransaction, handleWithdrawal } from "./transControllers.js";
import intelligentGeminiService from "../services/intelligentGeminiService.js";
// Old faceAuthService removed - using enhanced system

// Helper function to format transaction descriptions
function getTransactionDescription(transaction, metadata) {
  if (transaction.transaction_type === 'internal' && metadata.payment_type === 'peer_to_peer') {
    if (metadata.direction === 'sent') {
      return `${metadata.receiver_name || metadata.receiver_account || 'Unknown'}`;
    } else if (metadata.direction === 'received') {
      return `${metadata.sender_name || metadata.sender_account || 'Unknown'}`;
    }
  }

  // Default descriptions for other transaction types
  switch (transaction.transaction_type) {
    case 'deposit':
      return 'Deposit';
    case 'withdrawal':
      return 'Withdrawal';
    case 'internal':
      return 'Internal Transfer';
    default:
      return transaction.transaction_type || 'Transaction';
  }
}

const FACE_SECRET = process.env.FACE_SECRET || (() => {
    console.warn('⚠️  WARNING: Using fallback face secret. Set FACE_SECRET in .env for production!');
    // Create a 32-byte key for AES-256-CBC
    const fallbackKey = 'fallback-face-secret-change-in-production-2024';
    return crypto.createHash('sha256').update(fallbackKey).digest('hex').substring(0, 32);
})();
const FACE_MICROSERVICE = process.env.FACE_MICROSERVICE || "http://localhost:5001";

function encryptEmbedding(embedding) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(FACE_SECRET), iv);
  let encrypted = cipher.update(JSON.stringify(embedding));
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}
function decryptEmbedding(data) {
  const [ivHex, encHex] = data.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const encrypted = Buffer.from(encHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-cbc", Buffer.from(FACE_SECRET), iv);
  let decrypted = decipher.update(encrypted);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return JSON.parse(decrypted.toString());
}

export const homePage = async (req, res) => {
   const client = await pool.connect();
   const user_id = req.user.user_id;
 
   try {
     console.log('HomePage - User ID:', user_id);
     console.log('HomePage - User:', req.user);
     
     const balanceRes = await client.query(`
       SELECT balance_after FROM transaction_movements 
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 1
     `, [user_id]);

     // Get user's account number
     const accountResult = await client.query(`
       SELECT account_number FROM luno_users 
       WHERE user_id = $1
     `, [user_id]);

    //  Get plastic card details
    const plasticCard = await client.query(
      `SELECT card_number, TO_CHAR(expiry_date, 'MM/YY') AS expire_date, cvv
       FROM plastic_cards
       WHERE user_id = $1`, [user_id]
    )
    
    console.log('🔐 User ID:', user_id);
    console.log('🔐 Card data:', plasticCard.rows[0]);
    console.log('🔐 CVV value:', plasticCard.rows[0]?.cvv);
    console.log('🔐 Number of card rows:', plasticCard.rowCount);

    // get transaction summary - show recent transactions
    const summaryTrans = await client.query(
      `SELECT
         th.transaction_id,
         th.payment_method,
         th.transaction_type,
         th.amount AS history_amount,
         tm.amount AS movement_amount,
         TO_CHAR(th.created_at, 'YYYY-MM-DD') as created_date,
         th.metadata
       FROM transactions th
       LEFT JOIN transaction_movements tm ON tm.transaction_id = th.transaction_id
       WHERE th.user_id = $1
       ORDER BY th.created_at DESC
       LIMIT 5`, [user_id]
    )

    // Convert amounts - transaction amounts are stored in cents, so convert to rands
    const formattedTransactions = summaryTrans.rows.map(transaction => {
      // Get the amount, preferring movement_amount if available, otherwise history_amount
      let rawAmountInCents = transaction.movement_amount ?? transaction.history_amount;

      // Handle different data types (string, number, BigInt)
      if (typeof rawAmountInCents === 'bigint') {
        rawAmountInCents = Number(rawAmountInCents);
      } else if (typeof rawAmountInCents === 'string') {
        rawAmountInCents = parseFloat(rawAmountInCents);
      }

      // Ensure we have a valid number
      if (isNaN(rawAmountInCents) || !isFinite(rawAmountInCents)) {
        console.warn('Invalid amount detected:', rawAmountInCents, 'for transaction:', transaction.transaction_id);
        rawAmountInCents = 0;
      }

      // Convert cents to rands (divide by 100)
      const displayAmount = (rawAmountInCents / 100).toFixed(2);

      // Parse metadata to get sender/receiver information
      let metadata = {};
      try {
        if (transaction.metadata) {
          if (typeof transaction.metadata === 'string') {
            metadata = JSON.parse(transaction.metadata);
          } else if (typeof transaction.metadata === 'object') {
            metadata = transaction.metadata;
          }
        }
      } catch (e) {
        console.log('Error parsing metadata:', e);
        metadata = {};
      }

      return {
        ...transaction,
        amount: displayAmount,
        metadata: metadata,
        // Add formatted description based on transaction type and metadata
        formatted_description: getTransactionDescription(transaction, metadata)
      };
    });
    
    console.log('Dashboard transaction summary:', summaryTrans.rows.length, 'transactions found');
    console.log('Transaction data:', summaryTrans.rows);
    console.log('Formatted transactions:', formattedTransactions);
    console.log('Balance result:', balanceRes.rows);

    // Check for pending anomalies - show only one at a time
    const allPendingAnomalies = await anomalyDetection.getPendingAnomalies(user_id);
    const pendingAnomalies = allPendingAnomalies.length > 0 ? [allPendingAnomalies[0]] : [];
 
     const prevBalance = balanceRes.rowCount > 0 ? BigInt(balanceRes.rows[0].balance_after) : BigInt(0);
     const transaction  = formattedTransactions;
     // Get optional query params
     const message = req.query.message || '';
     const display = req.query.display || 'none';
     const updatedAmount = req.query.amount;

     // Convert balance from cents to rands for display
     const displayBalance = updatedAmount || (Number(prevBalance) / 100).toFixed(2);

     console.log('Dashboard - Raw balance from DB:', prevBalance.toString());
     console.log('Dashboard - Display balance:', displayBalance);
 
     res.render("index", {
       user: req.user,
       card: plasticCard.rows[0] || null,
       amount: displayBalance,
       summary: transaction,
       message,
       display,
       pendingAnomalies,
       active: "home",
       accountNumber: accountResult.rows[0]?.account_number || 'Not assigned'
     });
 
   } catch (error) {
     console.error(error);
     res.status(500).send("Server error");
   } finally {
     client.release();
   }
 };

// Removed chatPage function - using Vercel Gemini chatbot instead
   const client = await pool.connect();
   const user_id = req.user.user_id;
 
   try {
     // Get current balance
     const balanceRes = await client.query(`
       SELECT balance_after FROM transaction_movements 
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 1
     `, [user_id]);

     // Get transaction history for analytics
     const transactionHistory = await client.query(`
       SELECT 
         transaction_type,
         amount,
         TO_CHAR(created_at, 'YYYY-MM-DD') as date,
         TO_CHAR(created_at, 'HH24:MI') as time,
         payment_method,
         status
       FROM transactions
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 50
     `, [user_id]);

     // Get monthly summary for charts
     const monthlySummary = await client.query(`
       SELECT 
         transaction_type,
         SUM(amount) as total_amount,
         COUNT(*) as transaction_count,
         TO_CHAR(created_at, 'YYYY-MM') as month
       FROM transactions
       WHERE user_id = $1
       AND created_at >= NOW() - INTERVAL '6 months'
       GROUP BY transaction_type, TO_CHAR(created_at, 'YYYY-MM')
       ORDER BY month DESC
     `, [user_id]);

     // Get recent transactions for chat context
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
     let creditScore = creditScoreRes.rows[0] || { score: 650, grade: 'C' };
     
     // If no credit score exists, calculate one
     if (!creditScoreRes.rows[0]) {
       try {
         const { default: CreditScoreModel } = await import('../models/creditScoreModel.js');
         const creditScoreModel = new CreditScoreModel();
         const calculatedScore = await creditScoreModel.calculateCreditScore(user_id);
         await creditScoreModel.saveCreditScore(user_id, calculatedScore);
         creditScore = calculatedScore;
       } catch (error) {
         console.error('Error calculating credit score:', error);
         // Use default if calculation fails
       }
     }
 
     res.render("chat", {
       user: req.user,
       currentBalance: currentBalance.toString(),
       transactionHistory: transactionHistory.rows,
       monthlySummary: monthlySummary.rows,
       recentTransactions: recentTransactions.rows,
       creditScore: creditScore,
       active: "chat"
     });
 
   } catch (error) {
     console.error(error);
     res.status(500).send("Server error");
   } finally {
     client.release();
   }
 };

export const chatbotResponse = async (req, res) => {
   const client = await pool.connect();
   const user_id = req.user.user_id;
   const { message } = req.body;
 
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
     let creditScore = creditScoreRes.rows[0] || { score: 650, grade: 'C', factors: {}, recommendations: [] };
     
     // If no credit score exists, calculate one
     if (!creditScoreRes.rows[0]) {
       try {
         const { default: CreditScoreModel } = await import('../models/creditScoreModel.js');
         const creditScoreModel = new CreditScoreModel();
         const calculatedScore = await creditScoreModel.calculateCreditScore(user_id);
         await creditScoreModel.saveCreditScore(user_id, calculatedScore);
         creditScore = calculatedScore;
       } catch (error) {
         console.error('Error calculating credit score:', error);
         // Use default if calculation fails
       }
     }
     
    // Prepare context for Gemini AI
    const context = {
      balance: (parseFloat(currentBalance.toString()) / 100).toFixed(2),
      transactions: transactions,
      creditScore: creditScore
    };

    // Try Intelligent Gemini AI first, fallback to original logic
    let response;
    if (intelligentGeminiService.isServiceAvailable()) {
      try {
        response = await intelligentGeminiService.generateIntelligentResponse(message, context);
        console.log('✅ Using Intelligent Gemini AI for chatbot response');
      } catch (error) {
        console.error('❌ Intelligent Gemini AI error, using fallback:', error.message);
        response = processChatbotMessage(message, currentBalance.toString(), transactions, creditScore);
      }
    } else {
      console.log('⚠️ Intelligent Gemini AI not available, using fallback logic');
      response = processChatbotMessage(message, currentBalance.toString(), transactions, creditScore);
    }
    
    res.json({ response });
 
   } catch (error) {
     console.error(error);
     res.status(500).json({ error: "Server error" });
   } finally {
     client.release();
   }
 };

function processChatbotMessage(message, balance, transactions, creditScore) {
   const lowerMessage = message.toLowerCase();
   
   // Transaction History Intent
   if (lowerMessage.includes('transaction') || lowerMessage.includes('latest') || lowerMessage.includes('recent') || 
       lowerMessage.includes('history') || lowerMessage.includes('spent') || lowerMessage.includes('expenses')) {
     
     if (transactions.length > 0) {
       let response = "🧾 Here are your recent transactions:\n\n";
       transactions.slice(0, 5).forEach((transaction, index) => {
         const type = transaction.transaction_type.charAt(0).toUpperCase() + transaction.transaction_type.slice(1);
         const amountSign = transaction.transaction_type === 'deposit' ? '+' : '-';
         const emoji = transaction.transaction_type === 'deposit' ? '💰' : '💸';
         const category = transaction.payment_channel || 'General';
         
         const amountRands = (parseFloat(transaction.amount) / 100).toFixed(2);
         response += `${emoji} ${amountSign}R${amountRands} - ${category} (${type})\n`;
         response += `📅 ${transaction.formatted_date}\n\n`;
       });
       
       if (transactions.length > 5) {
         response += `... and ${transactions.length - 5} more transactions. Ask me to show more! 📊`;
       }
       
       return response.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>');
     } else {
       return "📭 You don't have any recent transactions yet. Ready to make your first transaction? 💰";
     }
   }
   
   // Spending Analysis with Charts Intent
   if (lowerMessage.includes('spend') || lowerMessage.includes('analysis') || lowerMessage.includes('chart') || 
       lowerMessage.includes('graph') || lowerMessage.includes('pie') || lowerMessage.includes('visual') ||
       lowerMessage.includes('breakdown') || lowerMessage.includes('category') || lowerMessage.includes('pattern')) {
     
     const withdrawals = transactions.filter(t => t.transaction_type === 'withdrawal');
     if (withdrawals.length > 0) {
       const totalSpentCents = withdrawals.reduce((sum, t) => sum + parseInt(t.amount), 0);
       const totalSpent = totalSpentCents / 100;
       const avgSpending = totalSpent / withdrawals.length;
       
       // Categorize spending by payment channel
       const spendingByCategory = {};
       withdrawals.forEach(t => {
         const category = t.payment_channel || 'Other';
         spendingByCategory[category] = (spendingByCategory[category] || 0) + (parseInt(t.amount) / 100);
       });
       
       let response = "📊 **Spending Analysis & Visualization Suggestions**\n\n";
       response += `💸 Total spent: R${totalSpent.toFixed(2)}\n`;
       response += `📈 Average per transaction: R${avgSpending.toFixed(2)}\n`;
       response += `📅 Number of transactions: ${withdrawals.length}\n\n`;
       
       // Spending breakdown by category
       response += "**📈 Suggested Charts & Graphs:**\n\n";
       
       // Pie Chart for spending categories
       response += "🍰 **Pie Chart - Spending by Category:**\n";
       Object.entries(spendingByCategory).forEach(([category, amount]) => {
         const percentage = totalSpent > 0 ? Math.round((amount / totalSpent) * 100) : 0;
         response += `   • ${category}: R${amount.toFixed(2)} (${percentage}%)\n`;
       });
       response += "\n";
       
       // Bar Chart for monthly spending
       response += "📊 **Bar Chart - Monthly Spending Trend:**\n";
       const monthlySpending = {};
       withdrawals.forEach(t => {
         const month = new Date(t.formatted_date).toLocaleDateString('en-US', { month: 'short' });
         monthlySpending[month] = (monthlySpending[month] || 0) + (parseInt(t.amount) / 100);
       });
       
       Object.entries(monthlySpending).forEach(([month, amount]) => {
         response += `   • ${month}: R${amount.toFixed(2)}\n`;
       });
       response += "\n";
       
       // Line Chart for spending over time
       response += "📈 **Line Chart - Spending Over Time:**\n";
       response += "   • Track daily/weekly spending patterns\n";
       response += "   • Identify peak spending periods\n";
       response += "   • Monitor budget adherence\n\n";
       
       // Additional chart suggestions
       response += "🎯 **Other Visualization Ideas:**\n";
       response += "   • **Donut Chart**: Income vs Expenses ratio\n";
       response += "   • **Heatmap**: Spending by day of week and time\n";
       response += "   • **Scatter Plot**: Amount vs Frequency analysis\n";
       response += "   • **Stacked Bar**: Category spending by month\n\n";
       
       response += "💡 **Insights:**\n";
       const topCategory = Object.entries(spendingByCategory).sort((a, b) => b[1] - a[1])[0];
       if (topCategory) {
         response += `   • Highest spending category: ${topCategory[0]} (R${Number(topCategory[1]).toFixed(2)})\n`;
       }
       response += `   • Estimated monthly spending: R${(avgSpending * 30).toFixed(2)}\n`;
       response += `   • Budget recommendation: R${(avgSpending * 30 * 0.8).toFixed(2)}\n\n`;
       
       response += "🔧 **To view these charts, visit your dashboard or ask for specific analysis!**";
       
       return response.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>');
     } else {
       return "📊 No spending data to analyze yet. Start making transactions and I'll help you create beautiful charts and graphs! 📈";
     }
   }
   
   // Specific Chart Requests
   if (lowerMessage.includes('pie chart') || lowerMessage.includes('pie')) {
     const withdrawals = transactions.filter(t => t.transaction_type === 'withdrawal');
     if (withdrawals.length > 0) {
       const spendingByCategory = {};
       withdrawals.forEach(t => {
         const category = t.payment_channel || 'Other';
         spendingByCategory[category] = (spendingByCategory[category] || 0) + (parseInt(t.amount) / 100);
       });
       
       let response = "🍰 **Pie Chart - Spending Breakdown:**\n\n";
       const totalSpent = withdrawals.reduce((sum, t) => sum + (parseInt(t.amount) / 100), 0);
       
       Object.entries(spendingByCategory).forEach(([category, amount]) => {
         const percentage = Math.round((amount / totalSpent) * 100);
         const emoji = getCategoryEmoji(category);
         response += `${emoji} **${category}**: R${amount.toFixed(2)} (${percentage}%)\n`;
       });
       
       response += `\n💰 **Total Spent**: R${totalSpent.toFixed(2)}`;
       return response.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>');
     } else {
       return "🍰 No spending data available for pie chart. Start making transactions to see your spending breakdown!";
     }
   }
   
   // Bar Chart Request
   if (lowerMessage.includes('bar chart') || lowerMessage.includes('bar')) {
     const withdrawals = transactions.filter(t => t.transaction_type === 'withdrawal');
     if (withdrawals.length > 0) {
       const monthlySpending = {};
       withdrawals.forEach(t => {
         const month = new Date(t.formatted_date).toLocaleDateString('en-US', { month: 'short' });
         monthlySpending[month] = (monthlySpending[month] || 0) + (parseInt(t.amount) / 100);
       });
       
       let response = "📊 **Bar Chart - Monthly Spending:**\n\n";
       Object.entries(monthlySpending).forEach(([month, amount]) => {
         const bars = '█'.repeat(Math.min(Math.round(amount / 100), 10));
         response += `${month}: ${bars} R${amount.toFixed(2)}\n`;
       });
       
       return response.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>');
     } else {
       return "📊 No spending data available for bar chart. Start making transactions to see your monthly trends!";
     }
   }
   
   // Line Chart Request
   if (lowerMessage.includes('line chart') || lowerMessage.includes('trend')) {
     const withdrawals = transactions.filter(t => t.transaction_type === 'withdrawal');
     if (withdrawals.length > 0) {
       let response = "📈 **Line Chart - Spending Trend:**\n\n";
       response += "Here's your spending pattern over time:\n\n";
       
       // Group by week for trend analysis
       const weeklySpending = {};
       withdrawals.forEach(t => {
         const date = new Date(t.formatted_date);
         const week = `Week ${Math.ceil(date.getDate() / 7)}`;
         weeklySpending[week] = (weeklySpending[week] || 0) + (parseInt(t.amount) / 100);
       });
       
       Object.entries(weeklySpending).forEach(([week, amount]) => {
         response += `${week}: R${amount.toFixed(2)}\n`;
       });
       
       response += "\n📊 **Trend Analysis:**\n";
       const amounts = Object.values(weeklySpending);
       const trend = amounts[amounts.length - 1] > amounts[0] ? "📈 Increasing" : "📉 Decreasing";
       response += `   • Overall trend: ${trend}\n`;
       const avgWeekly = amounts.length ? (amounts.reduce((a, b) => a + b, 0) / amounts.length) : 0;
       response += `   • Average weekly spending: R${avgWeekly.toFixed(2)}\n`;
       
       return response.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>');
     } else {
       return "📈 No spending data available for trend analysis. Start making transactions to see your spending patterns!";
     }
   }
   
   // Balance Inquiries
   if (lowerMessage.includes('balance') || lowerMessage.includes('money') || lowerMessage.includes('how much') || 
       lowerMessage.includes('available') || lowerMessage.includes('account')) {
     return `💰 Your current balance is <strong>R${balance}</strong>. This amount is available for transactions and withdrawals.`;
   }

   // Credit Score Intent
   if (lowerMessage.includes('credit') || lowerMessage.includes('score') || lowerMessage.includes('rating') || 
       lowerMessage.includes('grade') || lowerMessage.includes('financial health')) {
     
     const gradeEmoji = {
       'A+': '🏆', 'A': '🥇', 'B+': '🥈', 'B': '🥉', 
       'C+': '📈', 'C': '📊', 'D': '⚠️', 'F': '🚨'
     };
     
     const emoji = gradeEmoji[creditScore.grade] || '📊';
     
     let response = `${emoji} **Your Credit Score:** ${creditScore.score} (${creditScore.grade})\n\n`;
     
     // Add grade description
     const gradeDescriptions = {
       'A+': 'Excellent - You have exceptional financial health!',
       'A': 'Very Good - You have strong financial habits',
       'B+': 'Good - You have above-average financial health',
       'B': 'Fair - You have decent financial habits',
       'C+': 'Average - Room for improvement in financial management',
       'C': 'Below Average - Consider improving your financial habits',
       'D': 'Poor - Significant improvement needed',
       'F': 'Very Poor - Immediate action required'
     };
     
     response += `📋 **Grade Description:** ${gradeDescriptions[creditScore.grade] || 'No description available'}\n\n`;
     
     // Add recommendations if available
     if (creditScore.recommendations && creditScore.recommendations.length > 0) {
       response += `💡 **Recommendations:**\n`;
       creditScore.recommendations.slice(0, 3).forEach(rec => {
         response += `• ${rec}\n`;
       });
       response += `\n`;
     }
     
     // Add factors breakdown if available
     if (creditScore.factors && Object.keys(creditScore.factors).length > 0) {
       response += `📊 **Score Factors:**\n`;
       const factors = creditScore.factors;
       if (factors.paymentHistory) response += `• Payment History: ${factors.paymentHistory}/850\n`;
       if (factors.creditUtilization) response += `• Credit Utilization: ${factors.creditUtilization}/850\n`;
       if (factors.creditHistoryLength) response += `• Credit History: ${factors.creditHistoryLength}/850\n`;
       if (factors.creditMix) response += `• Credit Mix: ${factors.creditMix}/850\n`;
       if (factors.newCredit) response += `• New Credit: ${factors.newCredit}/850\n`;
       response += `\n`;
     }
     
     response += `🔄 **Last Updated:** ${new Date().toLocaleDateString()}\n\n`;
     response += `💡 **Tips to improve your score:**\n• Make timely payments\n• Keep credit utilization low\n• Maintain a good payment history\n• Diversify your credit mix`;
     
     return response.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>');
   }

   // Bank Statement Intent
   if (lowerMessage.includes('statement') || lowerMessage.includes('bank statement') || lowerMessage.includes('report') || 
       lowerMessage.includes('financial report') || lowerMessage.includes('monthly report')) {
     
     let response = "📄 **Bank Statement Request**\n\n";
     response += "I can help you generate a bank statement! Here are your options:\n\n";
     response += "📅 **Available Periods:**\n";
     response += "• **Weekly** - Last 7 days\n";
     response += "• **Monthly** - Last 30 days (default)\n";
     response += "• **Quarterly** - Last 90 days\n";
     response += "• **Yearly** - Last 365 days\n\n";
     
     response += "📧 **What you'll receive:**\n";
     response += "• Detailed transaction history\n";
     response += "• Spending analysis and charts\n";
     response += "• Credit score information\n";
     response += "• Financial insights and recommendations\n";
     response += "• PDF format sent to your email\n\n";
     
     response += "💡 **To request a statement:**\n";
     response += "• Say 'Generate monthly statement'\n";
     response += "• Or 'Send me a weekly report'\n";
     response += "• Or 'I need a quarterly statement'\n\n";
     
     response += "🔒 **Security:** Your statement will be sent to your registered email address only.";
     
     return response.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>');
   }

   // Generate Statement Intent
   if (lowerMessage.includes('generate') || lowerMessage.includes('send') || lowerMessage.includes('create')) {
     if (lowerMessage.includes('statement') || lowerMessage.includes('report')) {
       let period = 'monthly';
       if (lowerMessage.includes('weekly')) period = 'weekly';
       else if (lowerMessage.includes('quarterly')) period = 'quarterly';
       else if (lowerMessage.includes('yearly') || lowerMessage.includes('annual')) period = 'yearly';
       
       let response = `📄 **Generating ${period} statement...**\n\n`;
       response += `✅ Your ${period} bank statement is being prepared\n`;
       response += `📧 It will be sent to your registered email address\n`;
       response += `⏱️ Please allow a few minutes for processing\n\n`;
       response += `📊 **Statement includes:**\n`;
       response += `• Transaction history for ${period} period\n`;
       response += `• Current balance: R${balance}\n`;
       response += `• Credit score: ${creditScore.score} (${creditScore.grade})\n`;
       response += `• Spending analysis and charts\n`;
       response += `• Financial recommendations\n\n`;
       response += `💡 **Note:** Check your email (including spam folder) for the PDF statement.`;
       
       return response.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>');
     }
   }
   
   // Monthly Summary Intent
   if (lowerMessage.includes('month') || lowerMessage.includes('monthly') || lowerMessage.includes('this month') || 
       lowerMessage.includes('june') || lowerMessage.includes('july') || lowerMessage.includes('august')) {
     
     const currentMonth = new Date().getMonth();
     const currentYear = new Date().getFullYear();
     
     const monthlyTransactions = transactions.filter(t => {
       const transactionDate = new Date(t.formatted_date);
       return transactionDate.getMonth() === currentMonth && transactionDate.getFullYear() === currentYear;
     });
     
     if (monthlyTransactions.length > 0) {
       const deposits = monthlyTransactions.filter(t => t.transaction_type === 'deposit');
       const withdrawals = monthlyTransactions.filter(t => t.transaction_type === 'withdrawal');
       
       const totalDeposits = deposits.reduce((sum, t) => sum + (parseInt(t.amount) / 100), 0);
       const totalWithdrawals = withdrawals.reduce((sum, t) => sum + (parseInt(t.amount) / 100), 0);
       const netAmount = totalDeposits - totalWithdrawals;
       
       const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                          'July', 'August', 'September', 'October', 'November', 'December'];
       
       return `📅 **${monthNames[currentMonth]} Summary**\n\n💰 Deposits: R${totalDeposits.toFixed(2)} (${deposits.length} transactions)\n💸 Withdrawals: R${totalWithdrawals.toFixed(2)} (${withdrawals.length} transactions)\n📊 Net: R${netAmount.toFixed(2)}\n\n${netAmount > 0 ? '✅ Great job saving this month!' : '💡 Consider reducing expenses next month.'}`;
     } else {
       return "📅 No transactions this month yet. Ready to start managing your money? 💰";
     }
   }
   
   // Deposit Instructions Intent
   if (lowerMessage.includes('deposit') || lowerMessage.includes('top up') || lowerMessage.includes('add money') || 
       lowerMessage.includes('transfer') || lowerMessage.includes('fund')) {
     return `💰 **How to Deposit Money**\n\n🏦 **EFT Transfer**\nBank: FNB\nAccount: 1234567890\nReference: [Your Username]\n\n📱 **Mobile Money**\n• Use your mobile wallet\n• Scan QR code in app\n• Instant deposit\n\n💳 **Card Payment**\n• Tap 'Deposit' button\n• Enter amount\n• Use your card\n\nNeed help with a specific method? Just ask! 😊`;
   }
   
   // Withdrawal Instructions Intent
   if (lowerMessage.includes('withdraw') || lowerMessage.includes('take out') || lowerMessage.includes('send money') || 
       lowerMessage.includes('transfer out')) {
     return `💸 **How to Withdraw Money**\n\n1️⃣ Tap the 💸 icon on your dashboard\n2️⃣ Select 'Withdraw'\n3️⃣ Enter amount (max R${Math.min(parseInt(balance), 10000).toLocaleString()})\n4️⃣ Choose destination:\n   • Bank account\n   • Mobile number\n   • Other wallet\n5️⃣ Confirm with your PIN\n\n💰 Available for withdrawal: R${balance}\n\nNeed help with a specific withdrawal method? Ask me! 😊`;
   }
   
   // Settings Intent
   if (lowerMessage.includes('setting') || lowerMessage.includes('preference') || lowerMessage.includes('configure') || 
       lowerMessage.includes('notification') || lowerMessage.includes('language')) {
     return `⚙️ **Wallet Settings**\n\n🔔 **Notifications**\n• Transaction alerts\n• Balance updates\n• Security alerts\n\n🌐 **Language**\n• English\n• Zulu\n• Xhosa\n• Afrikaans\n\n💵 **Budget Limits**\n• Set monthly spending limit\n• Category budgets\n• Savings goals\n\n🔒 **Security**\n• PIN management\n• Biometric login\n• Freeze wallet\n\nWhat would you like to configure? 😊`;
   }
   
   // Category-specific spending
   if (lowerMessage.includes('food') || lowerMessage.includes('groceries') || lowerMessage.includes('restaurant')) {
     const foodTransactions = transactions.filter(t => 
       t.payment_channel && t.payment_channel.toLowerCase().includes('food') ||
       t.payment_channel && t.payment_channel.toLowerCase().includes('grocery') ||
       t.payment_channel && t.payment_channel.toLowerCase().includes('restaurant')
     );
     
     if (foodTransactions.length > 0) {
       const totalFood = foodTransactions.reduce((sum, t) => sum + (parseInt(t.amount) / 100), 0);
       return `🍽️ **Food & Dining Spending**\n\n💰 Total spent: R${totalFood.toFixed(2)}\n📊 Transactions: ${foodTransactions.length}\n📅 Average: R${(totalFood / foodTransactions.length).toFixed(2)}\n\n💡 **Tip**: Try cooking at home more to save on dining out! 🏠`;
     } else {
       return "🍽️ No food-related transactions found. Start tracking your dining expenses! 🍕";
     }
   }
   
  // Greetings
  if (lowerMessage.includes('hello') || lowerMessage.includes('hi') || lowerMessage.includes('hey')) {
    return "Hello! I'm your intelligent financial assistant powered by advanced AI. I can analyze your spending patterns, provide personalized financial advice, and help you make smarter money decisions. How can I assist you today? 🤖💡";
  }
   
  // Help requests
  if (lowerMessage.includes('help') || lowerMessage.includes('what can you do') || lowerMessage.includes('support')) {
    return "I'm your intelligent financial assistant powered by advanced AI! I can help you with:\n\n🧠 **Intelligent Analysis**\n• Analyze your spending patterns and trends\n• Provide personalized financial insights\n• Give smart money management advice\n\n💰 **Financial Guidance**\n• Balance inquiries with financial context\n• Transaction analysis and recommendations\n• Credit score insights and improvement tips\n\n💡 **Smart Recommendations**\n• Personalized savings strategies\n• Budget optimization suggestions\n• Investment and growth opportunities\n\n🎯 **Account Management**\n• Deposit and withdrawal guidance\n• Bill payment assistance\n• Daily limit management\n\nAsk me anything about your finances and I'll provide intelligent, personalized advice! 🤖💡";
  }
   
  // Default intelligent response
  return "I'm your intelligent financial assistant! I can analyze your spending patterns, provide personalized financial advice, and help you make smarter money decisions. Try asking me about your balance, transactions, or how to improve your financial health! 💡🤖";
}

// Helper function to get category emoji
function getCategoryEmoji(category) {
   const categoryMap = {
     'card': '💳',
     'bank_transfer': '🏦',
     'paystack': '💳',
     'mobile_money': '📱',
     'food': '🍽️',
     'grocery': '🛒',
     'restaurant': '🍕',
     'transport': '🚗',
     'entertainment': '🎬',
     'shopping': '🛍️',
     'health': '🏥',
     'education': '📚',
     'other': '📦'
   };
   
   const lowerCategory = category.toLowerCase();
   for (const [key, emoji] of Object.entries(categoryMap)) {
     if (lowerCategory.includes(key)) {
       return emoji;
     }
   }
   return '📦'; // Default emoji
}

export const settingsPage = async (req, res) => {
   const client = await pool.connect();
   const user_id = req.user.user_id;
 
   try {
     // Get current balance
     const balanceRes = await client.query(`
       SELECT balance_after FROM transaction_movements 
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 1
     `, [user_id]);

     // Get existing security questions
     const securityQuestions = await client.query(`
       SELECT question_text, is_active
       FROM security_questions
       WHERE user_id = $1
       ORDER BY created_at DESC
     `, [user_id]);

     // Get recent notifications
     const notifications = await client.query(`
       SELECT title, message, notification_type, is_read, created_at
       FROM user_notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 10
     `, [user_id]);

     const currentBalance = balanceRes.rowCount > 0 ? BigInt(balanceRes.rows[0].balance_after) : BigInt(0);
 
     res.render("settings", {
       user: req.user,
       currentBalance: currentBalance.toString(),
       securityQuestions: securityQuestions.rows,
       notifications: notifications.rows,
       active: "settings"
     });
 
   } catch (error) {
     console.error(error);
     res.status(500).send("Server error");
   } finally {
     client.release();
   }
 };

export const updateSecurityQuestions = async (req, res) => {
   const client = await pool.connect();
   const user_id = req.user.user_id;
   const { question1, answer1, question2, answer2, question3, answer3 } = req.body;
 
   try {
     // Validate input
     if (!question1 || !answer1 || !question2 || !answer2 || !question3 || !answer3) {
       return res.status(400).json({
         success: false,
         message: "All security questions and answers are required"
       });
     }

     // Map option values to actual question text
     const questionMap = {
       'pet': 'What is the name of your first pet?',
       'school': 'What was the name of your primary school?',
       'city': 'In what city were you born?',
       'mother': 'What is your mother\'s maiden name?',
       'car': 'What was your first car?'
     };

     // Start transaction
     await client.query("BEGIN");

     // Deactivate existing questions
     await client.query(`
       UPDATE security_questions 
       SET is_active = false 
       WHERE user_id = $1
     `, [user_id]);

     // Hash answers and insert new questions
     const saltRounds = 10;
     const questions = [
       { question: questionMap[question1] || question1, answer: answer1 },
       { question: questionMap[question2] || question2, answer: answer2 },
       { question: questionMap[question3] || question3, answer: answer3 }
     ];

     for (const q of questions) {
       if (q.question && q.answer) {
         const hashedAnswer = await bcrypt.hash(q.answer.toLowerCase().trim(), saltRounds);
         await client.query(`
           INSERT INTO security_questions (user_id, question_text, answer_hash)
           VALUES ($1, $2, $3)
         `, [user_id, q.question, hashedAnswer]);
       }
     }

     // Commit transaction
     await client.query("COMMIT");

     res.json({
       success: true,
       message: "Security questions updated successfully"
     });
 
   } catch (error) {
     await client.query("ROLLBACK");
     console.error("Security questions update error:", error);
     res.status(500).json({
       success: false,
       message: "Error updating security questions"
     });
   } finally {
     client.release();
   }
 };

export const getSecurityQuestions = async (req, res) => {
   const client = await pool.connect();
   const user_id = req.user.user_id;
 
   try {
     const questions = await client.query(`
       SELECT question_text
       FROM security_questions
       WHERE user_id = $1 AND is_active = true
       ORDER BY created_at DESC
       LIMIT 3
     `, [user_id]);

     res.json({
       success: true,
       questions: questions.rows.map(q => ({ question_text: q.question_text }))
     });
   } catch (error) {
     console.error("Error getting security questions:", error);
     res.status(500).json({
       success: false,
       message: "Error retrieving security questions"
     });
   } finally {
     client.release();
   }
 };

export const verifyAnomaly = async (req, res) => {
   const user_id = req.user.user_id;
   const { anomalyId, anomalyIds, answers, action, faceImage, transactionData } = req.body;

   // Enhanced debug logging
   console.log('=== verifyAnomaly called ===');
   console.log('Request body:', req.body);
   console.log('anomalyId type:', typeof anomalyId, 'value:', anomalyId);
   console.log('anomalyIds type:', typeof anomalyIds, 'value:', anomalyIds);
   console.log('user_id type:', typeof user_id, 'value:', user_id);
   console.log('action:', action);
   console.log('answers:', answers);
   console.log('faceImage provided:', !!faceImage);
 
   try {
     // Face authentication is disabled - only security questions allowed
     if (faceImage) {
       return res.json({
         success: false,
         message: "Face authentication is currently disabled. Please use security questions instead."
       });
     }
     // If we have answers, verify security questions
     else if (answers && answers.length > 0) {
       const verification = await anomalyDetection.verifySecurityQuestions(user_id, answers);
       
       if (!verification.verified) {
         return res.json({
           success: false,
           message: verification.message
         });
       }
     }
     else {
       return res.json({
         success: false,
         message: "Please provide either security answers or face image for verification."
       });
     }

     // Resolve anomalies
     const status = action === 'authorize' ? 'authorized' : 'rejected';
     console.log('Status to set:', status);
     
     // Handle single anomaly ID
     if (anomalyId && typeof anomalyId === 'string') {
       console.log('Processing single anomalyId:', anomalyId);
       await anomalyDetection.resolveAnomaly(anomalyId, status, user_id);
     }
     
     // Handle multiple anomaly IDs (for transaction rejections)
     if (anomalyIds && Array.isArray(anomalyIds) && anomalyIds.length > 0) {
       console.log('Processing multiple anomalyIds:', anomalyIds);
       for (const id of anomalyIds) {
         console.log('Processing anomalyId in loop:', id);
         await anomalyDetection.resolveAnomaly(id, status, user_id);
       }
     }

     // Force clear all pending anomalies for this user after any verification
     console.log('Calling rejectAllPendingAnomalies for user_id:', user_id);
     await anomalyDetection.rejectAllPendingAnomalies(user_id);

     // If transaction data is provided and action is 'authorize', process the transaction
     if (transactionData && action === 'authorize') {
       console.log('Processing transaction after verification:', transactionData);
       
       try {
         // Determine transaction type from the transaction data or request
         const transactionType = req.body.transactionType || 'deposit'; // Default to deposit
         console.log('Transaction type determined:', transactionType);
         
         if (transactionType === 'deposit') {
           console.log('Processing deposit transaction...');
           // For deposits, don't process immediately - just return success to proceed to Paystack
           console.log('Deposit verification successful, proceeding to Paystack...');
           return res.json({
             success: true,
             message: 'Security verification successful. Proceeding to payment.',
             proceedToPayment: true
           });
         } else if (transactionType === 'withdrawal') {
           console.log('Processing withdrawal transaction...');
           // Process withdrawal directly
           const withdrawalReq = {
             body: {
               ...transactionData,
               anomalyVerified: true
             },
             user: req.user,
             headers: req.headers || {},
             ip: req.ip || req.connection?.remoteAddress || '127.0.0.1'
           };
           
           console.log('Withdrawal request body:', withdrawalReq.body);
           
           const withdrawalRes = {
             json: (data) => {
               console.log('Withdrawal response data:', data);
               if (data.success) {
                 console.log('Withdrawal successful, sending response...');
                 return res.json({
                   success: true,
                   message: `Transaction verified and processed successfully. ${data.message}`,
                   transactionProcessed: true
                 });
               } else {
                 console.log('Withdrawal failed, sending error response...');
                 return res.json({
                   success: false,
                   message: `Verification successful but transaction failed: ${data.message}`
                 });
               }
             },
             status: (code) => {
               console.log('Withdrawal status called with code:', code);
               return {
                 json: (data) => {
                   console.log('Withdrawal error response:', data);
                   return res.json({
                     success: false,
                     message: `Verification successful but transaction failed: ${data.message}`
                   });
                 }
               };
             }
           };
           
           console.log('Calling handleWithdrawal...');
           await handleWithdrawal(withdrawalReq, withdrawalRes);
           console.log('handleWithdrawal completed');
           return; // Exit early to prevent duplicate response
         } else {
           console.log('Unknown transaction type:', transactionType);
           return res.json({
             success: false,
             message: 'Unknown transaction type. Please try again.'
           });
         }
       } catch (transactionError) {
         console.error('Error processing transaction after verification:', transactionError);
         return res.json({
           success: false,
           message: 'Verification successful but transaction processing failed. Please try again.'
         });
       }
     }

     res.json({
       success: true,
       message: `Anomaly${anomalyIds && anomalyIds.length > 1 ? 'ies' : ''} ${status} successfully`
     });
   } catch (error) {
     console.error("Error verifying anomaly:", error);
     res.status(500).json({
       success: false,
       message: "Error processing verification"
     });
   }
 };

export const testAnomaly = async (req, res) => {
   const user_id = req.user.user_id;
 
   try {
     // Create a test anomaly
     await anomalyDetection.createAnomaly(user_id, 'large_amount', 'high', 'Test anomaly for R15,000', {
       amount: 15000,
       transactionType: 'deposit',
       threshold: 10000
     });

     res.json({
       success: true,
       message: 'Test anomaly created successfully. Check your dashboard for the alert.'
     });
   } catch (error) {
     console.error("Error creating test anomaly:", error);
     res.status(500).json({
       success: false,
       message: "Error creating test anomaly"
     });
   }
 };

export const getFraudInsights = async (req, res) => {
  const user_id = req.user.user_id;
  const client = await pool.connect();
  try {
    // Pie: Anomaly type distribution
    const byType = await client.query(
      `SELECT anomaly_type, COUNT(*)::int as count FROM anomaly_detections WHERE user_id = $1 GROUP BY anomaly_type`, [user_id]);
    // Trend: Anomalies per month
    const byMonth = await client.query(
      `SELECT TO_CHAR(detected_at, 'YYYY-MM') as month, COUNT(*)::int as count FROM anomaly_detections WHERE user_id = $1 GROUP BY month ORDER BY month`, [user_id]);
    // Bar: Severity breakdown
    const bySeverity = await client.query(
      `SELECT severity, COUNT(*)::int as count FROM anomaly_detections WHERE user_id = $1 GROUP BY severity`, [user_id]);

    res.json({
      pie: byType.rows,
      trend: byMonth.rows,
      bar: bySeverity.rows
    });
  } finally {
    client.release();
  }
};
 
// PATCH: Update user profile (email/username)
export const updateProfile = async (req, res) => {
  const client = await pool.connect();
  const user_id = req.user.user_id;
  const { email, username } = req.body;
  try {
    // Validate input
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, message: 'Invalid email format.' });
    }
    if (username && !/^[a-zA-Z0-9]{3,30}$/.test(username)) {
      return res.status(400).json({ success: false, message: 'Username must be 3-30 alphanumeric characters.' });
    }
    // Check uniqueness
    if (email) {
      const emailCheck = await client.query('SELECT user_id FROM luno_users WHERE email = $1 AND user_id != $2', [email, user_id]);
      if (emailCheck.rows.length > 0) {
        return res.status(409).json({ success: false, message: 'This email is already in use.' });
      }
    }
    if (username) {
      const usernameCheck = await client.query('SELECT user_id FROM luno_users WHERE username = $1 AND user_id != $2', [username, user_id]);
      if (usernameCheck.rows.length > 0) {
        return res.status(409).json({ success: false, message: 'This username is already in use.' });
      }
    }
    // Build update query
    const fields = [];
    const values = [];
    let idx = 1;
    if (email) { fields.push(`email = $${idx++}`); values.push(email); }
    if (username) { fields.push(`username = $${idx++}`); values.push(username); }
    if (fields.length === 0) {
      return res.status(400).json({ success: false, message: 'No changes provided.' });
    }
    values.push(user_id);
    const query = `UPDATE luno_users SET ${fields.join(', ')} WHERE user_id = $${idx} RETURNING email, username`;
    const result = await client.query(query, values);
    return res.json({ success: true, user: result.rows[0] });
  } catch (error) {
    console.error('Profile update error:', error);
    return res.status(500).json({ success: false, message: 'Something went wrong. Try again later.' });
  } finally {
    client.release();
  }
};
 
// Check if username is unique (for AJAX validation)
export const checkUsernameUnique = async (req, res) => {
  const client = await pool.connect();
  try {
    const { username } = req.query;
    
    // Validate username format
    if (!username || !/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
      return res.json({ 
        unique: false, 
        message: 'Username must be 3-30 characters and contain only letters, numbers, and underscores' 
      });
    }
    
    const user_id = req.user.user_id;
    
    // Check if username exists (excluding current user)
    const result = await client.query(
      'SELECT user_id, username FROM luno_users WHERE username = $1 AND user_id != $2', 
      [username, user_id]
    );
    
    const isUnique = result.rows.length === 0;
    
    res.json({ 
      unique: isUnique,
      message: isUnique ? 'Username is available' : 'Username is already in use'
    });
  } catch (error) {
    console.error('Username check error:', error);
    res.status(500).json({ 
      unique: false, 
      message: 'Error checking username availability' 
    });
  } finally {
    client.release();
  }
};

// Check if email is unique (for AJAX validation)
export const checkEmailUnique = async (req, res) => {
  const client = await pool.connect();
  try {
    const { email } = req.query;
    
    // Validate email format
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.json({ 
        unique: false, 
        message: 'Please enter a valid email address' 
      });
    }
    
    const user_id = req.user.user_id;
    
    // Check if email exists (excluding current user)
    const result = await client.query(
      'SELECT user_id, email FROM luno_users WHERE email = $1 AND user_id != $2', 
      [email, user_id]
    );
    
    const isUnique = result.rows.length === 0;
    
    res.json({ 
      unique: isUnique,
      message: isUnique ? 'Email is available' : 'Email is already in use'
    });
  } catch (error) {
    console.error('Email check error:', error);
    res.status(500).json({ 
      unique: false, 
      message: 'Error checking email availability' 
    });
  } finally {
    client.release();
  }
};

// Combined function to check both username and email uniqueness
export const checkUsernameAndEmailUnique = async (req, res) => {
  const client = await pool.connect();
  try {
    const { username, email } = req.query;
    const user_id = req.user.user_id;
    
    const results = {
      username: { unique: true, message: 'Username is available' },
      email: { unique: true, message: 'Email is available' }
    };
    
    // Check username if provided
    if (username) {
      if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
        results.username = { 
          unique: false, 
          message: 'Username must be 3-30 characters and contain only letters, numbers, and underscores' 
        };
      } else {
        const usernameResult = await client.query(
          'SELECT user_id FROM luno_users WHERE username = $1 AND user_id != $2', 
          [username, user_id]
        );
        results.username = {
          unique: usernameResult.rows.length === 0,
          message: usernameResult.rows.length === 0 ? 'Username is available' : 'Username is already in use'
        };
      }
    }
    
    // Check email if provided
    if (email) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        results.email = { 
          unique: false, 
          message: 'Please enter a valid email address' 
        };
      } else {
        const emailResult = await client.query(
          'SELECT user_id FROM luno_users WHERE email = $1 AND user_id != $2', 
          [email, user_id]
        );
        results.email = {
          unique: emailResult.rows.length === 0,
          message: emailResult.rows.length === 0 ? 'Email is available' : 'Email is already in use'
        };
      }
    }
    
    res.json(results);
  } catch (error) {
    console.error('Username and email check error:', error);
    res.status(500).json({ 
      error: 'Error checking availability',
      username: { unique: false, message: 'Error checking username' },
      email: { unique: false, message: 'Error checking email' }
    });
  } finally {
    client.release();
  }
};

// Get current user's notification settings
export const getNotificationSettings = async (req, res) => {
  const client = await pool.connect();
  try {
    const user_id = req.user.user_id;
    const result = await client.query(
      'SELECT push_enabled, inapp_enabled FROM user_notification_settings WHERE user_id = $1',
      [user_id]
    );
    if (result.rows.length === 0) {
      // If not set, create defaults
      await client.query(
        'INSERT INTO user_notification_settings (user_id, push_enabled, inapp_enabled) VALUES ($1, true, true) ON CONFLICT (user_id) DO NOTHING',
        [user_id]
      );
      return res.json({ push_enabled: true, inapp_enabled: true });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Fetch notification settings error:', error);
    res.status(500).json({ message: 'Failed to fetch notification settings.' });
  } finally {
    client.release();
  }
};

// Update current user's notification settings
export const updateNotificationSettings = async (req, res) => {
  const client = await pool.connect();
  try {
    const user_id = req.user.user_id;
    let { push_enabled, inapp_enabled } = req.body;
    
    // Validate input
    if (push_enabled === undefined || inapp_enabled === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Both push_enabled and inapp_enabled are required'
      });
    }
    
    // Handle string values from form data
    if (typeof push_enabled === 'string') {
      push_enabled = push_enabled === 'true' || push_enabled === 'Enabled';
    }
    if (typeof inapp_enabled === 'string') {
      inapp_enabled = inapp_enabled === 'true' || inapp_enabled === 'On';
    }
    
    // Sanitize input: only allow boolean true/false
    push_enabled = Boolean(push_enabled);
    inapp_enabled = Boolean(inapp_enabled);
    
    // Update or insert
    await client.query(
      `INSERT INTO user_notification_settings (user_id, push_enabled, inapp_enabled, updated_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id) DO UPDATE SET push_enabled = $2, inapp_enabled = $3, updated_at = CURRENT_TIMESTAMP`,
      [user_id, push_enabled, inapp_enabled]
    );
    
    res.json({ 
      success: true, 
      message: 'Notification settings updated successfully',
      settings: { push_enabled, inapp_enabled }
    });
  } catch (error) {
    console.error('Update notification settings error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update notification settings.' 
    });
  } finally {
    client.release();
  }
};

// POST /api/face/enroll - Redirect to enhanced system
export const enrollFace = async (req, res) => {
  // Redirect to enhanced face enrollment system
  const { startFaceEnrollment } = await import('./enhancedFaceAuthController.js');
  return startFaceEnrollment(req, res);
};

// POST /api/face/auth
export const authFace = async (req, res) => {
  // Redirect to enhanced face verification system
  const { verifyFaceLogin } = await import('./enhancedFaceAuthController.js');
  return verifyFaceLogin(req, res);
};

// DELETE /api/face
export const deleteFace = async (req, res) => {
  const client = await pool.connect();
  try {
    const user_id = req.user.user_id;
    await client.query(
      `DELETE FROM user_face_embeddings WHERE user_id = $1`,
      [user_id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error("Delete face error:", error);
    res.status(500).json({ success: false, message: "Failed to delete face data." });
  } finally {
    client.release();
  }
};

// GET /api/face/status
export const faceStatus = async (req, res) => {
  const client = await pool.connect();
  try {
    const user_id = req.user.user_id;
    const result = await client.query(
      `SELECT facial_login_enabled FROM user_face_embeddings WHERE user_id = $1`,
      [user_id]
    );
    res.json({ 
      facial_login_enabled: result.rows.length > 0 ? result.rows[0].facial_login_enabled : false 
    });
  } catch (error) {
    console.error("Face status error:", error);
    res.status(500).json({ success: false, message: "Failed to get face status." });
  } finally {
    client.release();
  }
};

// Add transaction history view function
export const transactionsPage = async (req, res) => {
  const client = await pool.connect();
  try {
    const user_id = req.user.user_id;
    console.log('TransactionsPage - User ID:', user_id);
    console.log('TransactionsPage - User:', req.user);
    
    // Get current balance
    const balanceRes = await client.query(`
      SELECT balance_after FROM transaction_movements 
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `, [user_id]);

    // Get transaction history with metadata
    const transactionHistory = await client.query(`
      SELECT 
        th.transaction_id,
        th.reference,
        th.amount,
        th.currency,
        th.status,
        th.payment_method,
        th.transaction_type,
        th.created_at,
        th.metadata,
        tm.description
      FROM transactions th
      LEFT JOIN transaction_movements tm ON th.transaction_id = tm.transaction_id
      WHERE th.user_id = $1
      ORDER BY th.created_at DESC
      LIMIT 50
    `, [user_id]);

    // Format transactions with proper amounts and descriptions
    const formattedTransactions = transactionHistory.rows.map(transaction => {
      // Convert amount from cents to rands
      const amountInCents = parseFloat(transaction.amount);
      const displayAmount = (amountInCents / 100).toFixed(2);
      
      // Parse metadata
      let metadata = {};
      try {
        if (transaction.metadata) {
          if (typeof transaction.metadata === 'string') {
            metadata = JSON.parse(transaction.metadata);
          } else if (typeof transaction.metadata === 'object') {
            metadata = transaction.metadata;
          }
        }
      } catch (e) {
        console.log('Error parsing metadata:', e);
        metadata = {};
      }
      
      // Format date
      const createdDate = new Date(transaction.created_at);
      const formattedDate = createdDate.toLocaleDateString('en-ZA', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      
      return {
        ...transaction,
        amount: displayAmount,
        metadata: metadata,
        formatted_description: getTransactionDescription(transaction, metadata),
        created_date: formattedDate
      };
    });

    const currentBalance = balanceRes.rows.length > 0 ? balanceRes.rows[0].balance_after : 0;
    const displayBalance = currentBalance / 100; // Convert from kobo to naira

    console.log('Transactions Page - Raw balance from DB:', currentBalance.toString());
    console.log('Transactions Page - Display balance:', displayBalance);
    console.log('Transactions Page - First few transactions:', formattedTransactions.slice(0, 3).map(t => ({
      id: t.transaction_id,
      type: t.transaction_type,
      rawAmount: t.amount,
      displayAmount: t.amount
    })));

    res.render("transactions", {
      user: req.user,
      balance: displayBalance,
      data: formattedTransactions,
      message: formattedTransactions.length === 0 ? 'No transactions found' : null,
      active: "transactions"
    });

  } catch (error) {
    console.error('Transaction history error:', error);
    res.status(500).send("Server error");
  } finally {
    client.release();
  }
};

// Add bank statement request function
export const requestBankStatement = async (req, res) => {
  const client = await pool.connect();
  try {
    const user_id = req.user.user_id;
    const { start_date, end_date, format = 'pdf' } = req.body;
    
    // Validate dates
    if (!start_date || !end_date) {
      return res.status(400).json({ 
        success: false, 
        message: 'Start date and end date are required' 
      });
    }
    
    // Get transaction history for the specified period
    const statementData = await client.query(`
      SELECT 
        transaction_id,
        reference,
        amount,
        currency,
        status,
        payment_method,
        transaction_type,
        created_at,
        description
      FROM transaction_movements 
      WHERE user_id = $1 
        AND created_at >= $2 
        AND created_at <= $3
      ORDER BY created_at DESC
    `, [user_id, start_date, end_date]);
    
    // Get user details
    const userRes = await client.query(
      'SELECT first_name, last_name, email FROM luno_users WHERE user_id = $1',
      [user_id]
    );
    
    if (userRes.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }
    
    const user = userRes.rows[0];
    const transactions = statementData.rows;
    
    // Calculate summary
    const totalTransactions = transactions.length;
    const totalAmount = transactions.reduce((sum, t) => sum + parseFloat(t.amount), 0);
    
    res.json({
      success: true,
      data: {
        user: {
          name: `${user.first_name} ${user.last_name}`,
          email: user.email
        },
        period: {
          start_date,
          end_date
        },
        summary: {
          total_transactions: totalTransactions,
          total_amount: totalAmount
        },
        transactions: transactions
      }
    });
    
  } catch (error) {
    console.error('Bank statement request error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to generate bank statement' 
    });
  } finally {
    client.release();
  }
};

// Change password function
export const changePassword = async (req, res) => {
  const client = await pool.connect();
  try {
    const user_id = req.user.user_id;
    const { currentPassword, newPassword } = req.body;
    
    // Validate input
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ 
        success: false, 
        message: 'Current password and new password are required' 
      });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({ 
        success: false, 
        message: 'New password must be at least 6 characters long' 
      });
    }
    
    // Get current user password
    const userRes = await client.query(
      'SELECT password FROM luno_users WHERE user_id = $1',
      [user_id]
    );
    
    if (userRes.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }
    
    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, userRes.rows[0].password);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({ 
        success: false, 
        message: 'Current password is incorrect' 
      });
    }
    
    // Hash new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    
    // Update password
    await client.query(
      'UPDATE luno_users SET password = $1 WHERE user_id = $2',
      [hashedNewPassword, user_id]
    );
    
    res.json({ 
      success: true, 
      message: 'Password changed successfully' 
    });
    
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to change password' 
    });
  } finally {
    client.release();
  }
};

// Get user email function
export const getUserEmail = async (req, res) => {
  const client = await pool.connect();
  try {
    const user_id = req.user.user_id;
    
    const userRes = await client.query(
      'SELECT email FROM luno_users WHERE user_id = $1',
      [user_id]
    );
    
    if (userRes.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }
    
    res.json({ 
      success: true, 
      email: userRes.rows[0].email 
    });
    
  } catch (error) {
    console.error('Get user email error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to get user email' 
    });
  } finally {
    client.release();
  }
};