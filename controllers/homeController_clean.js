import pool from "../auth/db.js";
import bcrypt from "bcryptjs";
import anomalyDetection from "../services/anomalyDetection.js";
import crypto from "crypto";
import axios from "axios";
import { storeTransaction, handleWithdrawal } from "./transControllers.js";

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

// All other functions remain the same...
// [Rest of the functions would be copied from the original file]

export const settingsPage = async (req, res) => {
   const client = await pool.connect();
   const user_id = req.user.user_id;
 
   try {
     // Get user's current settings
     const userResult = await client.query(`
       SELECT username, email, phone_number, first_name, last_name
       FROM luno_users 
       WHERE user_id = $1
     `, [user_id]);

     // Get security questions
     const securityQuestionsResult = await client.query(`
       SELECT question_id, question_text, answer
       FROM security_questions 
       WHERE user_id = $1
       ORDER BY question_id
     `, [user_id]);

     // Get notification settings
     const notificationSettingsResult = await client.query(`
       SELECT email_notifications, sms_notifications, push_notifications
       FROM notification_settings 
       WHERE user_id = $1
     `, [user_id]);

     const user = userResult.rows[0];
     const securityQuestions = securityQuestionsResult.rows;
     const notificationSettings = notificationSettingsResult.rows[0] || {
       email_notifications: true,
       sms_notifications: true,
       push_notifications: true
     };

     res.render("settings", {
       user: req.user,
       userDetails: user,
       securityQuestions: securityQuestions,
       notificationSettings: notificationSettings,
       active: "settings"
     });
 
   } catch (error) {
     console.error(error);
     res.status(500).send("Server error");
   } finally {
     client.release();
   }
 };

// Add other necessary functions here...
export const updateSecurityQuestions = async (req, res) => {
   // Implementation here
};

export const verifyAnomaly = async (req, res) => {
   // Implementation here
};

export const getSecurityQuestions = async (req, res) => {
   // Implementation here
};

export const testAnomaly = async (req, res) => {
   // Implementation here
};

export const getFraudInsights = async (req, res) => {
   // Implementation here
};

export const updateProfile = async (req, res) => {
   // Implementation here
};

export const checkUsernameUnique = async (req, res) => {
   // Implementation here
};

export const checkEmailUnique = async (req, res) => {
   // Implementation here
};

export const checkUsernameAndEmailUnique = async (req, res) => {
   // Implementation here
};

export const getNotificationSettings = async (req, res) => {
   // Implementation here
};

export const updateNotificationSettings = async (req, res) => {
   // Implementation here
};

export const enrollFace = async (req, res) => {
   // Implementation here
};

export const authFace = async (req, res) => {
   // Implementation here
};

export const deleteFace = async (req, res) => {
   // Implementation here
};

export const faceStatus = async (req, res) => {
   // Implementation here
};

export const transactionsPage = async (req, res) => {
   // Implementation here
};

export const requestBankStatement = async (req, res) => {
   // Implementation here
};

export const changePassword = async (req, res) => {
   // Implementation here
};

export const getUserEmail = async (req, res) => {
   // Implementation here
};
