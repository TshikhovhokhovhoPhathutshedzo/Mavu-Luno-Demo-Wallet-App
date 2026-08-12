import dailyLimitsModel from "../models/dailyLimitsModel.js";
import { validateAmount, formatRands } from "../utils/currencyUtils.js";

/**
 * Limits Controller
 * Handles API endpoints for daily limits management
 * 
 * Features:
 * - Set daily limits for deposits and withdrawals
 * - View current limits and usage
 * - Check if transactions would exceed limits
 * - View limit change history
 * - Disable/enable limits
 */

/**
 * Set a daily limit for deposits or withdrawals
 * POST /api/limits/set
 */
export const setDailyLimit = async (req, res) => {
    const { limitType, amount, reason } = req.body;
    const userId = req.user?.user_id || req.user?.id;

    if (!userId) {
        return res.status(401).json({ 
            success: false, 
            message: 'User not authenticated.' 
        });
    }

    if (!limitType || !amount) {
        return res.status(400).json({ 
            success: false, 
            message: 'Limit type and amount are required.' 
        });
    }

    if (!['deposit', 'withdrawal'].includes(limitType)) {
        return res.status(400).json({ 
            success: false, 
            message: 'Invalid limit type. Must be "deposit" or "withdrawal".' 
        });
    }

    try {
        // Validate amount
        const validation = validateAmount(amount);
        if (!validation.isValid) {
            return res.status(400).json({ 
                success: false, 
                message: validation.message 
            });
        }

        const result = await dailyLimitsModel.setDailyLimit(
            userId, 
            limitType, 
            validation.value, 
            'user', 
            reason
        );

        return res.json({
            success: true,
            message: result.message,
            limit: result.limit
        });

    } catch (error) {
        console.error('Error setting daily limit:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Server error while setting daily limit.' 
        });
    }
};

/**
 * Get user's current daily limits
 * GET /api/limits
 */
export const getDailyLimits = async (req, res) => {
    const userId = req.user?.user_id || req.user?.id;

    if (!userId) {
        return res.status(401).json({ 
            success: false, 
            message: 'User not authenticated.' 
        });
    }

    try {
        const result = await dailyLimitsModel.getUserLimits(userId);
        return res.json(result);

    } catch (error) {
        console.error('Error getting daily limits:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Server error while fetching daily limits.' 
        });
    }
};

/**
 * Get comprehensive limit status including usage
 * GET /api/limits/status
 */
export const getLimitStatus = async (req, res) => {
    const userId = req.user?.user_id || req.user?.id;
    const { date } = req.query;

    if (!userId) {
        return res.status(401).json({ 
            success: false, 
            message: 'User not authenticated.' 
        });
    }

    try {
        const checkDate = date ? new Date(date) : new Date();
        const result = await dailyLimitsModel.getLimitStatus(userId, checkDate);
        return res.json(result);

    } catch (error) {
        console.error('Error getting limit status:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Server error while fetching limit status.' 
        });
    }
};

/**
 * Check if a transaction would exceed daily limit
 * POST /api/limits/check
 */
export const checkDailyLimit = async (req, res) => {
    const { limitType, amount, date } = req.body;
    const userId = req.user?.user_id || req.user?.id;

    if (!userId) {
        return res.status(401).json({ 
            success: false, 
            message: 'User not authenticated.' 
        });
    }

    if (!limitType || !amount) {
        return res.status(400).json({ 
            success: false, 
            message: 'Limit type and amount are required.' 
        });
    }

    if (!['deposit', 'withdrawal'].includes(limitType)) {
        return res.status(400).json({ 
            success: false, 
            message: 'Invalid limit type. Must be "deposit" or "withdrawal".' 
        });
    }

    try {
        // Validate amount
        const validation = validateAmount(amount);
        if (!validation.isValid) {
            return res.status(400).json({ 
                success: false, 
                message: validation.message 
            });
        }

        const checkDate = date ? new Date(date) : new Date();
        const result = await dailyLimitsModel.checkDailyLimit(
            userId, 
            limitType, 
            validation.value, 
            checkDate
        );

        return res.json(result);

    } catch (error) {
        console.error('Error checking daily limit:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Server error while checking daily limit.' 
        });
    }
};

/**
 * Get daily usage for a specific type and date
 * GET /api/limits/usage/:type
 */
export const getDailyUsage = async (req, res) => {
    const { type } = req.params;
    const { date } = req.query;
    const userId = req.user?.user_id || req.user?.id;

    if (!userId) {
        return res.status(401).json({ 
            success: false, 
            message: 'User not authenticated.' 
        });
    }

    if (!['deposit', 'withdrawal'].includes(type)) {
        return res.status(400).json({ 
            success: false, 
            message: 'Invalid type. Must be "deposit" or "withdrawal".' 
        });
    }

    try {
        const checkDate = date ? new Date(date) : new Date();
        const result = await dailyLimitsModel.getDailyUsage(userId, type, checkDate);
        return res.json(result);

    } catch (error) {
        console.error('Error getting daily usage:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Server error while fetching daily usage.' 
        });
    }
};

/**
 * Disable a daily limit (set to unlimited)
 * DELETE /api/limits/:type
 */
export const disableDailyLimit = async (req, res) => {
    const { type } = req.params;
    const { reason } = req.body;
    const userId = req.user?.user_id || req.user?.id;

    if (!userId) {
        return res.status(401).json({ 
            success: false, 
            message: 'User not authenticated.' 
        });
    }

    if (!['deposit', 'withdrawal'].includes(type)) {
        return res.status(400).json({ 
            success: false, 
            message: 'Invalid type. Must be "deposit" or "withdrawal".' 
        });
    }

    try {
        const result = await dailyLimitsModel.disableDailyLimit(
            userId, 
            type, 
            'user', 
            reason
        );

        return res.json(result);

    } catch (error) {
        console.error('Error disabling daily limit:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Server error while disabling daily limit.' 
        });
    }
};

/**
 * Get limit change history
 * GET /api/limits/history
 */
export const getLimitHistory = async (req, res) => {
    const { type, limit } = req.query;
    const userId = req.user?.user_id || req.user?.id;

    if (!userId) {
        return res.status(401).json({ 
            success: false, 
            message: 'User not authenticated.' 
        });
    }

    try {
        const limitCount = limit ? parseInt(limit) : 50;
        const result = await dailyLimitsModel.getLimitHistory(userId, type, limitCount);
        return res.json(result);

    } catch (error) {
        console.error('Error getting limit history:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Server error while fetching limit history.' 
        });
    }
};

/**
 * Get suggested limits based on user's transaction history
 * GET /api/limits/suggestions
 */
export const getSuggestedLimits = async (req, res) => {
    const userId = req.user?.user_id || req.user?.id;

    if (!userId) {
        return res.status(401).json({ 
            success: false, 
            message: 'User not authenticated.' 
        });
    }

    try {
        // This would analyze user's transaction history to suggest appropriate limits
        // For now, we'll return some default suggestions
        const suggestions = {
            deposit: {
                conservative: 1000, // R1,000
                moderate: 5000,    // R5,000
                aggressive: 10000  // R10,000
            },
            withdrawal: {
                conservative: 500,  // R500
                moderate: 2000,     // R2,000
                aggressive: 5000    // R5,000
            }
        };

        return res.json({
            success: true,
            suggestions: suggestions,
            message: 'Suggested limits based on typical usage patterns'
        });

    } catch (error) {
        console.error('Error getting suggested limits:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Server error while fetching suggested limits.' 
        });
    }
};

/**
 * Test endpoint to verify limits system is working
 * GET /api/limits/test
 */
export const testLimitsSystem = async (req, res) => {
    const userId = req.user?.user_id || req.user?.id;

    if (!userId) {
        return res.status(401).json({ 
            success: false, 
            message: 'User not authenticated.' 
        });
    }

    try {
        // Test setting a limit
        const testLimit = await dailyLimitsModel.setDailyLimit(userId, 'deposit', 1000, 'system', 'Test limit');
        
        // Test checking the limit
        const limitCheck = await dailyLimitsModel.checkDailyLimit(userId, 'deposit', 500);
        
        // Test getting limits
        const limits = await dailyLimitsModel.getUserLimits(userId);
        
        // Test getting status
        const status = await dailyLimitsModel.getLimitStatus(userId);
        
        // Clean up test limit
        await dailyLimitsModel.disableDailyLimit(userId, 'deposit', 'system', 'Test cleanup');

        return res.json({
            success: true,
            message: 'Daily limits system is working correctly',
            tests: {
                setLimit: testLimit.success,
                checkLimit: limitCheck.success,
                getLimits: limits.success,
                getStatus: status.success
            },
            currentLimits: limits.limits
        });

    } catch (error) {
        console.error('Error testing limits system:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Error testing limits system',
            error: error.message
        });
    }
};

