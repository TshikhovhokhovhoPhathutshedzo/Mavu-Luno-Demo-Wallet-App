import passwordResetService from "../services/passwordResetService.js";
import { rateLimit } from "express-rate-limit";
import axios from "axios";
import crypto from "crypto";
import pool from "../auth/db.js";

// Face recognition configuration
const FACE_SECRET = process.env.FACE_SECRET || (() => {
    console.warn('⚠️  WARNING: Using fallback face secret. Set FACE_SECRET in .env for production!');
    return 'fallback-face-secret-change-in-production-' + Date.now();
})();

const FACE_MICROSERVICE = process.env.FACE_MICROSERVICE || "http://localhost:5001";

// Encryption/Decryption functions for face embeddings
const encryptEmbedding = (embedding) => {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(FACE_SECRET), iv);
    let encrypted = cipher.update(JSON.stringify(embedding), "utf8", "hex");
    encrypted += cipher.final("hex");
    return iv.toString("hex") + ":" + encrypted;
};

const decryptEmbedding = (encryptedData) => {
    const [ivHex, encrypted] = encryptedData.split(":");
    const iv = Buffer.from(ivHex, "hex");
    const decipher = crypto.createDecipheriv("aes-256-cbc", Buffer.from(FACE_SECRET), iv);
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return JSON.parse(decrypted);
};

// Rate limiting for password reset requests
export const passwordResetLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 3, // 3 requests per 15 minutes
    message: 'Too many password reset attempts. Please try again later.',
    standardHeaders: 'draft-8',
    legacyHeaders: false
});

// Show forgot password page
export const showForgotPassword = (req, res) => {
    res.render("forgotPassword", {
        message: req.flash("message"),
        error: req.flash("error"),
        step: "email"
    });
};

// Show reset code verification page
export const showResetCode = (req, res) => {
    const { email } = req.query;
    if (!email) {
        return res.redirect("/forgot-password");
    }
    
    res.render("forgotPassword", {
        message: req.flash("message"),
        error: req.flash("error"),
        step: "code",
        email: email
    });
};

// Show new password page
export const showNewPassword = (req, res) => {
    const { email, resetId } = req.query;
    if (!email || !resetId) {
        return res.redirect("/forgot-password");
    }
    
    res.render("forgotPassword", {
        message: req.flash("message"),
        error: req.flash("error"),
        step: "password",
        email: email,
        resetId: resetId
    });
};

// Handle password reset request
export const requestPasswordReset = async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            req.flash("error", "Email address is required");
            return res.redirect("/forgot-password");
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            req.flash("error", "Please enter a valid email address");
            return res.redirect("/forgot-password");
        }

        const result = await passwordResetService.requestPasswordReset(email);
        
        if (result.success) {
            req.flash("message", result.message);
            res.redirect(`/forgot-password/code?email=${encodeURIComponent(email)}`);
        } else {
            req.flash("error", result.message);
            res.redirect("/forgot-password");
        }
    } catch (error) {
        console.error("Password reset request error:", error);
        req.flash("error", "An error occurred. Please try again later.");
        res.redirect("/forgot-password");
    }
};

// Handle reset code verification
export const verifyResetCode = async (req, res) => {
    try {
        const { email, resetCode } = req.body;
        
        if (!email || !resetCode) {
            req.flash("error", "Email and reset code are required");
            return res.redirect(`/forgot-password/code?email=${encodeURIComponent(email)}`);
        }

        if (resetCode.length !== 6 || !/^\d{6}$/.test(resetCode)) {
            req.flash("error", "Please enter a valid 6-digit code");
            return res.redirect(`/forgot-password/code?email=${encodeURIComponent(email)}`);
        }

        const result = await passwordResetService.verifyResetCode(email, resetCode);
        
        if (result.success) {
            req.flash("message", "Code verified successfully! Please enter your new password.");
            res.redirect(`/forgot-password/new-password?email=${encodeURIComponent(email)}&resetId=${result.resetId}`);
        } else {
            req.flash("error", result.message);
            res.redirect(`/forgot-password/code?email=${encodeURIComponent(email)}`);
        }
    } catch (error) {
        console.error("Reset code verification error:", error);
        req.flash("error", "An error occurred. Please try again.");
        res.redirect(`/forgot-password/code?email=${encodeURIComponent(req.body.email)}`);
    }
};

// Handle password reset
export const resetPassword = async (req, res) => {
    try {
        const { email, resetId, newPassword, confirmPassword } = req.body;
        
        if (!email || !resetId || !newPassword || !confirmPassword) {
            req.flash("error", "All fields are required");
            return res.redirect(`/forgot-password/new-password?email=${encodeURIComponent(email)}&resetId=${resetId}`);
        }

        if (newPassword !== confirmPassword) {
            req.flash("error", "Passwords do not match");
            return res.redirect(`/forgot-password/new-password?email=${encodeURIComponent(email)}&resetId=${resetId}`);
        }

        // Validate password strength
        const passwordValidation = passwordResetService.validatePasswordStrength(newPassword);
        if (!passwordValidation.isValid) {
            req.flash("error", passwordValidation.errors.join(", "));
            return res.redirect(`/forgot-password/new-password?email=${encodeURIComponent(email)}&resetId=${resetId}`);
        }

        const result = await passwordResetService.resetPassword(resetId, newPassword);
        
        if (result.success) {
            req.flash("message", result.message);
            res.redirect("/authorized/login");
        } else {
            req.flash("error", result.message);
            res.redirect(`/forgot-password/new-password?email=${encodeURIComponent(email)}&resetId=${resetId}`);
        }
    } catch (error) {
        console.error("Password reset error:", error);
        req.flash("error", "An error occurred. Please try again.");
        res.redirect(`/forgot-password/new-password?email=${encodeURIComponent(req.body.email)}&resetId=${req.body.resetId}`);
    }
};

// API endpoint for password reset request (for AJAX calls)
export const apiRequestPasswordReset = async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({
                success: false,
                message: "Email address is required"
            });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                success: false,
                message: "Please enter a valid email address"
            });
        }

        const result = await passwordResetService.requestPasswordReset(email);
        res.json(result);
    } catch (error) {
        console.error("API password reset request error:", error);
        res.status(500).json({
            success: false,
            message: "An error occurred. Please try again later."
        });
    }
};

// API endpoint for reset code verification (for AJAX calls)
export const apiVerifyResetCode = async (req, res) => {
    try {
        const { email, resetCode } = req.body;
        
        if (!email || !resetCode) {
            return res.status(400).json({
                success: false,
                message: "Email and reset code are required"
            });
        }

        if (resetCode.length !== 6 || !/^\d{6}$/.test(resetCode)) {
            return res.status(400).json({
                success: false,
                message: "Please enter a valid 6-digit code"
            });
        }

        const result = await passwordResetService.verifyResetCode(email, resetCode);
        res.json(result);
    } catch (error) {
        console.error("API reset code verification error:", error);
        res.status(500).json({
            success: false,
            message: "An error occurred. Please try again."
        });
    }
};

// API endpoint for password reset (for AJAX calls)
export const apiResetPassword = async (req, res) => {
    try {
        const { email, resetId, newPassword, confirmPassword } = req.body;
        
        if (!email || !resetId || !newPassword || !confirmPassword) {
            return res.status(400).json({
                success: false,
                message: "All fields are required"
            });
        }

        if (newPassword !== confirmPassword) {
            return res.status(400).json({
                success: false,
                message: "Passwords do not match"
            });
        }

        // Validate password strength
        const passwordValidation = passwordResetService.validatePasswordStrength(newPassword);
        if (!passwordValidation.isValid) {
            return res.status(400).json({
                success: false,
                message: passwordValidation.errors.join(", ")
            });
        }

        const result = await passwordResetService.resetPassword(resetId, newPassword);
        res.json(result);
    } catch (error) {
        console.error("API password reset error:", error);
        res.status(500).json({
            success: false,
            message: "An error occurred. Please try again."
        });
    }
};

// Clear reset attempts for testing (remove in production)
export const clearResetAttempts = async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({
                success: false,
                message: "Email is required."
            });
        }

        const result = await passwordResetService.clearResetAttempts(email);
        
        if (result.success) {
            res.json({
                success: true,
                message: result.message
            });
        } else {
            res.status(400).json({
                success: false,
                message: result.message
            });
        }
    } catch (error) {
        console.error('Clear reset attempts error:', error);
        res.status(500).json({
            success: false,
            message: "An error occurred. Please try again."
        });
    }
};

// API endpoint for face verification during password reset
export const verifyFaceForPasswordReset = async (req, res) => {
    try {
        const { email, faceImage } = req.body;
        
        if (!email || !faceImage) {
            return res.status(400).json({
                success: false,
                message: "Email and face image are required"
            });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                success: false,
                message: "Please enter a valid email address"
            });
        }

        // Get user by email
        const client = await pool.connect();
        try {
            const userResult = await client.query(
                'SELECT user_id FROM luno_users WHERE email = $1',
                [email]
            );

            if (!userResult.rows.length) {
                return res.status(404).json({
                    success: false,
                    message: "User not found with this email address"
                });
            }

            const userId = userResult.rows[0].user_id;

            // Check if user has face data enrolled
            const faceResult = await client.query(
                'SELECT face_embeddings FROM user_face_embeddings WHERE user_id = $1 AND facial_login_enabled = TRUE',
                [userId]
            );

            if (!faceResult.rows.length) {
                return res.status(400).json({
                    success: false,
                    message: "Face recognition not set up for this account. Please use email verification instead."
                });
            }

            // Check if microservice is running
            try {
                await axios.get(`${FACE_MICROSERVICE}/health`, { timeout: 5000 });
            } catch (microserviceError) {
                return res.status(503).json({
                    success: false,
                    message: "Face recognition service is not available. Please try again later."
                });
            }

            // Extract embedding from the provided face image
            const response = await axios.post(`${FACE_MICROSERVICE}/extract-embedding`, {
                images: [faceImage]
            }, {
                timeout: 30000,
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            const inputEmbedding = response.data.embedding;
            if (!inputEmbedding) {
                return res.status(500).json({
                    success: false,
                    message: "Failed to process face image"
                });
            }

            // Get stored embedding
            const storedEmbedding = decryptEmbedding(faceResult.rows[0].face_embeddings);

            // Compare embeddings
            const compareRes = await axios.post(`${FACE_MICROSERVICE}/compare-embedding`, {
                embedding1: inputEmbedding,
                embedding2: storedEmbedding
            });

            const similarity = compareRes.data.similarity;
            const threshold = 0.6; // Adjustable threshold

            if (similarity >= threshold) {
                // Face verification successful - log audit
                await client.query(
                    `INSERT INTO face_login_audit (user_id, success, similarity_score, client_ip, user_agent, notes)
                     VALUES ($1, TRUE, $2, $3, $4, 'password_reset')`,
                    [userId, similarity, req.ip, req.headers['user-agent']]
                );

                // Generate a temporary token for password reset
                const resetToken = crypto.randomBytes(32).toString('hex');
                const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

                await client.query(
                    `INSERT INTO password_reset_tokens (user_id, token, expires_at, verification_method)
                     VALUES ($1, $2, $3, 'face_verification')`,
                    [userId, resetToken, expiresAt]
                );

                return res.json({
                    success: true,
                    message: "Face verification successful",
                    resetToken: resetToken
                });
            } else {
                // Face verification failed - log audit
                await client.query(
                    `INSERT INTO face_login_audit (user_id, success, similarity_score, client_ip, user_agent, notes)
                     VALUES ($1, FALSE, $2, $3, $4, 'password_reset')`,
                    [userId, similarity, req.ip, req.headers['user-agent']]
                );

                return res.status(401).json({
                    success: false,
                    message: "Face verification failed. Please try again or use email verification."
                });
            }

        } finally {
            client.release();
        }

    } catch (error) {
        console.error("Face verification error:", error);
        
        let errorMessage = "Face verification failed.";
        
        if (error.code === 'ECONNREFUSED') {
            errorMessage = "Face recognition service is not available. Please try again later.";
        } else if (error.code === 'ETIMEDOUT') {
            errorMessage = "Face recognition service is taking too long to respond. Please try again.";
        } else if (error.response) {
            errorMessage = `Face recognition service error: ${error.response.status}`;
        } else if (error.message) {
            errorMessage = `Face verification error: ${error.message}`;
        }
        
        res.status(500).json({
            success: false,
            message: errorMessage
        });
    }
};

// API endpoint for password reset with face verification
export const resetPasswordWithFace = async (req, res) => {
    try {
        const { email, resetToken, newPassword, confirmPassword } = req.body;
        
        if (!email || !resetToken || !newPassword || !confirmPassword) {
            return res.status(400).json({
                success: false,
                message: "All fields are required"
            });
        }

        if (newPassword !== confirmPassword) {
            return res.status(400).json({
                success: false,
                message: "Passwords do not match"
            });
        }

        // Validate password strength
        const passwordValidation = passwordResetService.validatePasswordStrength(newPassword);
        if (!passwordValidation.isValid) {
            return res.status(400).json({
                success: false,
                message: passwordValidation.errors.join(", ")
            });
        }

        // Verify the reset token
        const client = await pool.connect();
        try {
            const tokenResult = await client.query(
                `SELECT user_id, expires_at FROM password_reset_tokens 
                 WHERE token = $1 AND verification_method = 'face_verification' AND used = FALSE`,
                [resetToken]
            );

            if (!tokenResult.rows.length) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid or expired reset token"
                });
            }

            const { user_id, expires_at } = tokenResult.rows[0];

            if (new Date() > expires_at) {
                return res.status(400).json({
                    success: false,
                    message: "Reset token has expired"
                });
            }

            // Reset the password
            const result = await passwordResetService.resetPasswordWithToken(resetToken, newPassword);
            
            if (result.success) {
                res.json({
                    success: true,
                    message: "Password reset successful"
                });
            } else {
                res.status(400).json({
                    success: false,
                    message: result.message
                });
            }

        } finally {
            client.release();
        }

    } catch (error) {
        console.error("Password reset with face error:", error);
        res.status(500).json({
            success: false,
            message: "An error occurred. Please try again."
        });
    }
};
