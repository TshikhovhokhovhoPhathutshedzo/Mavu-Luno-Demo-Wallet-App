import pool from '../auth/db.js';
import crypto from 'crypto';

// Generate QR code for user
export const generateQRCode = async (req, res) => {
    const client = await pool.connect();
    const user_id = req.user.user_id;
    
    try {
        console.log('🔗 Generating QR code for user:', user_id);
        
        // Get user details
        const userResult = await client.query(
            'SELECT user_id, username, account_number FROM luno_users WHERE user_id = $1',
            [user_id]
        );
        
        if (userResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        
        const user = userResult.rows[0];
        
        // Create unique identifier for QR code
        // Using user_id + timestamp + random string for uniqueness
        const timestamp = Date.now();
        const randomString = crypto.randomBytes(8).toString('hex');
        const uniqueId = `${user.user_id}-${timestamp}-${randomString}`;
        
        // Encrypt the unique identifier for security
        const algorithm = 'aes-256-cbc';
        const secretKey = process.env.QR_SECRET_KEY || 'luno-qr-secret-key-2024';
        
        let encryptedData;
        try {
            const key = crypto.scryptSync(secretKey, 'salt', 32); // Generate proper key
            const iv = crypto.randomBytes(16);
            const cipher = crypto.createCipheriv(algorithm, key, iv);
            let encrypted = cipher.update(uniqueId, 'utf8', 'hex');
            encrypted += cipher.final('hex');
            
            // Store IV with encrypted data
            encryptedData = iv.toString('hex') + ':' + encrypted;
        } catch (cryptoError) {
            console.error('❌ Crypto encryption error:', cryptoError);
            throw new Error('Failed to encrypt QR code data');
        }
        
        // Store QR code data in database
        const qrResult = await client.query(
            `INSERT INTO user_qr_codes (user_id, qr_identifier, encrypted_data, is_active, created_at) 
             VALUES ($1, $2, $3, true, NOW()) 
             ON CONFLICT (user_id) 
             DO UPDATE SET 
                qr_identifier = EXCLUDED.qr_identifier,
                encrypted_data = EXCLUDED.encrypted_data,
                is_active = true,
                updated_at = NOW()
             RETURNING qr_id`,
            [user_id, uniqueId, encryptedData]
        );
        
        // Generate QR code URL using qrserver.com API
        const qrData = encodeURIComponent(encryptedData);
        const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${qrData}`;
        
        console.log('✅ QR code generated successfully:', {
            user_id,
            username: user.username,
            qr_id: qrResult.rows[0].qr_id
        });
        
        res.json({
            success: true,
            qrCodeUrl,
            userId: user.user_id,
            username: user.username,
            accountNumber: user.account_number,
            qrId: qrResult.rows[0].qr_id
        });
        
    } catch (error) {
        console.error('Error generating QR code:', error);
        res.status(500).json({
            success: false,
            message: 'Error generating QR code'
        });
    } finally {
        client.release();
    }
};

// Scan QR code and identify recipient
export const scanQRCode = async (req, res) => {
    const client = await pool.connect();
    
    try {
        const { qrData } = req.body;
        
        console.log('📷 Scanning QR code:', { qrData: qrData ? 'Present' : 'Missing' });
        
        if (!qrData) {
            return res.status(400).json({
                success: false,
                message: 'QR code data is required'
            });
        }
        
        // Decrypt the QR code data
        const algorithm = 'aes-256-cbc';
        const secretKey = process.env.QR_SECRET_KEY || 'luno-qr-secret-key-2024';
        const key = crypto.scryptSync(secretKey, 'salt', 32); // Generate proper key
        
        try {
            // Split IV and encrypted data
            const [ivHex, encrypted] = qrData.split(':');
            if (!ivHex || !encrypted) {
                throw new Error('Invalid QR code format');
            }
            
            const iv = Buffer.from(ivHex, 'hex');
            const decipher = crypto.createDecipheriv(algorithm, key, iv);
            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            // Extract user_id from decrypted data
            // Format: user_id-timestamp-randomString
            // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
            const parts = decrypted.split('-');
            if (parts.length < 5) {
                throw new Error('Invalid QR code format - missing UUID parts');
            }
            
            // Reconstruct the full UUID (first 5 parts)
            const user_id = parts.slice(0, 5).join('-');
            
            console.log('🔍 Decrypted QR data:', { user_id, decrypted });
            
            // Verify QR code exists and is active
            const qrResult = await client.query(
                `SELECT qr_id, user_id, is_active, created_at 
                 FROM user_qr_codes 
                 WHERE user_id = $1 AND is_active = true 
                 ORDER BY created_at DESC 
                 LIMIT 1`,
                [user_id]
            );
            
            if (qrResult.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Invalid QR code - not found in database'
                });
            }
            
            const qrCode = qrResult.rows[0];
            
            // Get recipient user details
            const userResult = await client.query(
                `SELECT user_id, username, first_name, last_name, account_number, is_active 
                 FROM luno_users 
                 WHERE user_id = $1`,
                [user_id]
            );
            
            if (userResult.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Recipient user not found'
                });
            }
            
            const recipient = userResult.rows[0];
            
            // Check if recipient is active
            if (!recipient.is_active) {
                return res.status(400).json({
                    success: false,
                    message: 'Recipient account is inactive'
                });
            }
            
            console.log('✅ QR code scan successful:', {
                qr_id: qrCode.qr_id,
                recipient_id: recipient.user_id,
                recipient_username: recipient.username
            });
            
            res.json({
                success: true,
                recipient: {
                    user_id: recipient.user_id,
                    username: recipient.username,
                    name: `${recipient.first_name || ''} ${recipient.last_name || ''}`.trim() || recipient.username,
                    account_number: recipient.account_number,
                    is_active: recipient.is_active
                }
            });
            
        } catch (decryptError) {
            console.error('Error decrypting QR code:', decryptError);
            return res.status(400).json({
                success: false,
                message: 'Invalid QR code format'
            });
        }
        
    } catch (error) {
        console.error('Error scanning QR code:', error);
        res.status(500).json({
            success: false,
            message: 'Error scanning QR code'
        });
    } finally {
        client.release();
    }
};

// Lookup recipient by ID or username
export const lookupRecipient = async (req, res) => {
    const client = await pool.connect();
    
    try {
        const { recipientId } = req.body;
        
        console.log('🔍 Looking up recipient:', { recipientId });
        
        if (!recipientId) {
            return res.status(400).json({
                success: false,
                message: 'Recipient ID is required'
            });
        }
        
        // Check if recipientId is a valid UUID format
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const isUUID = uuidRegex.test(recipientId);
        
        let userResult;
        if (isUUID) {
            // Search by user_id if it's a valid UUID
            userResult = await client.query(
                `SELECT user_id, username, first_name, last_name, account_number, is_active 
                 FROM luno_users 
                 WHERE user_id = $1`,
                [recipientId]
            );
        } else {
            // Search by username if it's not a UUID
            userResult = await client.query(
                `SELECT user_id, username, first_name, last_name, account_number, is_active 
                 FROM luno_users 
                 WHERE username = $1`,
                [recipientId]
            );
        }
        
        if (userResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Recipient not found'
            });
        }
        
        const recipient = userResult.rows[0];
        
        // Check if recipient is active
        if (!recipient.is_active) {
            return res.status(400).json({
                success: false,
                message: 'Recipient account is inactive'
            });
        }
        
        console.log('✅ Recipient lookup successful:', {
            recipient_id: recipient.user_id,
            recipient_username: recipient.username
        });
        
        res.json({
            success: true,
            recipient: {
                user_id: recipient.user_id,
                username: recipient.username,
                name: `${recipient.first_name || ''} ${recipient.last_name || ''}`.trim() || recipient.username,
                account_number: recipient.account_number,
                is_active: recipient.is_active
            }
        });
        
    } catch (error) {
        console.error('Error looking up recipient:', error);
        res.status(500).json({
            success: false,
            message: 'Error looking up recipient'
        });
    } finally {
        client.release();
    }
};

// Get QR code status for user
export const getQRStatus = async (req, res) => {
    const client = await pool.connect();
    const user_id = req.user.user_id;
    
    try {
        console.log('🔍 Getting QR status for user:', user_id);
        
        const qrResult = await client.query(
            `SELECT qr_id, qr_identifier, is_active, created_at, updated_at 
             FROM user_qr_codes 
             WHERE user_id = $1 
             ORDER BY created_at DESC 
             LIMIT 1`,
            [user_id]
        );
        
        if (qrResult.rows.length === 0) {
            return res.json({
                success: true,
                hasQRCode: false,
                message: 'No QR code found'
            });
        }
        
        const qrCode = qrResult.rows[0];
        
        res.json({
            success: true,
            hasQRCode: true,
            qrCode: {
                qr_id: qrCode.qr_id,
                is_active: qrCode.is_active,
                created_at: qrCode.created_at,
                updated_at: qrCode.updated_at
            }
        });
        
    } catch (error) {
        console.error('Error getting QR status:', error);
        res.status(500).json({
            success: false,
            message: 'Error getting QR status'
        });
    } finally {
        client.release();
    }
};

// Deactivate QR code
export const deactivateQRCode = async (req, res) => {
    const client = await pool.connect();
    const user_id = req.user.user_id;
    
    try {
        console.log('🔒 Deactivating QR code for user:', user_id);
        
        const result = await client.query(
            'UPDATE user_qr_codes SET is_active = false, updated_at = NOW() WHERE user_id = $1',
            [user_id]
        );
        
        if (result.rowCount === 0) {
            return res.status(404).json({
                success: false,
                message: 'No QR code found to deactivate'
            });
        }
        
        console.log('✅ QR code deactivated successfully');
        
        res.json({
            success: true,
            message: 'QR code deactivated successfully'
        });
        
    } catch (error) {
        console.error('Error deactivating QR code:', error);
        res.status(500).json({
            success: false,
            message: 'Error deactivating QR code'
        });
    } finally {
        client.release();
    }
};
