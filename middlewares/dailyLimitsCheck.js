import dailyLimitsModel from "../models/dailyLimitsModel.js";
import { formatRands } from "../utils/currencyUtils.js";

/**
 * Daily Limits Check Middleware
 * 
 * This middleware checks if a transaction would exceed the user's daily limits
 * BEFORE the transaction is processed. This is critical for security and
 * preventing unauthorized transactions.
 * 
 * For deposits: Checks if the deposit amount would exceed daily deposit limit
 * For withdrawals: Checks if the withdrawal amount would exceed daily withdrawal limit
 */

export const checkDailyLimits = async (req, res, next) => {
    try {
        const { amount } = req.body;
        const userId = req.user?.user_id || req.user?.id;

        // Defensive checks
        if (!userId) {
            return res.status(401).json({ 
                success: false, 
                message: "User not authenticated" 
            });
        }

        if (typeof amount === "undefined" || amount === null) {
            return res.status(400).json({ 
                success: false, 
                message: "Amount is required" 
            });
        }

        // Get transaction type from request object or determine from path
        const transactionType = req.transactionType || (req.path.includes('deposit') ? 'deposit' : 'withdrawal');
        
        console.log(`🔍 Checking daily limits for ${transactionType}: ${formatRands(amount)} (User: ${userId})`);

        // Check if the transaction would exceed daily limits
        const limitCheck = await dailyLimitsModel.checkDailyLimit(
            userId, 
            transactionType, 
            amount
        );

        console.log('Daily limit check result:', limitCheck);

        if (!limitCheck.success) {
            console.log(`❌ Daily limit check failed: ${limitCheck.message || 'Unknown error'}`);
            return res.status(400).json({
                success: false,
                message: limitCheck.message || 'Daily limit check failed',
                limitExceeded: true,
                details: {
                    currentUsage: limitCheck.currentUsage || { amountRands: 0, amountCents: 0 },
                    dailyLimit: limitCheck.dailyLimit || { amountRands: 0, amountCents: 0 },
                    remainingLimit: limitCheck.remainingLimit || { amountRands: 0, amountCents: 0 },
                    transactionType: transactionType
                }
            });
        }

        if (!limitCheck.isWithinLimit) {
            console.log(`🚫 Transaction would exceed daily ${transactionType} limit`);
            
            // Store the limit check result in the request for potential hold processing
            req.limitCheck = limitCheck;
            
            const currentUsage = limitCheck.currentUsage || { amountRands: 0 };
            const dailyLimit = limitCheck.dailyLimit || { amountRands: 0 };
            const remainingLimit = limitCheck.remainingLimit || { amountRands: 0 };
            
            return res.status(400).json({
                success: false,
                message: `This ${transactionType} would exceed your daily limit of R${dailyLimit.amountRands || 0}. You have used R${currentUsage.amountRands || 0} today, leaving R${remainingLimit.amountRands || 0} available.`,
                limitExceeded: true,
                details: {
                    currentUsage: currentUsage,
                    dailyLimit: dailyLimit,
                    remainingLimit: remainingLimit,
                    transactionType: transactionType,
                    suggestedAmount: remainingLimit.amountRands || 0
                }
            });
        }

        console.log(`✅ Daily limit check passed for ${transactionType}: ${formatRands(amount)}`);
        
        // Store the limit check result in the request for later usage
        req.limitCheck = limitCheck;
        
        // Continue to next middleware/route handler
        next();

    } catch (error) {
        console.error('Error checking daily limits:', error);
        
        // BLOCK TRANSACTION ON ERROR - don't call next()
        return res.status(500).json({
            success: false,
            message: 'Error checking daily limits. Transaction blocked for security.',
            limitCheckError: true
        });
    }
};

/**
 * Check Daily Limits for Deposits Only
 * Specific middleware for deposit transactions
 */
export const checkDepositLimits = async (req, res, next) => {
    // Set transaction type directly on request object
    req.transactionType = 'deposit';
    
    try {
        await checkDailyLimits(req, res, next);
    } catch (error) {
        console.error('Error in checkDepositLimits:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Error checking deposit limits.' 
        });
    }
};

/**
 * Check Daily Limits for Withdrawals Only
 * Specific middleware for withdrawal transactions
 */
export const checkWithdrawalLimits = async (req, res, next) => {
    // Set transaction type directly on request object
    req.transactionType = 'withdrawal';
    
    try {
        await checkDailyLimits(req, res, next);
    } catch (error) {
        console.error('Error in checkWithdrawalLimits:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Error checking withdrawal limits.' 
        });
    }
};

/**
 * Update Daily Usage After Successful Transaction
 * This should be called AFTER a successful transaction to update usage
 */
export const updateDailyUsage = async (req, res, next) => {
    try {
        // Only update if we have a successful transaction
        if (res.locals.transactionSuccess && req.limitCheck) {
            const { amount } = req.body;
            const userId = req.user?.user_id || req.user?.id;
            const transactionType = req.transactionType || (req.path.includes('deposit') ? 'deposit' : 'withdrawal');
            
            console.log(`📊 Updating daily usage for ${transactionType}: ${formatRands(amount)}`);
            
            await dailyLimitsModel.updateDailyUsage(userId, transactionType, amount);
            
            console.log(`✅ Daily usage updated for user ${userId}: ${formatRands(amount)}`);
        }
        
        next();
    } catch (error) {
        console.error('Error updating daily usage:', error);
        // Don't fail the response for usage update errors
        next();
    }
};
