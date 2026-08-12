import axios from "axios";
import pool from "../auth/db.js";
import dotenv from "dotenv";
import nodemailer from 'nodemailer';
import gpsService from "../services/gpsService.js";
import BehavioralBiometrics from "../models/behavioralBiometrics.js";
import anomalyDetection from "../services/anomalyDetection.js";
import NotificationService from "../services/notificationService.js";
import {
    randsToCents,
    centsToRands,
    formatRands,
    validateAmount,
    checkDailyWithdrawalLimit
} from "../utils/currencyUtils.js";
// dailyLimitsModel is now handled by middleware

/**
 * Currency Handling Pattern:
 * - User input: Amounts in Rands (ZAR) with decimal places
 * - Database storage: Amounts in cents (BIGINT) for precision
 * - Calculations: All done in cents to avoid floating point errors
 * - Display/Email: Convert back to Rands by dividing by 100 and formatting to 2 decimal places
 * 
 * Example: 
 * - User enters: 123.45 (Rands)
 * - Stored as: 12345 (cents)
 * - Displayed as: R 123.45
 */

const biometrics = new BehavioralBiometrics();

dotenv.config();
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// deposit logic
export const storeTransaction = async (req, res) => {
    const { reference, amount, anomalyVerified, biometricPattern } = req.body;
    const user_id = req.user?.user_id || req.user?.id;
    
    // Check if anomaly verification is required but not provided
    if (req.anomalies && req.anomalies.length > 0 && !anomalyVerified) {
        return res.status(403).json({
            success: false,
            message: 'Anomaly verification required before transaction can proceed.'
        });
    }

    if (!user_id) {
        return res.status(401).json({ success: false, message: 'User not authenticated.' });
    }

    // Check if user has security questions set up
    const hasSecurityQuestions = await anomalyDetection.hasSecurityQuestions(user_id);
    if (!hasSecurityQuestions) {
        return res.status(403).json({ 
            success: false, 
            message: 'Security questions not set up. Please set up security questions in settings first before making transactions.',
            requiresSetup: true
        });
    }
  
    try {
      // Start database transaction with proper locking
      const client = await pool.connect();
      
      try {
        await client.query('BEGIN');
        
        // Lock the user's transaction_movements table to prevent race conditions
        await client.query(`
          SELECT balance_after FROM transaction_movements 
          WHERE user_id = $1
          ORDER BY created_at DESC
          LIMIT 1
          FOR UPDATE
        `, [user_id]);

        // 1. Verify with Paystack
        const response = await axios.get(`https://api.paystack.co/transaction/verify/${reference}`, {
          headers: {
            Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          },
        });
    
        const payment = response.data.data;
        
        // Define mapping functions early
        const mapPaystackStatus = (paystackStatus) => {
          switch (paystackStatus) {
            case 'success':
              return 'completed';
            case 'failed':
              return 'failed';
            case 'pending':
              return 'pending';
            case 'cancelled':
              return 'cancelled';
            default:
              return 'completed';
          }
        };

        const mapPaystackPaymentMethod = (paystackChannel) => {
          switch (paystackChannel) {
            case 'card':
              return 'card';
            case 'bank':
            case 'bank_transfer':
              return 'bank_transfer';
            case 'ussd':
              return 'bank_transfer';
            case 'qr':
              return 'bank_transfer';
            default:
              return 'card';
          }
        };
        
        console.log('Paystack payment data:', {
          status: payment.status,
          amount: payment.amount,
          expectedAmount: amount * 100,
          channel: payment.channel,
          amountInRands: (payment.amount / 100).toFixed(2)
        });
        
        console.log('Status mapping test:');
        console.log('Raw Paystack status:', payment.status);
        console.log('Mapped status:', mapPaystackStatus(payment.status));
    
        if (payment.status === 'success' && payment.amount === amount * 100) {
          // 2. Get the user's email from database
          const userResult = await client.query(
            'SELECT email FROM luno_users WHERE user_id = $1',
            [user_id]
          );
    
          if (userResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, message: 'User not found' });
          }
    
          const userEmail = userResult.rows[0].email;

        // Check if user has behavioral biometrics setup
        const userPatterns = await biometrics.getUserPatterns(user_id);
        const activePatterns = userPatterns.filter(pattern => pattern.active);

        if (activePatterns.length > 0) {
            // User has biometrics setup, require verification
            if (!biometricPattern || !biometricPattern.patternType || !biometricPattern.patternData) {
                await client.query('ROLLBACK');
                return res.status(403).json({
                    success: false,
                    message: 'Biometric pattern verification required for this transaction.',
                    requiresBiometric: true,
                    availablePatterns: activePatterns.map(p => p.type)
                });
            }

            // Verify the provided pattern
            const verificationResult = await biometrics.verifyPattern(
                user_id, 
                biometricPattern.patternType, 
                biometricPattern.patternData
            );

            if (!verificationResult.verified) {
                await client.query('ROLLBACK');
                return res.status(403).json({
                    success: false,
                    message: 'Biometric pattern verification failed. Please try again.',
                    requiresBiometric: true,
                    availablePatterns: activePatterns.map(p => p.type)
                });
            }

            console.log(`✅ Biometric verification successful for user ${user_id} - Pattern: ${biometricPattern.patternType}, Similarity: ${(verificationResult.similarity * 100).toFixed(1)}%`);
        }
  
        // Daily limit check is now handled by middleware before this function is called
        console.log('✅ Daily limits already checked by middleware');

        // Get transaction location (with error handling)
        let transactionLocation = null;
        try {
            const clientIP = gpsService.getClientIP(req);
            transactionLocation = await gpsService.getLocationFromIP(clientIP);
        } catch (gpsError) {
            console.log('GPS service error, using default location:', gpsError.message);
            transactionLocation = {
                latitude: -26.2041,
                longitude: 28.0473,
                city: 'Johannesburg',
                country: 'South Africa',
                country_code: 'ZA',
                region: 'Gauteng',
                timezone: 'Africa/Johannesburg',
                ip_address: '127.0.0.1',
                timestamp: new Date().toISOString(),
                is_default: true
            };
        }

        // 3. Get user's account_id first
        // Get user's account ID (create if doesn't exist)
        let accountRes = await client.query(`
          SELECT account_id FROM accounts 
          WHERE user_id = $1 AND is_active = true 
          LIMIT 1
        `, [user_id]);
        
        // If no account exists, create one
        if (accountRes.rows.length === 0) {
          const newAccountRes = await client.query(`
            SELECT create_user_account($1) as account_id
          `, [user_id]);
          accountRes = newAccountRes;
        }
        
        if (accountRes.rows.length === 0) {
          throw new Error('User account not found');
        }
        
        const account_id = accountRes.rows[0].account_id;

        // 4. Get deposit category ID
        const categoryRes = await client.query(`
          SELECT category_id FROM transaction_categories
          WHERE category_name = 'deposit' AND category_type = 'income'
          LIMIT 1
        `);
        
        if (categoryRes.rows.length === 0) {
          throw new Error('Deposit category not found');
        }
        
        const category_id = categoryRes.rows[0].category_id;

        // 5. Mapping functions already defined above

        // 6. Insert into transactions table
        const transactionData = {
          reference,
          user_id,
          account_id,
          category_id,
          amount: payment.amount, // store in cents
          transaction_type: 'credit',
          status: mapPaystackStatus(payment.status),
          payment_method: mapPaystackPaymentMethod(payment.channel),
          metadata: JSON.stringify({...payment.metadata, transaction_location: transactionLocation})
        };
        
        console.log('Inserting transaction with data:', {
          ...transactionData,
          amountInRands: (transactionData.amount / 100).toFixed(2),
          metadata: 'JSON data'
        });
        
        const txResult = await client.query(`
          INSERT INTO transactions 
          (reference, user_id, account_id, category_id, amount, transaction_type, status, payment_method, metadata)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING transaction_id
        `, [
          transactionData.reference,
          transactionData.user_id,
          transactionData.account_id,
          transactionData.category_id,
          transactionData.amount,
          transactionData.transaction_type,
          transactionData.status,
          transactionData.payment_method,
          transactionData.metadata
        ]);
  
        const transaction_id = txResult.rows[0].transaction_id;
  
        // 6. Get latest balance from accounts table
        const balanceRes = await client.query(`
          SELECT balance FROM accounts 
          WHERE user_id = $1 AND is_active = true
          LIMIT 1
        `, [user_id]);
  
        const prevBalance = balanceRes.rowCount > 0 ? BigInt(balanceRes.rows[0].balance) : BigInt(0);
        const amountToAdd = BigInt(payment.amount); // Paystack amount is already in kobo (cents)
        const newBalance = prevBalance + amountToAdd;
  
        // 5. Update accounts table balance
        await client.query(`
          UPDATE accounts 
          SET balance = $1 
          WHERE user_id = $2 AND is_active = true
        `, [newBalance.toString(), user_id]);

        // 7. Insert into transaction_movements
        const movementData = {
          transaction_id,
          user_id,
          account_id,
          movement_type: 'credit',
          amount: payment.amount.toString(), // Paystack amount is already in kobo (cents)
          balance_before: prevBalance.toString(),
          balance_after: newBalance.toString(),
          description: 'Deposit'
        };
        
        console.log('Inserting transaction movement with data:', {
          ...movementData,
          amountInRands: (parseInt(movementData.amount) / 100).toFixed(2),
          balanceBeforeRands: (parseInt(movementData.balance_before) / 100).toFixed(2),
          balanceAfterRands: (parseInt(movementData.balance_after) / 100).toFixed(2)
        });
        
        await client.query(`
          INSERT INTO transaction_movements
          (transaction_id, user_id, account_id, movement_type, amount, balance_before, balance_after, description)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
          movementData.transaction_id,
          movementData.user_id,
          movementData.account_id,
          movementData.movement_type,
          movementData.amount,
          movementData.balance_before,
          movementData.balance_after,
          movementData.description
        ]);

        // Commit the transaction
        await client.query('COMMIT');
        
        // Send push notification for successful deposit
        try {
          await NotificationService.sendTransactionNotification(user_id, {
            transaction_id,
            transaction_type: 'credit',
            amount: payment.amount,
            history_amount: payment.amount,
            description: 'Deposit',
            payment_channel: mapPaystackPaymentMethod(payment.channel),
            created_date: new Date().toISOString()
          });
          console.log('✅ Push notification sent for deposit');
        } catch (notificationError) {
          console.error('Error sending deposit notification:', notificationError);
          // Don't fail the transaction for notification errors
        }
        
        // Set success flag for middleware to update daily usage
        res.locals.transactionSuccess = true;
        
        return res.json({ 
          success: true,
          message: 'Deposit successful.',
          amount: (Number(newBalance) / 100).toFixed(2) // Convert back to rands for display
        });

      } else {
        await client.query('ROLLBACK');
        return res.json({
          success: false,
          message: 'Verification failed or amount mismatch.'
        });        
      }

    } catch (error) {
      // Rollback transaction on error
      await client.query('ROLLBACK');
      console.error('Transaction error:', error.message);
      console.error('Error details:', error);
      
      // Provide more specific error messages
      let errorMessage = 'Server error during verification.';
      if (error.message.includes('category not found')) {
        errorMessage = 'Transaction category not found. Please contact support.';
      } else if (error.message.includes('account not found')) {
        errorMessage = 'User account not found. Please contact support.';
      } else if (error.message.includes('constraint')) {
        errorMessage = 'Database constraint error. Please try again.';
      } else if (error.message.includes('foreign key')) {
        errorMessage = 'Database reference error. Please contact support.';
      }
      
      return res.status(500).json(
        { 
          success: false, 
          message: errorMessage,
          error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
      // Always release the client
      client.release();
    }
  } catch (error) {
    console.error('Paystack verification error:', error.response?.data || error.message);
    console.error('Outer error details:', error);
    
    let errorMessage = 'Server error during verification.';
    if (error.response?.data?.message) {
      errorMessage = `Paystack error: ${error.response.data.message}`;
    } else if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
      errorMessage = 'Unable to connect to payment service. Please try again.';
    }
    
    return res.status(500).json(
      { 
        success: false, 
        message: errorMessage,
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
  }
};

// withdrawal logic
export const handleWithdrawal = async (req, res) => {
  const { amount, anomalyVerified, biometricPattern } = req.body;
  const user_id = req.user?.user_id || req.user?.id;
  
  // Check if anomaly verification is required but not provided
  if (req.anomalies && req.anomalies.length > 0 && !anomalyVerified) {
      return res.status(403).json({
          success: false,
          message: 'Anomaly verification required before transaction can proceed.'
      });
  }

  if (!user_id) {
      return res.status(401).json({ success: false, message: 'User not authenticated.' });
  }

  // Check if user has security questions set up
  const hasSecurityQuestions = await anomalyDetection.hasSecurityQuestions(user_id);
  if (!hasSecurityQuestions) {
      return res.status(403).json({ 
          success: false, 
          message: 'Security questions not set up. Please set up security questions in settings first before making transactions.',
          requiresSetup: true
      });
  }

  try {
    // Start database transaction with proper locking
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Lock the user's transaction_movements table to prevent race conditions
      await client.query(`
        SELECT balance_after FROM transaction_movements 
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 1
        FOR UPDATE
      `, [user_id]);

      // Get user's email from database for email confirmation
      const userResult = await client.query(
        'SELECT email FROM luno_users WHERE user_id = $1',
        [user_id]
      );

      if (userResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      const userEmail = userResult.rows[0].email;

      // Check if user has behavioral biometrics setup
      const userPatterns = await biometrics.getUserPatterns(user_id);
      const activePatterns = userPatterns.filter(pattern => pattern.active);

      if (activePatterns.length > 0) {
          // User has biometrics setup, require verification
          if (!biometricPattern || !biometricPattern.patternType || !biometricPattern.patternData) {
              await client.query('ROLLBACK');
              return res.status(403).json({
                  success: false,
                  message: 'Biometric pattern verification required for this transaction.',
                  requiresBiometric: true,
                  availablePatterns: activePatterns.map(p => p.type)
              });
          }

          // Verify the provided pattern
          const verificationResult = await biometrics.verifyPattern(
              user_id, 
              biometricPattern.patternType, 
              biometricPattern.patternData
          );

          if (!verificationResult.verified) {
              await client.query('ROLLBACK');
              return res.status(403).json({
                  success: false,
                  message: 'Biometric pattern verification failed. Please try again.',
                  requiresBiometric: true,
                  availablePatterns: activePatterns.map(p => p.type)
              });
          }

          console.log(`✅ Biometric verification successful for user ${user_id} - Pattern: ${biometricPattern.patternType}, Similarity: ${(verificationResult.similarity * 100).toFixed(1)}%`);
      }

      // Validate and convert amount using utility functions
      const validation = validateAmount(amount);
      if (!validation.isValid) {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          success: false, 
          message: validation.message 
        });
      }

      // Convert rands to cents using utility function
      const withdrawAmountCents = randsToCents(validation.value);

      // Daily limit check is now handled by middleware before this function is called
      console.log('✅ Daily limits already checked by middleware');

      // 2. Get current balance from accounts table - balance is stored in cents
      const balanceRes = await client.query(`
        SELECT balance FROM accounts 
        WHERE user_id = $1 AND is_active = true
        LIMIT 1
      `, [user_id]);

      const currentBalance = balanceRes.rowCount > 0 ? BigInt(balanceRes.rows[0].balance) : BigInt(0);

      // Check if user has sufficient balance (both amounts in cents)
      if (BigInt(withdrawAmountCents) > currentBalance) {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          success: false, 
          message: `Insufficient balance. Your current balance is ${formatRands(currentBalance)}.` 
        });
      }

      // Calculate new balance after withdrawal (in cents)
      const newBalance = currentBalance - BigInt(withdrawAmountCents);

      // Get transaction location (with error handling)
      let transactionLocation = null;
      try {
          const clientIP = gpsService.getClientIP(req);
          transactionLocation = await gpsService.getLocationFromIP(clientIP);
      } catch (gpsError) {
          console.log('GPS service error, using default location:', gpsError.message);
          transactionLocation = {
              latitude: -26.2041,
              longitude: 28.0473,
              city: 'Johannesburg',
              country: 'South Africa',
              country_code: 'ZA',
              region: 'Gauteng',
              timezone: 'Africa/Johannesburg',
              ip_address: '127.0.0.1',
              timestamp: new Date().toISOString(),
              is_default: true
          };
      }

      // 3. Get user's account_id first (create if doesn't exist)
      let accountRes = await client.query(`
        SELECT account_id FROM accounts 
        WHERE user_id = $1 AND is_active = true
        LIMIT 1
      `, [user_id]);
      
      // If no account exists, create one
      if (accountRes.rows.length === 0) {
        const newAccountRes = await client.query(`
          SELECT create_user_account($1) as account_id
        `, [user_id]);
        accountRes = newAccountRes;
      }
      
      if (accountRes.rows.length === 0) {
        throw new Error('User account not found');
      }
      
      const account_id = accountRes.rows[0].account_id;

      // 4. Get withdrawal category ID
      const categoryRes = await client.query(`
        SELECT category_id FROM transaction_categories
        WHERE category_name = 'withdrawal' AND category_type = 'expense'
        LIMIT 1
      `);
      
      if (categoryRes.rows.length === 0) {
        throw new Error('Withdrawal category not found');
      }
      
      const category_id = categoryRes.rows[0].category_id;

      // 5. Insert into transactions table
      const withdrawalData = {
        reference: 'WDR-' + Math.floor((Math.random() * 1000000000) + 1),
        user_id,
        account_id,
        category_id,
        amount: withdrawAmountCents,
        transaction_type: 'debit',
        status: 'completed',
        payment_method: 'card',
        metadata: JSON.stringify({transaction_location: transactionLocation})
      };
      
      console.log('Inserting withdrawal transaction with data:', {
        ...withdrawalData,
        amountInRands: (withdrawalData.amount / 100).toFixed(2),
        metadata: 'JSON data'
      });
      
      const txResult = await client.query(`
        INSERT INTO transactions 
        (reference, user_id, account_id, category_id, amount, transaction_type, status, payment_method, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING transaction_id
      `, [
        withdrawalData.reference,
        withdrawalData.user_id,
        withdrawalData.account_id,
        withdrawalData.category_id,
        withdrawalData.amount,
        withdrawalData.transaction_type,
        withdrawalData.status,
        withdrawalData.payment_method,
        withdrawalData.metadata
      ]);

      const transaction_id = txResult.rows[0].transaction_id;

      // 6. Update accounts table balance
      await client.query(`
        UPDATE accounts 
        SET balance = $1 
        WHERE user_id = $2 AND is_active = true
      `, [newBalance.toString(), user_id]);

      // 5. Insert into transaction_movements
      const movementData = {
        transaction_id,
        user_id,
        account_id,
        movement_type: 'debit',
        amount: withdrawAmountCents.toString(),
        balance_before: currentBalance.toString(),
        balance_after: newBalance.toString(),
        description: 'Withdrawal'
      };
      
      console.log('Inserting withdrawal movement with data:', {
        ...movementData,
        amountInRands: (parseInt(movementData.amount) / 100).toFixed(2),
        balanceBeforeRands: (parseInt(movementData.balance_before) / 100).toFixed(2),
        balanceAfterRands: (parseInt(movementData.balance_after) / 100).toFixed(2)
      });
      
      await client.query(`
        INSERT INTO transaction_movements
        (transaction_id, user_id, account_id, movement_type, amount, balance_before, balance_after, description)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        movementData.transaction_id,
        movementData.user_id,
        movementData.account_id,
        movementData.movement_type,
        movementData.amount,
        movementData.balance_before,
        movementData.balance_after,
        movementData.description
      ]);

      // Commit the transaction
      await client.query('COMMIT');

      // Send push notification for successful withdrawal
      try {
        await NotificationService.sendTransactionNotification(user_id, {
          transaction_id,
          transaction_type: 'debit',
          amount: withdrawAmountCents,
          history_amount: withdrawAmountCents,
          description: 'Withdrawal',
          payment_channel: 'card',
          created_date: new Date().toISOString()
        });
        console.log('✅ Push notification sent for withdrawal');
      } catch (notificationError) {
        console.error('Error sending withdrawal notification:', notificationError);
        // Don't fail the transaction for notification errors
      }

      // Set success flag for middleware to update daily usage
      res.locals.transactionSuccess = true;

      // 5. Email confirmation (only if email service is configured)
      if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
        try {
          const withdrawAmountRands = centsToRands(withdrawAmountCents);
          const newBalanceRands = centsToRands(newBalance);
          const formattedDate = new Date().toLocaleString('en-ZA', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Africa/Johannesburg'
          });
          
          await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: userEmail,
            subject: 'Withdrawal Successful - Luno Wallet',
            html: `
              <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
                <div style="background: white; border-radius: 8px; padding: 30px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                  <div style="text-align: center; margin-bottom: 25px;">
                    <h2 style="color: #2563eb; margin: 0; font-size: 24px;">💰 Withdrawal Confirmation</h2>
                    <p style="color: #6b7280; margin-top: 5px;">Luno Wallet Transaction Receipt</p>
                  </div>
                  
                  <div style="background: #f0f9ff; padding: 20px; border-radius: 6px; margin-bottom: 25px;">
                    <h3 style="color: #0369a1; margin: 0 0 15px 0; font-size: 18px;">Transaction Details</h3>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                      <div style="font-weight: 500; color: #374151;">Amount Withdrawn:</div>
                      <div style="color: #dc2626; font-weight: bold; font-size: 18px;">R ${withdrawAmountRands}</div>
                      
                      <div style="font-weight: 500; color: #374151;">New Balance:</div>
                      <div style="color: #059669; font-weight: bold; font-size: 18px;">R ${newBalanceRands}</div>
                      
                      <div style="font-weight: 500; color: #374151;">Transaction ID:</div>
                      <div style="color: #4b5563; font-family: monospace;">${transaction_id}</div>
                      
                      <div style="font-weight: 500; color: #374151;">Date & Time:</div>
                      <div style="color: #4b5563;">${formattedDate}</div>
                    </div>
                  </div>
                  
                  <div style="background: #f1f5f9; padding: 15px; border-radius: 6px; margin-bottom: 20px;">
                    <h4 style="color: #475569; margin: 0 0 10px 0;">📋 Transaction Summary</h4>
                    <p style="margin: 5px 0; color: #4b5563;">
                      <strong>Status:</strong> <span style="color: #059669; font-weight: 500;">Completed Successfully</span>
                    </p>
                    <p style="margin: 5px 0; color: #4b5563;">
                      <strong>Type:</strong> Withdrawal
                    </p>
                    <p style="margin: 5px 0; color: #4b5563;">
                      <strong>Currency:</strong> ZAR (South African Rand)
                    </p>
                  </div>
                  
                  <hr style="border: none; border-top: 2px dashed #e5e7eb; margin: 25px 0;">
                  
                  <div style="text-align: center;">
                    <p style="color: #6b7280; font-size: 14px; margin-bottom: 20px;">
                      This is an automated transaction receipt. Please keep this email for your records.
                    </p>
                    <div style="background: #f3f4f6; padding: 15px; border-radius: 6px;">
                      <p style="color: #ef4444; font-size: 13px; margin: 0;">
                        <strong>⚠️ Security Notice:</strong> If you did not initiate this withdrawal, 
                        please contact our support team immediately at support@lunowallet.com
                      </p>
                    </div>
                  </div>
                </div>
                
                <div style="text-align: center; margin-top: 20px;">
                  <p style="color: #9ca3af; font-size: 12px;">
                    Luno Wallet • Secure Digital Banking • www.lunowallet.com
                  </p>
                </div>
              </div>
            `
          });
          console.log('✅ Withdrawal confirmation email sent to:', userEmail);
        } catch (emailError) {
          console.error('Email sending failed:', emailError);
          // Don't fail the transaction if email fails
        }
      }

      return res.json({
        success: true,
        message: `Withdrawal of ${formatRands(withdrawAmountCents)} successful. Your new balance is ${formatRands(newBalance)}.`,
        balance: centsToRands(newBalance)
      });

    } catch (error) {
      // Rollback transaction on error
      await client.query('ROLLBACK');
      console.error('Withdrawal error:', error.message);
      console.error('Error details:', error);
      
      // Provide more specific error messages
      let errorMessage = 'Server error during withdrawal.';
      if (error.message.includes('category not found')) {
        errorMessage = 'Withdrawal category not found. Please contact support.';
      } else if (error.message.includes('account not found')) {
        errorMessage = 'User account not found. Please contact support.';
      } else if (error.message.includes('constraint')) {
        errorMessage = 'Database constraint error. Please try again.';
      } else if (error.message.includes('foreign key')) {
        errorMessage = 'Database reference error. Please contact support.';
      } else if (error.message.includes('insufficient funds')) {
        errorMessage = 'Insufficient funds for withdrawal.';
      }
      
      return res.status(500).json({ 
        success: false, 
        message: errorMessage,
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    } finally {
      // Always release the client
      client.release();
    }
  } catch (error) {
    console.error('Withdrawal error:', error.message);
    console.error('Outer withdrawal error details:', error);
    
    let errorMessage = 'Server error during withdrawal.';
    if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
      errorMessage = 'Unable to connect to service. Please try again.';
    }
    
    return res.status(500).json({ 
      success: false, 
      message: errorMessage,
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Check for anomalies before Paystack payment
export const checkDepositAnomalies = async (req, res) => {
  console.log('checkDepositAnomalies called with body:', req.body);
  console.log('User object:', req.user);
  
  const { amount } = req.body;
  const user_id = req.user?.user_id || req.user?.id;

  console.log('User ID:', user_id);
  console.log('Amount:', amount);

  if (!user_id) {
    console.log('No user ID found, returning 401');
    return res.status(401).json({ success: false, message: 'User not authenticated.' });
  }

  // Get user's email from database
  let userEmail;
  try {
    const userResult = await pool.query(
      'SELECT email FROM luno_users WHERE user_id = $1',
      [user_id]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    
    userEmail = userResult.rows[0].email;
    console.log('User email:', userEmail);
  } catch (error) {
    console.error('Error getting user email:', error);
    return res.status(500).json({ success: false, message: 'Error getting user information.' });
  }

  try {
    // Determine transaction type
    const transactionType = 'deposit';
    
    // Get user's IP and location (simplified for demo)
    const userLocation = {
      ip: req.ip || req.connection.remoteAddress,
      country: 'South Africa', // In production, use a geolocation service
      city: 'Johannesburg',
      latitude: -26.2041,
      longitude: 28.0473,
      timezone: 'Africa/Johannesburg'
    };

    // Check for large amount anomalies
    const largeAmountCheck = await anomalyDetection.checkLargeAmount(user_id, amount, transactionType);
    console.log('Large amount check:', largeAmountCheck);
    
    // Check for rapid transaction anomalies
    const rapidTransactionCheck = await anomalyDetection.checkRapidTransactions(user_id);
    console.log('Rapid transaction check:', rapidTransactionCheck);
    
    // Check for location change anomalies
    const locationCheck = await anomalyDetection.checkLocationChange(user_id, userLocation);
    console.log('Location check:', locationCheck);

    // Collect all anomalies
    const anomalies = [];
    if (largeAmountCheck.isAnomaly) anomalies.push(largeAmountCheck);
    if (rapidTransactionCheck.isAnomaly) anomalies.push(rapidTransactionCheck);
    if (locationCheck.isAnomaly) anomalies.push(locationCheck);

    console.log('Total anomalies detected:', anomalies.length);

    if (anomalies.length > 0) {
      // Anomalies detected, require verification
      return res.json({
        success: false,
        requiresVerification: true,
        anomalies: anomalies.map(anomaly => ({
          ...anomaly,
          anomaly_id: anomaly.anomaly_id || null
        })),
        message: 'Security verification required before proceeding with deposit.',
        userEmail: userEmail // Include user email in response
      });
    } else {
      // No anomalies detected, proceed to Paystack
      return res.json({
        success: true,
        requiresVerification: false,
        message: 'No security concerns detected. Proceeding to payment.',
        userEmail: userEmail // Include user email in response
      });
    }
  } catch (error) {
    console.error('Error checking deposit anomalies:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Error checking security. Please try again.' 
    });
  }
};


