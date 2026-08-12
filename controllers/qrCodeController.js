import QRCodeService from '../services/qrCodeService.js';

/**
 * Generate QR code for current user
 */
export const generateQRCode = async (req, res) => {
    try {
        const userId = req.user.user_id;
        const username = req.user.username;

        const result = await QRCodeService.generateUserQRCode(userId, username);
        
        res.json({
            success: true,
            message: 'QR code generated successfully',
            data: result
        });
    } catch (error) {
        console.error('Error generating QR code:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to generate QR code',
            error: error.message
        });
    }
};

/**
 * Get user's current QR code
 */
export const getUserQRCode = async (req, res) => {
    try {
        const userId = req.user.user_id;
        
        const result = await QRCodeService.getUserQRCode(userId);
        
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Error getting user QR code:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get QR code',
            error: error.message
        });
    }
};

/**
 * Regenerate QR code for current user
 */
export const regenerateQRCode = async (req, res) => {
    try {
        const userId = req.user.user_id;
        
        const result = await QRCodeService.regenerateUserQRCode(userId);
        
        res.json({
            success: true,
            message: 'QR code regenerated successfully',
            data: result
        });
    } catch (error) {
        console.error('Error regenerating QR code:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to regenerate QR code',
            error: error.message
        });
    }
};

/**
 * Validate scanned QR code
 */
export const validateQRCode = async (req, res) => {
    try {
        const { qrData } = req.body;
        
        if (!qrData) {
            return res.status(400).json({
                success: false,
                message: 'QR code data is required'
            });
        }

        const result = await QRCodeService.validateAndDecodeQRCode(qrData);
        
        if (result.success) {
            res.json({
                success: true,
                message: 'QR code validated successfully',
                data: {
                    userId: result.userId,
                    username: result.username,
                    displayName: result.displayName,
                    accountNumber: result.accountNumber,
                    isValid: result.isValid
                }
            });
        } else {
            res.status(400).json({
                success: false,
                message: 'Invalid QR code',
                error: result.error
            });
        }
    } catch (error) {
        console.error('Error validating QR code:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to validate QR code',
            error: error.message
        });
    }
};

/**
 * Get QR code page
 */
export const getQRCodePage = async (req, res) => {
    try {
        res.render('qr-code', {
            active: 'qr-code',
            user: req.user
        });
    } catch (error) {
        console.error('Error getting QR code page:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load QR code page',
            error: error.message
        });
    }
};

/**
 * Get QR scanner page
 */
export const getQRScannerPage = async (req, res) => {
    try {
        res.render('qr-scanner', {
            active: 'qr-scanner',
            user: req.user
        });
    } catch (error) {
        console.error('Error getting QR scanner page:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load QR scanner page',
            error: error.message
        });
    }
};

/**
 * Get QR code statistics (admin only)
 */
export const getQRCodeStats = async (req, res) => {
    try {
        const client = await pool.connect();
        
        try {
            const result = await client.query('SELECT * FROM get_qr_code_stats()');
            
            res.json({
                success: true,
                data: result.rows[0]
            });
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Error getting QR code stats:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get QR code statistics',
            error: error.message
        });
    }
};
