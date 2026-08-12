import crypto from 'crypto';
import pool from '../auth/db.js';

class QRCodeService {
    constructor() {
        this.pool = pool;
        this.encryptionKey = process.env.QR_ENCRYPTION_KEY || 'default-qr-key-change-in-production';
        this.algorithm = 'aes-256-cbc';
    }

    /**
     * Generate a unique QR code for a user
     * @param {string} userId - User ID
     * @param {string} username - Username for display
     * @returns {Promise<Object>} QR code data
     */
    async generateUserQRCode(userId, username) {
        try {
            // Create a unique identifier combining user ID and timestamp
            const uniqueId = `${userId}_${Date.now()}`;
            
            // Encrypt the unique identifier for security
            const encryptedId = this.encryptData(uniqueId);
            
            // Generate QR code URL using the API
            const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(encryptedId)}`;
            
            // Store QR code data in database
            await this.storeQRCodeData(userId, encryptedId, qrCodeUrl);
            
            return {
                success: true,
                qrCodeUrl,
                encryptedId,
                displayName: username,
                generatedAt: new Date().toISOString()
            };
        } catch (error) {
            console.error('Error generating QR code:', error);
            throw new Error('Failed to generate QR code');
        }
    }

    /**
     * Validate and decode a scanned QR code
     * @param {string} scannedData - Data from scanned QR code
     * @returns {Promise<Object>} Decoded user information
     */
    async validateAndDecodeQRCode(scannedData) {
        try {
            // Decrypt the scanned data
            const decryptedData = this.decryptData(scannedData);
            
            if (!decryptedData) {
                throw new Error('Invalid QR code data');
            }

            // Extract user ID from decrypted data
            const userId = decryptedData.split('_')[0];
            
            if (!userId) {
                throw new Error('Invalid user ID in QR code');
            }

            // Look up user in database
            const user = await this.getUserByQRCode(userId);
            
            if (!user) {
                throw new Error('User not found');
            }

            return {
                success: true,
                userId: user.user_id,
                username: user.username,
                displayName: user.username,
                accountNumber: user.account_number,
                isValid: true
            };
        } catch (error) {
            console.error('Error validating QR code:', error);
            return {
                success: false,
                error: error.message,
                isValid: false
            };
        }
    }

    /**
     * Get user's current QR code
     * @param {string} userId - User ID
     * @returns {Promise<Object>} User's QR code data
     */
    async getUserQRCode(userId) {
        const client = await this.pool.connect();
        try {
            const result = await client.query(`
                SELECT qr_code_url, encrypted_id, created_at, is_active
                FROM user_qr_codes 
                WHERE user_id = $1 AND is_active = true
                ORDER BY created_at DESC 
                LIMIT 1
            `, [userId]);

            if (result.rows.length === 0) {
                // Generate new QR code if none exists
                const user = await this.getUserById(userId);
                if (!user) {
                    throw new Error('User not found');
                }
                return await this.generateUserQRCode(userId, user.username);
            }

            return {
                success: true,
                qrCodeUrl: result.rows[0].qr_code_url,
                encryptedId: result.rows[0].encrypted_id,
                displayName: result.rows[0].username,
                generatedAt: result.rows[0].created_at
            };
        } catch (error) {
            console.error('Error getting user QR code:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Regenerate QR code for a user (deactivates old one)
     * @param {string} userId - User ID
     * @returns {Promise<Object>} New QR code data
     */
    async regenerateUserQRCode(userId) {
        const client = await this.pool.connect();
        try {
            // Deactivate existing QR codes
            await client.query(`
                UPDATE user_qr_codes 
                SET is_active = false, updated_at = CURRENT_TIMESTAMP
                WHERE user_id = $1
            `, [userId]);

            // Generate new QR code
            const user = await this.getUserById(userId);
            if (!user) {
                throw new Error('User not found');
            }

            return await this.generateUserQRCode(userId, user.username);
        } catch (error) {
            console.error('Error regenerating QR code:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Encrypt data using AES-256-CBC
     * @param {string} data - Data to encrypt
     * @returns {string} Encrypted data
     */
    encryptData(data) {
        try {
            const iv = crypto.randomBytes(16);
            const cipher = crypto.createCipher(this.algorithm, this.encryptionKey);
            let encrypted = cipher.update(data, 'utf8', 'hex');
            encrypted += cipher.final('hex');
            return iv.toString('hex') + ':' + encrypted;
        } catch (error) {
            console.error('Error encrypting data:', error);
            throw new Error('Encryption failed');
        }
    }

    /**
     * Decrypt data using AES-256-CBC
     * @param {string} encryptedData - Encrypted data
     * @returns {string} Decrypted data
     */
    decryptData(encryptedData) {
        try {
            const parts = encryptedData.split(':');
            if (parts.length !== 2) {
                throw new Error('Invalid encrypted data format');
            }
            
            const iv = Buffer.from(parts[0], 'hex');
            const encrypted = parts[1];
            const decipher = crypto.createDecipher(this.algorithm, this.encryptionKey);
            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            return decrypted;
        } catch (error) {
            console.error('Error decrypting data:', error);
            return null;
        }
    }

    /**
     * Store QR code data in database
     * @param {string} userId - User ID
     * @param {string} encryptedId - Encrypted unique ID
     * @param {string} qrCodeUrl - QR code URL
     */
    async storeQRCodeData(userId, encryptedId, qrCodeUrl) {
        const client = await this.pool.connect();
        try {
            await client.query(`
                INSERT INTO user_qr_codes (user_id, encrypted_id, qr_code_url, is_active, created_at, updated_at)
                VALUES ($1, $2, $3, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            `, [userId, encryptedId, qrCodeUrl]);
        } catch (error) {
            console.error('Error storing QR code data:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get user by QR code lookup
     * @param {string} userId - User ID
     * @returns {Promise<Object>} User data
     */
    async getUserByQRCode(userId) {
        const client = await this.pool.connect();
        try {
            const result = await client.query(`
                SELECT user_id, username, email, account_number, is_active
                FROM luno_users 
                WHERE user_id = $1 AND is_active = true
            `, [userId]);

            return result.rows[0] || null;
        } catch (error) {
            console.error('Error getting user by QR code:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get user by ID
     * @param {string} userId - User ID
     * @returns {Promise<Object>} User data
     */
    async getUserById(userId) {
        const client = await this.pool.connect();
        try {
            const result = await client.query(`
                SELECT user_id, username, email, account_number, is_active
                FROM luno_users 
                WHERE user_id = $1
            `, [userId]);

            return result.rows[0] || null;
        } catch (error) {
            console.error('Error getting user by ID:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Validate QR code security
     * @param {string} encryptedId - Encrypted ID from QR code
     * @returns {Promise<boolean>} Is valid
     */
    async validateQRCodeSecurity(encryptedId) {
        try {
            const decryptedData = this.decryptData(encryptedId);
            if (!decryptedData) return false;

            const userId = decryptedData.split('_')[0];
            const user = await this.getUserById(userId);
            
            return user && user.is_active;
        } catch (error) {
            console.error('Error validating QR code security:', error);
            return false;
        }
    }
}

export default new QRCodeService();
