import pool from "../auth/db.js";
import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";
import crypto from "crypto";

class PasswordResetService {
    constructor() {
        this.CODE_EXPIRY_MINUTES = 10;
        this.MAX_ATTEMPTS_PER_HOUR = 10; // Increased to 10 attempts per hour
    }

    // Generate a secure 6-digit code
    generateResetCode() {
        return crypto.randomInt(100000, 999999).toString();
    }

    // Create email transporter
    createEmailTransporter() {
        return nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });
    }

    // Send reset code email
    async sendResetEmail(email, resetCode, username) {
        const transporter = this.createEmailTransporter();
        
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Password Reset Code - LunoBackend',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <div style="background: linear-gradient(135deg, #2563eb 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 10px; text-align: center;">
                        <h1 style="margin: 0;">🔐 Password Reset</h1>
                    </div>
                    
                    <div style="background: #f8f9fa; padding: 30px; border-radius: 10px; margin-top: 20px;">
                        <h2 style="color: #333; margin-bottom: 20px;">Hello ${username},</h2>
                        
                        <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
                            We received a request to reset your password. Use the security code below to complete your password reset:
                        </p>
                        
                        <div style="background: #e9ecef; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
                            <h1 style="color: #2563eb; font-size: 32px; margin: 0; letter-spacing: 5px; font-family: 'Courier New', monospace;">
                                ${resetCode}
                            </h1>
                        </div>
                        
                        <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
                            <strong>Important:</strong>
                        </p>
                        <ul style="color: #666; line-height: 1.6; margin-bottom: 20px;">
                            <li>This code will expire in ${this.CODE_EXPIRY_MINUTES} minutes</li>
                            <li>If you didn't request this reset, please ignore this email</li>
                            <li>Never share this code with anyone</li>
                        </ul>
                        
                        <div style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0;">
                            <p style="color: #856404; margin: 0; font-size: 14px;">
                                <strong>Security Tip:</strong> For your safety, this code can only be used once and will expire automatically.
                            </p>
                        </div>
                    </div>
                    
                    <div style="text-align: center; margin-top: 20px; color: #999; font-size: 12px;">
                        <p>This is an automated message. Please do not reply to this email.</p>
                        <p>&copy; 2024 LunoBackend. All rights reserved.</p>
                    </div>
                </div>
            `
        };

        try {
            await transporter.sendMail(mailOptions);
            return { success: true };
        } catch (error) {
            console.error('Email sending error:', error);
            return { success: false, error: error.message };
        }
    }

    // Check if user has exceeded reset attempts
    async checkResetAttempts(email) {
        const client = await pool.connect();
        try {
            const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
            
            const result = await client.query(`
                SELECT COUNT(*) as attempt_count
                FROM password_reset_codes
                WHERE email = $1 AND created_at > $2 AND used = FALSE
            `, [email, oneHourAgo]);

            return parseInt(result.rows[0].attempt_count) < this.MAX_ATTEMPTS_PER_HOUR;
        } catch (error) {
            console.error('Error checking reset attempts:', error);
            return false;
        } finally {
            client.release();
        }
    }

    // Request password reset
    async requestPasswordReset(email) {
        const client = await pool.connect();
        try {
            // Check if email exists (but don't reveal it)
            const userResult = await client.query(
                "SELECT user_id, username FROM luno_users WHERE email = $1",
                [email]
            );

            if (userResult.rows.length === 0) {
                // Don't reveal if email exists - return success anyway
                return { success: true, message: "If an account exists with this email, we have sent a reset code." };
            }

            const user = userResult.rows[0];

            // Check if user has exceeded reset attempts
            const canReset = await this.checkResetAttempts(email);
            if (!canReset) {
                return { 
                    success: false, 
                    message: "Too many reset attempts. Please wait 1 hour before trying again. You can also try using a different email address." 
                };
            }

            // Generate reset code
            const resetCode = this.generateResetCode();
            const expiresAt = new Date(Date.now() + this.CODE_EXPIRY_MINUTES * 60 * 1000);

            // Store reset code in database
            await client.query(`
                INSERT INTO password_reset_codes (user_id, email, reset_code, expires_at)
                VALUES ($1, $2, $3, $4)
            `, [user.user_id, email, resetCode, expiresAt]);

            // Send email
            const emailResult = await this.sendResetEmail(email, resetCode, user.username);

            if (emailResult.success) {
                return { 
                    success: true, 
                    message: "If an account exists with this email, we have sent a reset code." 
                };
            } else {
                return { 
                    success: false, 
                    message: "Failed to send reset email. Please try again later." 
                };
            }

        } catch (error) {
            console.error('Password reset request error:', error);
            return { 
                success: false, 
                message: "An error occurred. Please try again later." 
            };
        } finally {
            client.release();
        }
    }

    // Verify reset code
    async verifyResetCode(email, resetCode) {
        const client = await pool.connect();
        try {
            const result = await client.query(`
                SELECT prc.*, u.username
                FROM password_reset_codes prc
                JOIN luno_users u ON prc.user_id = u.user_id
                WHERE prc.email = $1 
                AND prc.reset_code = $2 
                AND prc.expires_at > NOW()
                AND prc.used = FALSE
                ORDER BY prc.created_at DESC
                LIMIT 1
            `, [email, resetCode]);

            if (result.rows.length === 0) {
                return { 
                    success: false, 
                    message: "Invalid or expired reset code. Please request a new one." 
                };
            }

            return { 
                success: true, 
                resetId: result.rows[0].id,
                userId: result.rows[0].user_id,
                username: result.rows[0].username
            };

        } catch (error) {
            console.error('Reset code verification error:', error);
            return { 
                success: false, 
                message: "An error occurred. Please try again." 
            };
        } finally {
            client.release();
        }
    }

    // Reset password
    async resetPassword(resetId, newPassword) {
        const client = await pool.connect();
        try {
            // Get reset record
            const resetResult = await client.query(`
                SELECT prc.*, u.user_id
                FROM password_reset_codes prc
                JOIN luno_users u ON prc.user_id = u.user_id
                WHERE prc.id = $1 AND prc.used = FALSE
            `, [resetId]);

            if (resetResult.rows.length === 0) {
                return { 
                    success: false, 
                    message: "Invalid reset request. Please try again." 
                };
            }

            const resetRecord = resetResult.rows[0];

            // Hash new password
            const saltRounds = 10;
            const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

            // Start transaction
            await client.query("BEGIN");

            // Update user password
            await client.query(`
                UPDATE luno_users 
                SET user_password = $1 
                WHERE user_id = $2
            `, [hashedPassword, resetRecord.user_id]);

            // Mark reset code as used
            await client.query(`
                UPDATE password_reset_codes 
                SET used = TRUE, used_at = NOW() 
                WHERE id = $1
            `, [resetId]);

            // Invalidate all other reset codes for this user
            await client.query(`
                UPDATE password_reset_codes 
                SET used = TRUE 
                WHERE user_id = $1 AND used = FALSE
            `, [resetRecord.user_id]);

            // Commit transaction
            await client.query("COMMIT");

            return { 
                success: true, 
                message: "Password has been reset successfully!" 
            };

        } catch (error) {
            await client.query("ROLLBACK");
            console.error('Password reset error:', error);
            return { 
                success: false, 
                message: "An error occurred while resetting your password. Please try again." 
            };
        } finally {
            client.release();
        }
    }

    // Validate password strength
    validatePasswordStrength(password) {
        const minLength = 8;
        const hasUpperCase = /[A-Z]/.test(password);
        const hasLowerCase = /[a-z]/.test(password);
        const hasNumbers = /\d/.test(password);
        const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

        const errors = [];
        
        if (password.length < minLength) {
            errors.push(`Password must be at least ${minLength} characters long`);
        }
        if (!hasUpperCase) {
            errors.push("Password must contain at least one uppercase letter");
        }
        if (!hasLowerCase) {
            errors.push("Password must contain at least one lowercase letter");
        }
        if (!hasNumbers) {
            errors.push("Password must contain at least one number");
        }
        if (!hasSpecialChar) {
            errors.push("Password must contain at least one special character");
        }

        return {
            isValid: errors.length === 0,
            errors: errors
        };
    }

    // Clean up expired reset codes
    async cleanupExpiredCodes() {
        const client = await pool.connect();
        try {
            await client.query(`
                DELETE FROM password_reset_codes 
                WHERE expires_at < NOW() OR used = TRUE
            `);
        } catch (error) {
            console.error('Error cleaning up expired codes:', error);
        } finally {
            client.release();
        }
    }

    // Reset password using a token (for face verification)
    async resetPasswordWithToken(token, newPassword) {
        const client = await pool.connect();
        try {
            // Start transaction
            await client.query("BEGIN");

            // Get the reset token record
            const tokenResult = await client.query(`
                SELECT user_id, expires_at 
                FROM password_reset_tokens 
                WHERE token = $1 AND used = FALSE
            `, [token]);

            if (!tokenResult.rows.length) {
                return { 
                    success: false, 
                    message: "Invalid or expired reset token." 
                };
            }

            const { user_id, expires_at } = tokenResult.rows[0];

            // Check if token has expired
            if (new Date() > expires_at) {
                return { 
                    success: false, 
                    message: "Reset token has expired." 
                };
            }

            // Hash the new password
            const saltRounds = 12;
            const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

            // Update user's password
            await client.query(`
                UPDATE luno_users 
                SET user_password = $1, updated_at = NOW() 
                WHERE user_id = $2
            `, [hashedPassword, user_id]);

            // Mark token as used
            await client.query(`
                UPDATE password_reset_tokens 
                SET used = TRUE, used_at = NOW() 
                WHERE token = $1
            `, [token]);

            // Invalidate all other reset tokens for this user
            await client.query(`
                UPDATE password_reset_tokens 
                SET used = TRUE 
                WHERE user_id = $1 AND used = FALSE
            `, [user_id]);

            // Commit transaction
            await client.query("COMMIT");

            return { 
                success: true, 
                message: "Password has been reset successfully!" 
            };

        } catch (error) {
            await client.query("ROLLBACK");
            console.error('Password reset with token error:', error);
            return { 
                success: false, 
                message: "An error occurred while resetting your password. Please try again." 
            };
        } finally {
            client.release();
        }
    }

    // Clear reset attempts for a specific email (for testing/debugging)
    async clearResetAttempts(email) {
        const client = await pool.connect();
        try {
            await client.query(`
                DELETE FROM password_reset_codes 
                WHERE email = $1
            `, [email]);
            return { success: true, message: "Reset attempts cleared for this email." };
        } catch (error) {
            console.error('Error clearing reset attempts:', error);
            return { success: false, message: "Failed to clear reset attempts." };
        } finally {
            client.release();
        }
    }
}

export default new PasswordResetService();
