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
    case 'credit':
      return 'Deposit';
    case 'withdrawal':
    case 'debit':
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
     
     // Get user's account information
     const accountResult = await client.query(`
       SELECT account_number, balance FROM accounts 
       WHERE user_id = $1 AND is_active = true 
       LIMIT 1
     `, [user_id]);

     if (accountResult.rows.length === 0) {
       throw new Error('User account not found');
     }

     const account = accountResult.rows[0];
     const currentBalance = BigInt(account.balance);

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
         t.transaction_id,
         t.payment_method as payment_channel,
         t.transaction_type,
         t.amount AS history_amount,
         t.amount AS movement_amount,
         TO_CHAR(t.created_at, 'YYYY-MM-DD') as created_date,
         t.metadata
       FROM transactions t
       WHERE t.user_id = $1
       ORDER BY t.created_at DESC
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

    // Check for pending anomalies - show only one at a time
    const allPendingAnomalies = await anomalyDetection.getPendingAnomalies(user_id);
    const pendingAnomalies = allPendingAnomalies.length > 0 ? [allPendingAnomalies[0]] : [];

     const transaction  = formattedTransactions;
     // Get optional query params
     const message = req.query.message || '';
     const display = req.query.display || 'none';
     const updatedAmount = req.query.amount;

     // Convert balance from cents to rands for display
     const displayBalance = (Number(currentBalance) / 100).toFixed(2);

     console.log('Dashboard - Raw balance from DB:', currentBalance.toString());
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
       accountNumber: account.account_number || 'Not assigned'
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
  console.log('Settings page accessed by user:', req.user?.user_id);
  const client = await pool.connect();
  const user_id = req.user.user_id;

  try {
    console.log('Querying user data for user_id:', user_id);
    // Get user's current settings from normalized table
    const userResult = await client.query(`
      SELECT username, email, first_name, last_name, phone_number, user_location
      FROM luno_users 
      WHERE user_id = $1
    `, [user_id]);
    
    console.log('User query result:', userResult.rows.length, 'rows found');
    
    if (userResult.rows.length === 0) {
      throw new Error('User not found');
    }

    // Get security questions
    let securityQuestions = [];
    try {
      const securityQuestionsResult = await client.query(`
        SELECT question_id, question_text, answer_hash
        FROM security_questions 
        WHERE user_id = $1
        ORDER BY question_id
      `, [user_id]);
      securityQuestions = securityQuestionsResult.rows;
    } catch (securityError) {
      console.warn('Security questions query failed:', securityError.message);
    }

    // Get user profile if exists
    let userProfile = {};
    try {
      const profileResult = await client.query(`
        SELECT profile_picture_url, bio, preferences
        FROM user_profiles 
        WHERE user_id = $1
      `, [user_id]);
      userProfile = profileResult.rows[0] || {};
    } catch (profileError) {
      console.warn('User profile query failed:', profileError.message);
    }

    const user = userResult.rows[0] || {};
    
    // Use actual data from database
    const userDetails = {
      username: user.username || 'N/A',
      email: user.email || 'N/A',
      first_name: user.first_name || 'N/A',
      last_name: user.last_name || 'N/A',
      phone_number: user.phone_number || 'N/A',
      user_location: user.user_location || 'N/A'
    };

    console.log('Rendering settings page with data:', {
      user: !!req.user,
      userDetails: !!user,
      securityQuestions: securityQuestions.length,
      userProfile: !!userProfile
    });

    res.render("settings", {
      user: req.user,
      userDetails: userDetails,
      userProfile: userProfile,
      securityQuestions: securityQuestions,
      active: "settings"
    });

  } catch (error) {
    console.error('Settings page error:', error);
    res.status(500).send("Server error: " + error.message);
  } finally {
    client.release();
  }
};

// Add other necessary functions here...
export const updateSecurityQuestions = async (req, res) => {
  console.log('=== updateSecurityQuestions function called ===');
  console.log('User:', req.user);
  console.log('Body:', req.body);
  
  if (!req.user || !req.user.user_id) {
    console.log('No user found in request');
    return res.status(401).json({ 
      success: false, 
      message: 'User not authenticated' 
    });
  }

  const client = await pool.connect();
  const user_id = req.user.user_id;
  
  try {
    console.log('updateSecurityQuestions called with body:', req.body);
    console.log('Body keys:', Object.keys(req.body));
    
    // Try different possible data structures
    let questions = req.body.questions || req.body.securityQuestions || req.body;
    
    // If it's not an array, try to convert it
    if (!Array.isArray(questions)) {
      // Check if it's an object with question properties
      if (typeof questions === 'object' && questions !== null) {
        // Convert object to array format
        const questionArray = [];
        for (let i = 1; i <= 3; i++) {
          const questionKey = `question${i}`;
          const answerKey = `answer${i}`;
          if (questions[questionKey] && questions[answerKey]) {
            questionArray.push({
              question_text: questions[questionKey],
              answer: questions[answerKey]
            });
          }
        }
        questions = questionArray;
      }
    }
    
    console.log('Questions after processing:', questions);
    console.log('Questions type:', typeof questions);
    console.log('Is array:', Array.isArray(questions));
    
    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      console.log('Invalid questions data - questions:', questions);
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid questions data. Please provide questions in the correct format.' 
      });
    }

    await client.query('BEGIN');

    // Delete existing security questions
    await client.query(
      'DELETE FROM security_questions WHERE user_id = $1',
      [user_id]
    );

    // Insert new security questions
    for (const question of questions) {
      if (question.question_text && question.answer) {
        // Hash the answer for security
        const bcrypt = await import('bcryptjs');
        const hashedAnswer = await bcrypt.default.hash(question.answer.toLowerCase().trim(), 10);
        
        await client.query(
          `INSERT INTO security_questions (user_id, question_text, answer_hash) 
           VALUES ($1, $2, $3)`,
          [user_id, question.question_text, hashedAnswer]
        );
      }
    }

    await client.query('COMMIT');

    res.json({ 
      success: true, 
      message: 'Security questions updated successfully' 
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating security questions:', error);
    console.error('Error stack:', error.stack);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      detail: error.detail,
      hint: error.hint
    });
    res.status(500).json({ 
      success: false, 
      message: 'Error updating security settings: ' + error.message 
    });
  } finally {
    client.release();
  }
};

export const verifyAnomaly = async (req, res) => {
  const client = await pool.connect();
  const user_id = req.user.user_id;
  
  try {
    const { anomaly_id, verification_code } = req.body;
    
    if (!anomaly_id || !verification_code) {
      return res.status(400).json({ 
        success: false, 
        message: 'Anomaly ID and verification code are required' 
      });
    }

    // Verify the anomaly with the provided code
    const result = await client.query(
      `UPDATE anomaly_verifications 
       SET status = 'verified', verified_at = CURRENT_TIMESTAMP 
       WHERE anomaly_id = $1 AND user_id = $2 AND verification_code = $3`,
      [anomaly_id, user_id, verification_code]
    );

    if (result.rowCount === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid verification code or anomaly ID' 
      });
    }

    res.json({ 
      success: true, 
      message: 'Anomaly verified successfully' 
    });

  } catch (error) {
    console.error('Error verifying anomaly:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error verifying anomaly' 
    });
  } finally {
    client.release();
  }
};

export const getSecurityQuestions = async (req, res) => {
  const client = await pool.connect();
  const user_id = req.user.user_id;
  
  try {
    const result = await client.query(`
      SELECT question_id, question_text, created_at
      FROM security_questions 
      WHERE user_id = $1
      ORDER BY question_id
    `, [user_id]);

    res.json({ 
      success: true, 
      questions: result.rows 
    });

  } catch (error) {
    console.error('Error getting security questions:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error getting security questions' 
    });
  } finally {
    client.release();
  }
};

export const testAnomaly = async (req, res) => {
  const client = await pool.connect();
  const user_id = req.user.user_id;
  
  try {
    // Create a test anomaly for demonstration
    const testAnomaly = {
      user_id: user_id,
      anomaly_type: 'test',
      description: 'Test anomaly for verification',
      severity: 'low',
      status: 'pending'
    };

    const result = await client.query(`
      INSERT INTO anomaly_verifications (user_id, anomaly_type, description, severity, status, verification_code)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING anomaly_id, verification_code
    `, [
      testAnomaly.user_id,
      testAnomaly.anomaly_type,
      testAnomaly.description,
      testAnomaly.severity,
      testAnomaly.status,
      Math.random().toString(36).substr(2, 8).toUpperCase()
    ]);

    res.json({ 
      success: true, 
      message: 'Test anomaly created successfully',
      anomaly: result.rows[0]
    });

  } catch (error) {
    console.error('Error creating test anomaly:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error creating test anomaly' 
    });
  } finally {
    client.release();
  }
};

export const getFraudInsights = async (req, res) => {
  const client = await pool.connect();
  const user_id = req.user.user_id;
  
  try {
    // Get fraud insights and analytics
    const insights = await client.query(`
      SELECT 
        COUNT(*) as total_anomalies,
        COUNT(CASE WHEN status = 'verified' THEN 1 END) as verified_anomalies,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_anomalies,
        COUNT(CASE WHEN severity = 'high' THEN 1 END) as high_severity,
        COUNT(CASE WHEN severity = 'medium' THEN 1 END) as medium_severity,
        COUNT(CASE WHEN severity = 'low' THEN 1 END) as low_severity
      FROM anomaly_verifications 
      WHERE user_id = $1
    `, [user_id]);

    // Get recent suspicious activities
    const recentActivities = await client.query(`
      SELECT anomaly_type, description, severity, created_at
      FROM anomaly_verifications 
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 5
    `, [user_id]);

    res.json({ 
      success: true, 
      insights: insights.rows[0],
      recentActivities: recentActivities.rows
    });

  } catch (error) {
    console.error('Error getting fraud insights:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error getting fraud insights' 
    });
  } finally {
    client.release();
  }
};

export const updateProfile = async (req, res) => {
  const client = await pool.connect();
  const user_id = req.user.user_id;
  
  try {
    const { first_name, last_name, phone_number, user_location, username, email } = req.body;
    
    // Build dynamic update query based on provided fields
    const updates = [];
    const values = [];
    let paramCount = 1;
    
    if (first_name !== undefined) {
      updates.push(`first_name = $${paramCount++}`);
      values.push(first_name);
    }
    if (last_name !== undefined) {
      updates.push(`last_name = $${paramCount++}`);
      values.push(last_name);
    }
    if (phone_number !== undefined) {
      updates.push(`phone_number = $${paramCount++}`);
      values.push(phone_number);
    }
    if (user_location !== undefined) {
      updates.push(`user_location = $${paramCount++}`);
      values.push(user_location);
    }
    if (username !== undefined) {
      // Validate username format
      if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
        return res.status(400).json({ 
          success: false, 
          message: 'Username must be 3-30 characters and contain only letters, numbers, and underscores' 
        });
      }
      
      // Check if username is unique
      const usernameCheck = await client.query(
        'SELECT user_id FROM luno_users WHERE username = $1 AND user_id != $2',
        [username, user_id]
      );
      
      if (usernameCheck.rows.length > 0) {
        return res.status(400).json({ 
          success: false, 
          message: 'Username is already in use' 
        });
      }
      
      updates.push(`username = $${paramCount++}`);
      values.push(username);
    }
    if (email !== undefined) {
      // Validate email format
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ 
          success: false, 
          message: 'Please enter a valid email address' 
        });
      }
      
      // Check if email is unique
      const emailCheck = await client.query(
        'SELECT user_id FROM luno_users WHERE email = $1 AND user_id != $2',
        [email, user_id]
      );
      
      if (emailCheck.rows.length > 0) {
        return res.status(400).json({ 
          success: false, 
          message: 'Email is already in use' 
        });
      }
      
      updates.push(`email = $${paramCount++}`);
      values.push(email);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'No valid fields to update' 
      });
    }
    
    // Add updated_at and user_id
    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(user_id);
    
    // Update user information
    const query = `UPDATE luno_users SET ${updates.join(', ')} WHERE user_id = $${paramCount}`;
    await client.query(query, values);

    res.json({ 
      success: true, 
      message: 'Profile updated successfully' 
    });

  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error updating profile' 
    });
  } finally {
    client.release();
  }
};

export const checkUsernameUnique = async (req, res) => {
  const client = await pool.connect();
  const user_id = req.user.user_id;
  
  try {
    // Get username from query parameters (GET request)
    const { username } = req.query;
    
    console.log('🔍 Username validation request:', { username, user_id });
    
    if (!username) {
      return res.status(400).json({ 
        success: false, 
        message: 'Username is required' 
      });
    }

    // Trim whitespace and convert to lowercase for comparison
    const trimmedUsername = username.trim();
    
    // Validate username format
    if (!/^[a-zA-Z0-9_]{3,30}$/.test(trimmedUsername)) {
      return res.json({ 
        unique: false, 
        message: 'Username must be 3-30 characters and contain only letters, numbers, and underscores' 
      });
    }

    // Check for exact match (case-sensitive)
    const exactResult = await client.query(
      'SELECT user_id, username FROM luno_users WHERE username = $1 AND user_id != $2',
      [trimmedUsername, user_id]
    );

    // Also check for case-insensitive match
    const caseInsensitiveResult = await client.query(
      'SELECT user_id, username FROM luno_users WHERE LOWER(username) = LOWER($1) AND user_id != $2',
      [trimmedUsername, user_id]
    );

    console.log('🔍 Database results:', {
      exactMatch: exactResult.rows.length,
      caseInsensitiveMatch: caseInsensitiveResult.rows.length,
      exactRows: exactResult.rows,
      caseInsensitiveRows: caseInsensitiveResult.rows
    });

    const isUnique = exactResult.rows.length === 0;
    
    res.json({ 
      success: true, 
      unique: isUnique,
      message: isUnique ? 'Username is available' : 'Username is already in use',
      debug: {
        requestedUsername: trimmedUsername,
        exactMatches: exactResult.rows.length,
        caseInsensitiveMatches: caseInsensitiveResult.rows.length
      }
    });

  } catch (error) {
    console.error('Error checking username uniqueness:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error checking username uniqueness'
    });
  } finally {
    client.release();
  }
};

export const checkEmailUnique = async (req, res) => {
  const client = await pool.connect();
  const user_id = req.user.user_id;
  
  try {
    // Get email from query parameters (GET request)
    const { email } = req.query;
    
    if (!email) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email is required' 
      });
    }

    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.json({ 
        unique: false, 
        message: 'Please enter a valid email address' 
      });
    }

    const result = await client.query(
      'SELECT user_id FROM luno_users WHERE email = $1 AND user_id != $2',
      [email, user_id]
    );

    const isUnique = result.rows.length === 0;
    
    res.json({ 
      success: true, 
      unique: isUnique,
      message: isUnique ? 'Email is available' : 'Email is already in use'
    });

  } catch (error) {
    console.error('Error checking email uniqueness:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error checking email uniqueness' 
    });
  } finally {
    client.release();
  }
};

export const checkUsernameAndEmailUnique = async (req, res) => {
  const client = await pool.connect();
  const user_id = req.user.user_id;
  
  try {
    // Get username and email from query parameters (GET request)
    const { username, email } = req.query;
    
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
    
    res.json({ 
      success: true, 
      usernameUnique: results.username.unique,
      emailUnique: results.email.unique,
      usernameMessage: results.username.message,
      emailMessage: results.email.message
    });

  } catch (error) {
    console.error('Error checking username and email uniqueness:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error checking username and email uniqueness' 
    });
  } finally {
    client.release();
  }
};

export const getNotificationSettings = async (req, res) => {
  const client = await pool.connect();
  const user_id = req.user.user_id;
  
  try {
    console.log('🔔 Getting notification settings for user:', user_id);
    
    const result = await client.query(`
      SELECT push_enabled, inapp_enabled, email_enabled, sms_enabled, created_at, updated_at
      FROM notification_settings 
      WHERE user_id = $1
    `, [user_id]);

    if (result.rows.length === 0) {
      console.log('📝 Creating default notification settings for user:', user_id);
      // Create default settings if none exist
      await client.query(`
        INSERT INTO notification_settings (user_id, push_enabled, inapp_enabled, email_enabled, sms_enabled)
        VALUES ($1, true, true, true, false)
      `, [user_id]);

      res.json({ 
        success: true, 
        push_enabled: true,
        inapp_enabled: true,
        email_enabled: true,
        sms_enabled: false,
        message: 'Default settings created'
      });
    } else {
      console.log('✅ Found existing notification settings:', result.rows[0]);
      res.json({ 
        success: true, 
        ...result.rows[0]
      });
    }

  } catch (error) {
    console.error('❌ Error getting notification settings:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error getting notification settings' 
    });
  } finally {
    client.release();
  }
};

export const updateNotificationSettings = async (req, res) => {
  const client = await pool.connect();
  const user_id = req.user.user_id;
  
  try {
    const { push_enabled, inapp_enabled, email_enabled, sms_enabled } = req.body;
    
    console.log('🔔 Updating notification settings for user:', user_id, {
      push_enabled, inapp_enabled, email_enabled, sms_enabled
    });
    
    // Validate input
    if (push_enabled === undefined || inapp_enabled === undefined) {
      return res.status(400).json({
        success: false,
        message: 'push_enabled and inapp_enabled are required'
      });
    }
    
    // Convert string values to boolean if needed
    const pushEnabled = Boolean(push_enabled === 'true' || push_enabled === true);
    const inappEnabled = Boolean(inapp_enabled === 'true' || inapp_enabled === true);
    const emailEnabled = Boolean(email_enabled === 'true' || email_enabled === true);
    const smsEnabled = Boolean(sms_enabled === 'true' || sms_enabled === true);
    
    await client.query(`
      INSERT INTO notification_settings (user_id, push_enabled, inapp_enabled, email_enabled, sms_enabled)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (user_id) 
      DO UPDATE SET 
        push_enabled = EXCLUDED.push_enabled,
        inapp_enabled = EXCLUDED.inapp_enabled,
        email_enabled = EXCLUDED.email_enabled,
        sms_enabled = EXCLUDED.sms_enabled,
        updated_at = CURRENT_TIMESTAMP
    `, [user_id, pushEnabled, inappEnabled, emailEnabled, smsEnabled]);

    console.log('✅ Notification settings updated successfully');
    res.json({ 
      success: true, 
      message: 'Notification settings updated successfully',
      settings: {
        push_enabled: pushEnabled,
        inapp_enabled: inappEnabled,
        email_enabled: emailEnabled,
        sms_enabled: smsEnabled
      }
    });

  } catch (error) {
    console.error('❌ Error updating notification settings:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error updating notification settings' 
    });
  } finally {
    client.release();
  }
};

export const enrollFace = async (req, res) => {
  const client = await pool.connect();
  const user_id = req.user.user_id;
  
  try {
    const { images } = req.body;
    
    if (!images || !Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Images are required for face enrollment' 
      });
    }

    // Call face microservice for enrollment
    const faceServiceUrl = process.env.FACE_MICROSERVICE || 'http://localhost:5001';
    
    const response = await axios.post(`${faceServiceUrl}/enroll`, {
      user_id: user_id,
      images: images
    });

    if (response.data.success) {
      // Store face enrollment data in database
      await client.query(`
        INSERT INTO face_enrollments (user_id, face_id, enrollment_data, created_at)
        VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
        ON CONFLICT (user_id) 
        DO UPDATE SET 
          face_id = EXCLUDED.face_id,
          enrollment_data = EXCLUDED.enrollment_data,
          updated_at = CURRENT_TIMESTAMP
      `, [user_id, response.data.face_id, JSON.stringify(response.data.enrollment_data)]);

      res.json({ 
        success: true, 
        message: 'Face enrollment successful',
        face_id: response.data.face_id
      });
    } else {
      res.status(400).json({ 
        success: false, 
        message: response.data.message || 'Face enrollment failed' 
      });
    }

  } catch (error) {
    console.error('Error enrolling face:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error enrolling face. Please try again.' 
    });
  } finally {
    client.release();
  }
};

export const authFace = async (req, res) => {
  const client = await pool.connect();
  const user_id = req.user.user_id;
  
  try {
    const { image } = req.body;
    
    if (!image) {
      return res.status(400).json({ 
        success: false, 
        message: 'Image is required for face authentication' 
      });
    }

    // Call face microservice for authentication
    const faceServiceUrl = process.env.FACE_MICROSERVICE || 'http://localhost:5001';
    
    const response = await axios.post(`${faceServiceUrl}/authenticate`, {
      user_id: user_id,
      image: image
    });

    res.json({ 
      success: response.data.success, 
      message: response.data.message,
      confidence: response.data.confidence
    });

  } catch (error) {
    console.error('Error authenticating face:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error authenticating face. Please try again.' 
    });
  } finally {
    client.release();
  }
};

export const deleteFace = async (req, res) => {
  const client = await pool.connect();
  const user_id = req.user.user_id;
  
  try {
    // Delete face enrollment data from database
    await client.query(
      'DELETE FROM face_enrollments WHERE user_id = $1',
      [user_id]
    );

    // Call face microservice to delete face data
    const faceServiceUrl = process.env.FACE_MICROSERVICE || 'http://localhost:5001';
    
    try {
      await axios.delete(`${faceServiceUrl}/delete`, {
        data: { user_id: user_id }
      });
    } catch (microserviceError) {
      console.warn('Face microservice delete failed:', microserviceError.message);
      // Continue even if microservice fails
    }

    res.json({ 
      success: true, 
      message: 'Face data deleted successfully' 
    });

  } catch (error) {
    console.error('Error deleting face data:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error deleting face data' 
    });
  } finally {
    client.release();
  }
};

export const faceStatus = async (req, res) => {
  const client = await pool.connect();
  const user_id = req.user.user_id;
  
  try {
    const result = await client.query(`
      SELECT face_id, created_at, updated_at
      FROM face_enrollments 
      WHERE user_id = $1
    `, [user_id]);

    if (result.rows.length > 0) {
      res.json({ 
        success: true, 
        face_auth_enabled: true,
        face_id: result.rows[0].face_id,
        enrolled_at: result.rows[0].created_at,
        last_updated: result.rows[0].updated_at
      });
    } else {
      res.json({ 
        success: true, 
        face_auth_enabled: false,
        message: 'Face authentication not enrolled'
      });
    }

  } catch (error) {
    console.error('Error getting face status:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error getting face status' 
    });
  } finally {
    client.release();
  }
};

export const transactionsPage = async (req, res) => {
  const client = await pool.connect();
  const user_id = req.user.user_id;

  try {
    // Get user's account first
    const accountResult = await client.query(`
      SELECT account_id, balance FROM accounts 
      WHERE user_id = $1 AND is_active = true 
      LIMIT 1
    `, [user_id]);

    if (accountResult.rows.length === 0) {
      return res.render("transactions", {
        user: req.user,
        data: [], // Changed from 'transactions' to 'data' to match view expectations
        balance: "0.00",
        message: "No account found. Please contact support.",
        active: "transactions"
      });
    }

    const account = accountResult.rows[0];

    // Get user's transaction history with proper joins
    const transactionResult = await client.query(`
      SELECT 
        t.transaction_id,
        t.reference,
        t.amount,
        t.transaction_type,
        t.status,
        t.payment_method,
        t.metadata,
        t.created_at
      FROM transactions t
      WHERE t.user_id = $1
      ORDER BY t.created_at DESC
      LIMIT 50
    `, [user_id]);

    // Format transactions for display
    let transactions = [];
    try {
      transactions = transactionResult.rows.map(transaction => {
        // Parse metadata if it's a string
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
          amount: (Number(transaction.amount) / 100).toFixed(2), // Convert from cents to rands
          created_date: new Date(transaction.created_at).toLocaleDateString('en-ZA'), // For view compatibility
          formatted_date: new Date(transaction.created_at).toLocaleDateString('en-ZA'),
          formatted_time: new Date(transaction.created_at).toLocaleTimeString('en-ZA', { 
            hour: '2-digit', 
            minute: '2-digit' 
          }),
          payment_channel: transaction.payment_method, // Map payment_method to payment_channel for view compatibility
          formatted_description: getTransactionDescription(transaction, metadata), // Add formatted description
          metadata: metadata // Ensure metadata is properly parsed
        };
      });
    } catch (e) {
      console.error('Error formatting transactions:', e);
      transactions = [];
    }

    // Get current balance from account
    const displayBalance = (Number(account.balance) / 100).toFixed(2);

    // Debug logging
    console.log('🔍 TRANSACTIONS PAGE - UPDATED CODE RUNNING!');
    console.log('Transactions page render data:');
    console.log('- user:', req.user ? 'present' : 'missing');
    console.log('- transactions count:', transactions.length);
    console.log('- balance:', displayBalance);
    console.log('- data type:', typeof transactions);
    console.log('🔍 TRANSACTIONS VARIABLE CHECK:', transactions ? 'DEFINED' : 'UNDEFINED');

    res.render("transactions", {
      user: req.user,
      data: transactions, // Changed from 'transactions' to 'data' to match view expectations
      balance: displayBalance,
      message: transactions.length === 0 ? "No transactions found" : null,
      active: "transactions"
    });

  } catch (error) {
    console.error('Transactions page error:', error);
    res.status(500).send("Server error: " + error.message);
  } finally {
    client.release();
  }
};

export const requestBankStatement = async (req, res) => {
  const client = await pool.connect();
  const user_id = req.user.user_id;
  
  try {
    const { start_date, end_date, format = 'pdf' } = req.body;
    
    if (!start_date || !end_date) {
      return res.status(400).json({ 
        success: false, 
        message: 'Start date and end date are required' 
      });
    }

    // Get transactions for the specified date range
    const transactions = await client.query(`
      SELECT 
        transaction_id,
        amount,
        transaction_type,
        status,
        payment_method,
        metadata,
        created_at
      FROM transactions 
      WHERE user_id = $1 
        AND created_at >= $2 
        AND created_at <= $3
      ORDER BY created_at DESC
    `, [user_id, start_date, end_date]);

    // Generate statement (simplified - in production, use a proper PDF library)
    const statementData = {
      user_id: user_id,
      start_date: start_date,
      end_date: end_date,
      transactions: transactions.rows,
      generated_at: new Date().toISOString()
    };

    res.json({ 
      success: true, 
      message: 'Bank statement generated successfully',
      statement: statementData
    });

  } catch (error) {
    console.error('Error generating bank statement:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error generating bank statement' 
    });
  } finally {
    client.release();
  }
};

export const changePassword = async (req, res) => {
  const client = await pool.connect();
  const user_id = req.user.user_id;
  
  try {
    const { currentPassword, newPassword } = req.body;
    
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
    const userResult = await client.query(
      'SELECT user_password FROM luno_users WHERE user_id = $1',
      [user_id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, userResult.rows[0].user_password);
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
      'UPDATE luno_users SET user_password = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2',
      [hashedNewPassword, user_id]
    );

    res.json({ 
      success: true, 
      message: 'Password changed successfully' 
    });

  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error changing password' 
    });
  } finally {
    client.release();
  }
};

export const getUserEmail = async (req, res) => {
  const client = await pool.connect();
  const user_id = req.user.user_id;
  
  try {
    const result = await client.query(
      'SELECT email FROM luno_users WHERE user_id = $1',
      [user_id]
    );

    if (result.rows.length > 0) {
      res.json({ 
        success: true, 
        email: result.rows[0].email
      });
    } else {
      res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

  } catch (error) {
    console.error('Error getting user email:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error getting user email' 
    });
  } finally {
    client.release();
  }
};
