import express from "express";
import {
    storeTransaction,
    handleWithdrawal,
    checkDepositAnomalies
} from "../controllers/transControllers.js";
import { checkTransactionAnomalies, requireAnomalyVerification } from "../middlewares/anomalyCheck.js";
import { sanitizeUserInput, validateTransaction } from "../middlewares/inputValidation.js";
import { ensureAuth } from "../middlewares/ensureAuth.js";
import { checkDepositLimits, checkWithdrawalLimits, updateDailyUsage } from "../middlewares/dailyLimitsCheck.js";

const router = express.Router();

// Simple test route to verify the module is loaded
router.get("/test", (req, res) => {
  res.json({ success: true, message: "transRoutes module is loaded" });
});

// Deposit route with daily limits check BEFORE processing
router.post("/verify-deposit", ensureAuth, sanitizeUserInput, validateTransaction, checkDepositLimits, checkTransactionAnomalies, requireAnomalyVerification, storeTransaction, updateDailyUsage);

// Withdrawal route with daily limits check BEFORE processing  
router.post('/withdraw', ensureAuth, sanitizeUserInput, validateTransaction, checkWithdrawalLimits, checkTransactionAnomalies, requireAnomalyVerification, handleWithdrawal, updateDailyUsage);

// New route to check anomalies before Paystack payment
router.post("/check-anomalies", ensureAuth, sanitizeUserInput, validateTransaction, checkDepositAnomalies);

// New route to check daily limits before Paystack payment
router.post("/check-deposit-limits", ensureAuth, sanitizeUserInput, validateTransaction, checkDepositLimits);

// New route to check daily limits before withdrawal
router.post("/check-withdrawal-limits", ensureAuth, sanitizeUserInput, validateTransaction, checkWithdrawalLimits);

// Test route for debugging (no auth)
router.post("/test-check-anomalies", (req, res) => {
  console.log('Test endpoint called');
  console.log('User:', req.user);
  console.log('Body:', req.body);
  res.json({ success: true, message: 'Test endpoint working' });
});

// Test route that bypasses anomaly detection (for testing only)
router.post("/test-deposit", ensureAuth, sanitizeUserInput, validateTransaction, storeTransaction);
router.post('/test-withdraw', ensureAuth, sanitizeUserInput, validateTransaction, handleWithdrawal);

export default router;