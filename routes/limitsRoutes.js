import express from 'express';
import {
    setDailyLimit,
    getDailyLimits,
    getLimitStatus,
    checkDailyLimit,
    getDailyUsage,
    disableDailyLimit,
    getLimitHistory,
    getSuggestedLimits,
    testLimitsSystem
} from '../controllers/limitsController.js';
import { ensureAuth } from '../middlewares/ensureAuth.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(ensureAuth);

/**
 * Daily Limits API Routes
 * 
 * All routes require authentication
 * All amounts are handled in Rands (ZAR) for user input/output
 * Database stores amounts in cents for precision
 */

// Set a daily limit for deposits or withdrawals
// POST /api/limits/set
// Body: { limitType: 'deposit'|'withdrawal', amount: number, reason?: string }
router.post('/set', setDailyLimit);

// Get user's current daily limits
// GET /api/limits
router.get('/', getDailyLimits);

// Get comprehensive limit status including usage
// GET /api/limits/status?date=YYYY-MM-DD
// TEMPORARILY DISABLED TO STOP LOOP
// router.get('/status', getLimitStatus);

// Check if a transaction would exceed daily limit
// POST /api/limits/check
// Body: { limitType: 'deposit'|'withdrawal', amount: number, date?: string }
router.post('/check', checkDailyLimit);

// Get daily usage for a specific type
// GET /api/limits/usage/:type?date=YYYY-MM-DD
// :type = 'deposit' or 'withdrawal'
router.get('/usage/:type', getDailyUsage);

// Disable a daily limit (set to unlimited)
// DELETE /api/limits/:type
// :type = 'deposit' or 'withdrawal'
// Body: { reason?: string }
router.delete('/:type', disableDailyLimit);

// Get limit change history
// GET /api/limits/history?type=deposit|withdrawal&limit=50
router.get('/history', getLimitHistory);

// Get suggested limits based on usage patterns
// GET /api/limits/suggestions
router.get('/suggestions', getSuggestedLimits);

// Test endpoint to verify limits system
// GET /api/limits/test
router.get('/test', testLimitsSystem);

export default router;

