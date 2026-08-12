import express from "express";
import { 
    showForgotPassword,
    showResetCode,
    showNewPassword,
    requestPasswordReset,
    verifyResetCode,
    resetPassword,
    apiRequestPasswordReset,
    apiVerifyResetCode,
    apiResetPassword,
    clearResetAttempts,
    verifyFaceForPasswordReset,
    resetPasswordWithFace,
    passwordResetLimiter
} from "../controllers/passwordResetController.js";
import { sanitizeUserInput } from "../middlewares/inputValidation.js";

const router = express.Router();

// Page routes
router.get("/forgot-password", showForgotPassword);
router.get("/forgot-password/code", showResetCode);
router.get("/forgot-password/new-password", showNewPassword);
router.get("/forgot-password/reset", (req, res) => {
    // Redirect to the proper forgot password page if accessed directly
    res.redirect("/forgot-password");
});
router.get("/forgot-password-with-face", (req, res) => {
    res.render("forgotPasswordWithFace");
});

// Form submission routes
router.post("/forgot-password", passwordResetLimiter, sanitizeUserInput, requestPasswordReset);
router.post("/forgot-password/verify-code", passwordResetLimiter, sanitizeUserInput, verifyResetCode);
router.post("/forgot-password/reset", passwordResetLimiter, sanitizeUserInput, resetPassword);

// API routes for AJAX calls
router.post("/api/forgot-password", passwordResetLimiter, sanitizeUserInput, apiRequestPasswordReset);
router.post("/api/verify-reset-code", passwordResetLimiter, sanitizeUserInput, apiVerifyResetCode);
router.post("/api/reset-password", passwordResetLimiter, sanitizeUserInput, apiResetPassword);
router.post("/api/verify-face-reset", passwordResetLimiter, sanitizeUserInput, verifyFaceForPasswordReset);
router.post("/api/reset-password-face", passwordResetLimiter, sanitizeUserInput, resetPasswordWithFace);
router.post("/api/clear-reset-attempts", sanitizeUserInput, clearResetAttempts); // For testing only

export default router;
