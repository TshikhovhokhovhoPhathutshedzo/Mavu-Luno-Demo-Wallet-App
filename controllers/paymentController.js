import pool from "../auth/db.js";
import nodemailer from 'nodemailer';
import anomalyDetection from "../services/anomalyDetection.js";
import dailyLimitsModel from "../models/dailyLimitsModel.js";
import { formatRands } from "../utils/currencyUtils.js";
import NotificationService from "../services/notificationService.js";

/**
 * Payment Controller - Peer-to-Peer Payment System
 * 
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
 * 
 * Note: Payment verification table stores amounts in Rands for user readability,
 * but transaction tables store amounts in cents for consistency with other financial operations.
 */

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Initiate payment (send verification code)
export const initiatePayment = async (req, res) => {
    const { receiverAccountNumber, amount } = req.body;
    const sender_id = req.user?.user_id || req.user?.id;

    if (!sender_id) {
        return res.status(401).json({ success: false, message: 'User not authenticated.' });
    }

    if (!receiverAccountNumber || !amount) {
        return res.status(400).json({ success: false, message: 'Receiver account number and amount are required.' });
    }

    const paymentAmount = parseFloat(amount);
    if (isNaN(paymentAmount) || paymentAmount <= 0) {
        return res.status(400).json({ success: false, message: 'Invalid amount.' });
    }

    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');

        // Get sender's information
        const senderResult = await client.query(`
            SELECT username, email, account_number 
            FROM luno_users 
            WHERE user_id = $1
        `, [sender_id]);

        if (senderResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, message: 'Sender not found.' });
        }

        const sender = senderResult.rows[0];

        // Check if sender is trying to pay themselves
        if (sender.account_number === receiverAccountNumber) {
            await client.query('ROLLBACK');
            return res.status(400).json({ success: false, message: 'You cannot send money to yourself.' });
        }

        // Get receiver's information
        const receiverResult = await client.query(`
            SELECT user_id, username, email, account_number 
            FROM luno_users 
            WHERE account_number = $1
        `, [receiverAccountNumber]);

        if (receiverResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, message: 'Receiver account number not found.' });
        }

        const receiver = receiverResult.rows[0];

        // Check if user has security questions set up (temporarily disabled for testing)
        try {
            console.log('Checking security questions for user:', sender_id);
            const hasSecurityQuestions = await anomalyDetection.hasSecurityQuestions(sender_id);
            console.log('Security questions result:', hasSecurityQuestions);
            // Temporarily allow payments without security questions for testing
            if (!hasSecurityQuestions) {
                console.log('User does not have security questions set up, but allowing payment for testing');
            }
        } catch (securityError) {
            console.error('Error checking security questions:', securityError);
            console.error('Error stack:', securityError.stack);
            // Don't fail the payment for security questions error during testing
            console.log('Continuing with payment despite security questions error');
        }

        // Get sender's current balance
        const senderBalanceResult = await client.query(`
            SELECT balance_after FROM transaction_movements 
            WHERE user_id = $1
            ORDER BY created_at DESC
            LIMIT 1
        `, [sender_id]);

        const currentBalance = senderBalanceResult.rowCount > 0 ? 
            BigInt(senderBalanceResult.rows[0].balance_after) : BigInt(0);

        // Check if sender has sufficient balance (convert to cents for comparison)
        const paymentAmountCents = Math.round(paymentAmount * 100);
        if (BigInt(paymentAmountCents) > currentBalance) {
            await client.query('ROLLBACK');
            return res.status(400).json({ success: false, message: 'Insufficient balance.' });
        }

        // Check daily withdrawal limit for payments (treating as withdrawal from sender's perspective)
        try {
            const limitCheck = await dailyLimitsModel.checkDailyLimit(sender_id, 'withdrawal', paymentAmount);
            
            if (!limitCheck.isWithinLimit) {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    success: false,
                    message: `Daily withdrawal limit exceeded. You have used ${formatRands(limitCheck.currentUsage.amountCents)} of your ${formatRands(limitCheck.dailyLimit.amountCents)} daily limit. Remaining: ${formatRands(limitCheck.remainingLimit.amountCents)}.`,
                    limitInfo: {
                        currentUsage: limitCheck.currentUsage,
                        dailyLimit: limitCheck.dailyLimit,
                        remainingLimit: limitCheck.remainingLimit
                    }
                });
            }
        } catch (limitError) {
            console.error('Error checking daily withdrawal limit for payment:', limitError);
            // Don't fail the payment for limit check errors, just log them
            console.log('Continuing with payment despite limit check error');
        }

        // Clean up expired verification records for this user
        await client.query(`
            DELETE FROM payment_verification 
            WHERE sender_id = $1 AND expires_at < NOW() AND verified = FALSE
        `, [sender_id]);

        // Generate unique payment reference and verification code
        let paymentReference;
        let attempts = 0;
        const maxAttempts = 5;
        
        do {
            attempts++;
            const timestamp = Date.now();
            const random = Math.floor(Math.random() * 1000000);
            paymentReference = `PAY-${timestamp}-${random}`;
            
            // Check if reference already exists
            const existingRef = await client.query(`
                SELECT payment_reference FROM payment_verification 
                WHERE payment_reference = $1
            `, [paymentReference]);
            
            if (existingRef.rows.length === 0) {
                break; // Reference is unique
            }
            
            if (attempts >= maxAttempts) {
                await client.query('ROLLBACK');
                return res.status(500).json({ success: false, message: 'Unable to generate unique payment reference. Please try again.' });
            }
        } while (true);
        
        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit code
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

        // Store verification record
        await client.query(`
            INSERT INTO payment_verification 
            (payment_reference, sender_id, receiver_account_number, amount, description, verification_code, expires_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
            paymentReference,
            sender_id,
            receiverAccountNumber,
            paymentAmount, // store in rands; later flows convert to cents consistently
            'Peer-to-peer payment',
            verificationCode,
            expiresAt
        ]);

        await client.query('COMMIT');

        // Send verification email
        try {
            if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
                await transporter.sendMail({
                    from: process.env.EMAIL_USER,
                    to: sender.email,
                    subject: 'Payment Verification Code',
                    html: `
                        <h3>Payment Verification Required</h3>
                        <p>Dear ${sender.username},</p>
                        <p>You have initiated a payment of <strong>ZAR ${paymentAmount.toFixed(2)}</strong> to ${receiver.username} (${receiver.account_number}).</p>
                        <p><strong>Payment Details:</strong></p>
                        <ul>
                            <li>Reference: ${paymentReference}</li>
                            <li>To: ${receiver.username} (${receiver.account_number})</li>
                            <li>Amount: ZAR ${paymentAmount.toFixed(2)}</li>
                            <li>Type: Peer-to-peer payment</li>
                        </ul>
                        <p><strong>Your verification code is: <span style="font-size: 24px; color: #2563eb; font-weight: bold;">${verificationCode}</span></strong></p>
                        <p>This code will expire in 10 minutes.</p>
                        <p>If you did not initiate this payment, please ignore this email and contact support immediately.</p>
                        <p>Thank you for using our service!</p>
                    `
                });
                console.log('✅ Verification email sent successfully to:', sender.email);
            } else {
                console.log('⚠️ Email credentials not configured. For development, showing verification code in console:');
                console.log('📧 Verification Code:', verificationCode);
                console.log('📧 Payment Reference:', paymentReference);
            }
        } catch (emailError) {
            console.error('❌ Email sending failed:', emailError);
            // Don't fail the entire request for email errors in development
            if (process.env.NODE_ENV === 'production') {
                await client.query('ROLLBACK');
                return res.status(500).json({ success: false, message: 'Failed to send verification email. Please try again.' });
            } else {
                console.log('⚠️ Email failed but continuing in development mode');
                console.log('📧 Verification Code:', verificationCode);
                console.log('📧 Payment Reference:', paymentReference);
            }
        }

        return res.json({
            success: true,
            message: 'Verification code sent to your email.',
            paymentReference: paymentReference,
            requiresVerification: true
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Payment initiation error:', error.message);
        console.error('❌ Error stack:', error.stack);
        console.error('❌ Error code:', error.code);
        console.error('❌ Error detail:', error.detail);
        console.error('❌ Full error object:', JSON.stringify(error, null, 2));
        
        // Provide more specific error messages
        if (error.code === '23505') { // Unique constraint violation
            console.error('Unique constraint violation on table/column:', error.table, error.column);
            return res.status(400).json({ success: false, message: 'Payment reference already exists. Please try again.' });
        } else if (error.code === '23503') { // Foreign key violation
            console.error('Foreign key violation - table:', error.table, 'column:', error.column);
            return res.status(400).json({ success: false, message: 'Invalid user or account information.' });
        } else if (error.code === '23514') { // Check constraint violation
            console.error('Check constraint violation - table:', error.table, 'constraint:', error.constraint);
            return res.status(400).json({ success: false, message: 'Invalid payment amount or data.' });
        } else if (error.code === '42P01') { // Undefined table
            console.error('Undefined table error:', error.message);
            return res.status(500).json({ success: false, message: 'Database table not found. Please contact support.' });
        } else if (error.code === '42703') { // Undefined column
            console.error('Undefined column error:', error.message);
            return res.status(500).json({ success: false, message: 'Database column not found. Please contact support.' });
        } else {
            console.error('❌ Unknown error occurred during payment initiation');
            return res.status(500).json({ 
                success: false, 
                message: 'Server error during payment initiation. Please try again.',
                errorCode: error.code,
                errorMessage: error.message
            });
        }
    } finally {
        client.release();
    }
};

// Verify and process payment
export const verifyAndProcessPayment = async (req, res) => {
    const { paymentReference, verificationCode } = req.body;
    const sender_id = req.user?.user_id || req.user?.id;

    if (!sender_id) {
        return res.status(401).json({ success: false, message: 'User not authenticated.' });
    }

    if (!paymentReference || !verificationCode) {
        return res.status(400).json({ success: false, message: 'Payment reference and verification code are required.' });
    }

    const client = await pool.connect();
    
    try {
        console.log('Starting payment verification for reference:', paymentReference, 'sender:', sender_id);
        await client.query('BEGIN');

        // Get verification record
        console.log('Querying payment verification record...');
        const verificationResult = await client.query(`
            SELECT * FROM payment_verification 
            WHERE payment_reference = $1 AND sender_id = $2 AND verified = FALSE
        `, [paymentReference, sender_id]);
        
        // Also check if this payment has already been processed
        const existingPayment = await client.query(`
            SELECT reference FROM payment_history 
            WHERE reference LIKE $1
        `, [`%${paymentReference}%`]);
        
        if (existingPayment.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ 
                success: false, 
                message: 'This payment has already been processed.',
                error: 'ALREADY_PROCESSED'
            });
        }
        
        console.log('Verification result rows:', verificationResult.rows.length);

        if (verificationResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, message: 'Payment verification not found or already processed.' });
        }

        const verification = verificationResult.rows[0];

        // Check if user has security questions set up (double-check for security) - temporarily disabled
        try {
            console.log('Checking security questions for user:', sender_id);
            const hasSecurityQuestions = await anomalyDetection.hasSecurityQuestions(sender_id);
            console.log('Security questions result:', hasSecurityQuestions);
            // Temporarily allow payments without security questions for testing
            if (!hasSecurityQuestions) {
                console.log('User does not have security questions set up, but allowing payment for testing');
            }
        } catch (securityError) {
            console.error('Error checking security questions:', securityError);
            console.error('Error stack:', securityError.stack);
            // Don't fail the payment for security questions error during testing
            console.log('Continuing with payment despite security questions error');
        }

        // Check if code has expired
        if (new Date() > new Date(verification.expires_at)) {
            await client.query('ROLLBACK');
            return res.status(400).json({ success: false, message: 'Verification code has expired. Please initiate a new payment.' });
        }

        // Verify the code
        if (verification.verification_code !== verificationCode) {
            await client.query('ROLLBACK');
            return res.status(400).json({ success: false, message: 'Invalid verification code.' });
        }

        // Get sender's information
        const senderResult = await client.query(`
            SELECT username, email, account_number 
            FROM luno_users 
            WHERE user_id = $1
        `, [sender_id]);

        if (senderResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, message: 'Sender not found.' });
        }

        const sender = senderResult.rows[0];

        // Get receiver's information
        console.log('Looking up receiver with account number:', verification.receiver_account_number);
        const receiverResult = await client.query(`
            SELECT user_id, username, email, account_number 
            FROM luno_users 
            WHERE account_number = $1
        `, [verification.receiver_account_number]);

        console.log('Receiver lookup result rows:', receiverResult.rows.length);
        
        if (receiverResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, message: 'Receiver not found.' });
        }

        const receiver = receiverResult.rows[0];
        console.log('Found receiver:', receiver.username, 'with account:', receiver.account_number);

        // Lock and get sender's current balance
        const senderBalanceResult = await client.query(`
            SELECT balance_after FROM transaction_movements 
            WHERE user_id = $1
            ORDER BY created_at DESC
            LIMIT 1
            FOR UPDATE
        `, [sender_id]);

        const senderCurrentBalance = senderBalanceResult.rowCount > 0 ? 
            BigInt(senderBalanceResult.rows[0].balance_after) : BigInt(0);

        // Convert amount to cents for BigInt operations
        const amountInCents = Math.round(parseFloat(verification.amount) * 100);
        
        // Check if sender still has sufficient balance
        if (BigInt(amountInCents) > senderCurrentBalance) {
            await client.query('ROLLBACK');
            return res.status(400).json({ success: false, message: 'Insufficient balance.' });
        }

        // Calculate new balances
        const senderNewBalance = senderCurrentBalance - BigInt(amountInCents);
        
        // Lock and get receiver's current balance
        const receiverBalanceResult = await client.query(`
            SELECT balance_after FROM transaction_movements 
            WHERE user_id = $1
            ORDER BY created_at DESC
            LIMIT 1
            FOR UPDATE
        `, [receiver.user_id]);

        const receiverCurrentBalance = receiverBalanceResult.rowCount > 0 ? 
            BigInt(receiverBalanceResult.rows[0].balance_after) : BigInt(0);
        const receiverNewBalance = receiverCurrentBalance + BigInt(amountInCents);

        // Mark verification as completed
        await client.query(`
            UPDATE payment_verification 
            SET verified = TRUE 
            WHERE payment_reference = $1
        `, [paymentReference]);

        // Create payment record with unique reference
        const paymentHistoryReference = `PH-${paymentReference}`;
        await client.query(`
            INSERT INTO payment_history 
            (reference, sender_id, receiver_id, sender_account_number, receiver_account_number, 
             amount, payment_status, payment_type, description)
            VALUES ($1, $2, $3, $4, $5, $6, 'completed', 'peer_to_peer', $7)
        `, [
            paymentHistoryReference,
            sender_id,
            receiver.user_id,
            sender.account_number,
            receiver.account_number,
            verification.amount,
            verification.description
        ]);

        // Create a transaction record for the sender (debit)
        const senderMetadata = {
            receiver_id: receiver.user_id,
            receiver_account: receiver.account_number,
            receiver_name: receiver.username,
            payment_type: 'peer_to_peer',
            direction: 'sent'
        };
        
        console.log('📝 Sender metadata:', JSON.stringify(senderMetadata));
        
        // Get sender's account
        const senderAccountResult = await client.query(`
            SELECT account_id FROM accounts 
            WHERE user_id = $1 AND is_active = true 
            LIMIT 1
        `, [sender_id]);
        
        if (senderAccountResult.rows.length === 0) {
            throw new Error('Sender account not found');
        }
        
        const senderAccountId = senderAccountResult.rows[0].account_id;
        
        // Get transfer_out category
        const transferOutCategory = await client.query(`
            SELECT category_id FROM transaction_categories 
            WHERE category_name = 'transfer_out'
        `);
        
        if (transferOutCategory.rows.length === 0) {
            throw new Error('Transfer out category not found');
        }
        
        const senderTransactionResult = await client.query(`
            INSERT INTO transactions 
            (user_id, account_id, category_id, reference, amount, transaction_type, status, payment_method, description, metadata)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING transaction_id
        `, [
            sender_id,
            senderAccountId,
            transferOutCategory.rows[0].category_id,
            `TX-${paymentReference}-S`,
            amountInCents, // Store positive amount, type will be 'debit'
            'debit',
            'completed',
            'internal',
            `Payment to ${receiver.username}`,
            JSON.stringify(senderMetadata)
        ]);

        const senderTransactionId = senderTransactionResult.rows[0].transaction_id;

        // Create a transaction record for the receiver (credit)
        const receiverMetadata = {
            sender_id: sender_id,
            sender_account: sender.account_number,
            sender_name: sender.username,
            payment_type: 'peer_to_peer',
            direction: 'received'
        };
        
        console.log('📝 Receiver metadata:', JSON.stringify(receiverMetadata));
        
        // Get receiver's account
        const receiverAccountResult = await client.query(`
            SELECT account_id FROM accounts 
            WHERE user_id = $1 AND is_active = true 
            LIMIT 1
        `, [receiver.user_id]);
        
        if (receiverAccountResult.rows.length === 0) {
            throw new Error('Receiver account not found');
        }
        
        const receiverAccountId = receiverAccountResult.rows[0].account_id;
        
        // Get transfer_in category
        const transferInCategory = await client.query(`
            SELECT category_id FROM transaction_categories 
            WHERE category_name = 'transfer_in'
        `);
        
        if (transferInCategory.rows.length === 0) {
            throw new Error('Transfer in category not found');
        }
        
        const receiverTransactionResult = await client.query(`
            INSERT INTO transactions 
            (user_id, account_id, category_id, reference, amount, transaction_type, status, payment_method, description, metadata)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING transaction_id
        `, [
            receiver.user_id,
            receiverAccountId,
            transferInCategory.rows[0].category_id,
            `TX-${paymentReference}-R`,
            amountInCents, // Store in cents for consistency
            'credit',
            'completed',
            'internal',
            `Payment from ${sender.username}`,
            JSON.stringify(receiverMetadata)
        ]);

        const receiverTransactionId = receiverTransactionResult.rows[0].transaction_id;

        // Update sender's balance (debit)
        await client.query(`
            INSERT INTO transaction_movements
            (transaction_id, user_id, account_id, movement_type, amount, balance_before, balance_after, description)
            VALUES ($1, $2, $3, 'debit', $4, $5, $6, $7)
        `, [
            senderTransactionId,
            sender_id,
            senderAccountId,
            amountInCents,
            senderCurrentBalance,
            senderNewBalance,
            `Payment to ${receiver.username} (${receiver.account_number})`
        ]);

        // Update receiver's balance (credit)
        await client.query(`
            INSERT INTO transaction_movements
            (transaction_id, user_id, account_id, movement_type, amount, balance_before, balance_after, description)
            VALUES ($1, $2, $3, 'credit', $4, $5, $6, $7)
        `, [
            receiverTransactionId,
            receiver.user_id,
            receiverAccountId,
            amountInCents,
            receiverCurrentBalance,
            receiverNewBalance,
            `Payment from ${sender.username} (${sender.account_number})`
        ]);

        // Update accounts table balances
        await client.query(`
            UPDATE accounts 
            SET balance = $1 
            WHERE user_id = $2 AND is_active = true
        `, [senderNewBalance.toString(), sender_id]);

        await client.query(`
            UPDATE accounts 
            SET balance = $1 
            WHERE user_id = $2 AND is_active = true
        `, [receiverNewBalance.toString(), receiver.user_id]);

        // Commit transaction
        await client.query('COMMIT');

        // Update daily usage after successful payment
        try {
            // Update sender's withdrawal usage
            await dailyLimitsModel.updateDailyUsage(sender_id, 'withdrawal', verification.amount);
            console.log(`✅ Updated daily withdrawal usage for sender ${sender_id}: ${verification.amount}`);
            
            // Update receiver's deposit usage
            await dailyLimitsModel.updateDailyUsage(receiver.user_id, 'deposit', verification.amount);
            console.log(`✅ Updated daily deposit usage for receiver ${receiver.user_id}: ${verification.amount}`);
        } catch (usageError) {
            console.error('Error updating daily usage for payment:', usageError);
            // Don't fail the transaction for usage update errors
        }

        // Send push notifications
        try {
            // Convert amount to cents for notifications (verification.amount is in rands)
            const amountInCentsForNotification = Math.round(parseFloat(verification.amount) * 100);
            
            // Send notification to sender
            await NotificationService.sendTransactionNotification(sender_id, {
                transaction_id: senderTransactionId,
                transaction_type: 'debit',
                amount: amountInCentsForNotification,
                history_amount: amountInCentsForNotification,
                description: `Payment to ${receiver.username}`,
                payment_channel: 'internal',
                created_date: new Date().toISOString()
            });

            // Send notification to receiver
            await NotificationService.sendTransactionNotification(receiver.user_id, {
                transaction_id: receiverTransactionId,
                transaction_type: 'credit',
                amount: amountInCentsForNotification,
                history_amount: amountInCentsForNotification,
                description: `Payment from ${sender.username}`,
                payment_channel: 'internal',
                created_date: new Date().toISOString()
            });

            console.log('✅ Push notifications sent for payment');
        } catch (notificationError) {
            console.error('Error sending push notifications:', notificationError);
            // Don't fail the transaction for notification errors
        }

        // Send email notifications
        try {
            if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
                // Email to sender
                await transporter.sendMail({
                    from: process.env.EMAIL_USER,
                    to: sender.email,
                    subject: 'Payment Sent Successfully',
                    html: `
                        <h3>Payment Sent</h3>
                        <p>Dear ${sender.username},</p>
                        <p>You have successfully sent <strong>ZAR ${parseFloat(verification.amount).toFixed(2)}</strong> to ${receiver.username}.</p>
                        <p><strong>Payment Details:</strong></p>
                        <ul>
                            <li>Reference: ${paymentReference}</li>
                            <li>To: ${receiver.username} (${receiver.account_number})</li>
                            <li>Amount: ZAR ${parseFloat(verification.amount).toFixed(2)}</li>
                            <li>New Balance: ZAR ${(Number(senderNewBalance) / 100).toFixed(2)}</li>
                            <li>Date: ${new Date().toLocaleString()}</li>
                        </ul>
                        <p>Thank you for using our service!</p>
                    `
                });

                // Email to receiver
                await transporter.sendMail({
                    from: process.env.EMAIL_USER,
                    to: receiver.email,
                    subject: 'Payment Received',
                    html: `
                        <h3>Payment Received</h3>
                        <p>Dear ${receiver.username},</p>
                        <p>You have received <strong>ZAR ${parseFloat(verification.amount).toFixed(2)}</strong> from ${sender.username}.</p>
                        <p><strong>Payment Details:</strong></p>
                        <ul>
                            <li>Reference: ${paymentReference}</li>
                            <li>From: ${sender.username} (${sender.account_number})</li>
                            <li>Amount: ZAR ${parseFloat(verification.amount).toFixed(2)}</li>
                            <li>New Balance: ZAR ${(Number(receiverNewBalance) / 100).toFixed(2)}</li>
                            <li>Date: ${new Date().toLocaleString()}</li>
                        </ul>
                        <p>Thank you for using our service!</p>
                    `
                });
            }
        } catch (emailError) {
            console.error('Email sending failed:', emailError);
            // Don't fail the transaction if email fails
        }

        return res.json({
            success: true,
            message: 'Payment sent successfully.',
            reference: paymentReference,
            amount: verification.amount,
            receiver: receiver.username,
            newBalance: (Number(senderNewBalance) / 100).toFixed(2)
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Payment verification error:', error.message);
        console.error('❌ Error stack:', error.stack);
        console.error('❌ Payment reference:', paymentReference);
        console.error('❌ User ID:', sender_id);
        console.error('❌ Error code:', error.code);
        console.error('❌ Error detail:', error.detail);
        console.error('❌ Full error object:', JSON.stringify(error, null, 2));
        
        // Provide more specific error messages
        if (error.code === '23505') { // Unique constraint violation
            console.error('Unique constraint violation on table/column:', error.table, error.column);
            return res.status(400).json({ 
                success: false, 
                message: 'Payment processing conflict. Please try again.',
                error: 'DUPLICATE_REFERENCE'
            });
        } else if (error.code === '23503') { // Foreign key violation
            console.error('Foreign key violation - table:', error.table, 'column:', error.column);
            return res.status(400).json({ success: false, message: 'Invalid user or account information.' });
        } else if (error.code === '23514') { // Check constraint violation
            console.error('Check constraint violation - table:', error.table, 'constraint:', error.constraint);
            return res.status(400).json({ success: false, message: 'Invalid payment amount or data.' });
        } else if (error.code === '42P01') { // Undefined table
            console.error('Undefined table error:', error.message);
            return res.status(500).json({ success: false, message: 'Database table not found. Please contact support.' });
        } else if (error.code === '42703') { // Undefined column
            console.error('Undefined column error:', error.message);
            return res.status(500).json({ success: false, message: 'Database column not found. Please contact support.' });
        } else {
            console.error('❌ Unknown error occurred during payment processing');
            return res.status(500).json({ 
                success: false, 
                message: 'Server error during payment processing. Please try again.',
                errorCode: error.code,
                errorMessage: error.message
            });
        }
    } finally {
        client.release();
    }
};

// Legacy function for backward compatibility
export const processPayment = async (req, res) => {
    return initiatePayment(req, res);
};

// Cleanup function for expired verification records
export const cleanupExpiredVerifications = async () => {
    const client = await pool.connect();
    try {
        const result = await client.query(`
            DELETE FROM payment_verification 
            WHERE expires_at < NOW() AND verified = FALSE
        `);
        console.log(`🧹 Cleaned up ${result.rowCount} expired verification records`);
        return result.rowCount;
    } catch (error) {
        console.error('Error cleaning up expired verifications:', error);
        return 0;
    } finally {
        client.release();
    }
};

// Get payment history for a user
export const getPaymentHistory = async (req, res) => {
    const user_id = req.user?.user_id || req.user?.id;

    if (!user_id) {
        return res.status(401).json({ success: false, message: 'User not authenticated.' });
    }

    try {
        const result = await pool.query(`
            SELECT 
                ph.reference,
                ph.amount,
                ph.payment_status,
                ph.payment_type,
                ph.description,
                ph.created_at,
                ph.sender_account_number,
                ph.receiver_account_number,
                sender.username as sender_username,
                receiver.username as receiver_username,
                CASE 
                    WHEN ph.sender_id = $1 THEN 'sent'
                    WHEN ph.receiver_id = $1 THEN 'received'
                END as payment_direction
            FROM payment_history ph
            JOIN luno_users sender ON ph.sender_id = sender.user_id
            JOIN luno_users receiver ON ph.receiver_id = receiver.user_id
            WHERE ph.sender_id = $1 OR ph.receiver_id = $1
            ORDER BY ph.created_at DESC
            LIMIT 50
        `, [user_id]);

        return res.json({
            success: true,
            payments: result.rows
        });

    } catch (error) {
        console.error('Error fetching payment history:', error.message);
        return res.status(500).json({ success: false, message: 'Server error while fetching payment history.' });
    }
};

// Get user's account number
export const getAccountNumber = async (req, res) => {
    const user_id = req.user?.user_id || req.user?.id;

    if (!user_id) {
        return res.status(401).json({ success: false, message: 'User not authenticated.' });
    }

    try {
        const result = await pool.query(`
            SELECT account_number, username 
            FROM luno_users 
            WHERE user_id = $1
        `, [user_id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        return res.json({
            success: true,
            accountNumber: result.rows[0].account_number,
            username: result.rows[0].username
        });

    } catch (error) {
        console.error('Error fetching account number:', error.message);
        return res.status(500).json({ success: false, message: 'Server error while fetching account number.' });
    }
};

// Test endpoint for debugging payment issues
export const testPaymentSystem = async (req, res) => {
    const user_id = req.user?.user_id || req.user?.id;
    
    if (!user_id) {
        return res.status(401).json({ 
            success: false, 
            message: 'User not authenticated.',
            debug: {
                user: req.user,
                session: req.session
            }
        });
    }

    const client = await pool.connect();
    
    try {
        // Get user info
        const userResult = await client.query(`
            SELECT username, email, account_number, balance_after 
            FROM luno_users 
            LEFT JOIN (
                SELECT user_id, balance_after 
                FROM transaction_movements 
                WHERE (user_id, created_at) IN (
                    SELECT user_id, MAX(created_at) 
                    FROM transaction_movements 
                    GROUP BY user_id
                )
            ) tm ON luno_users.user_id = tm.user_id
            WHERE luno_users.user_id = $1
        `, [user_id]);

        if (userResult.rows.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'User not found in database.' 
            });
        }

        const user = userResult.rows[0];

        // Check email configuration
        const emailConfigured = !!(process.env.EMAIL_USER && process.env.EMAIL_PASS);

        // Check database tables
        const tablesResult = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_name IN ('payment_verification', 'payment_history', 'transaction_movements')
        `);

        const availableTables = tablesResult.rows.map(row => row.table_name);

        return res.json({
            success: true,
            message: 'Payment system test completed',
            user: {
                id: user_id,
                username: user.username,
                email: user.email,
                accountNumber: user.account_number,
                balance: user.balance_after ? (Number(user.balance_after) / 100).toFixed(2) : '0.00'
            },
            system: {
                emailConfigured,
                availableTables,
                nodeEnv: process.env.NODE_ENV || 'development'
            }
        });

    } catch (error) {
        console.error('Payment system test error:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Error testing payment system',
            error: error.message
        });
    } finally {
        client.release();
    }
};
