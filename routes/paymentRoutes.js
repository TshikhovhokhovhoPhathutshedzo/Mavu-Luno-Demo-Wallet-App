import express from "express";
import { initiatePayment, verifyAndProcessPayment, getPaymentHistory, getAccountNumber, testPaymentSystem, cleanupExpiredVerifications } from "../controllers/paymentController.js";
import { ensureAuth } from "../middlewares/ensureAuth.js";
import { sanitizeUserInput, validateTransaction } from "../middlewares/inputValidation.js";

const router = express.Router();

// Payment routes
router.post("/initiate", ensureAuth, sanitizeUserInput, validateTransaction, initiatePayment);
router.post("/verify", ensureAuth, verifyAndProcessPayment);
router.get("/history", ensureAuth, getPaymentHistory);
router.get("/account-number", ensureAuth, getAccountNumber);
router.get("/test", ensureAuth, testPaymentSystem); // Debug endpoint
router.post("/cleanup", ensureAuth, async (req, res) => {
    try {
        const cleanedCount = await cleanupExpiredVerifications();
        res.json({ success: true, message: `Cleaned up ${cleanedCount} expired verifications` });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Cleanup failed' });
    }
}); // Cleanup endpoint

export default router;
