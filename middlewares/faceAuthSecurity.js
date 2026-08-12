import rateLimit from 'express-rate-limit';

// Rate limiting for face authentication attempts
export const faceAuthRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // Limit each IP to 10 face auth attempts per windowMs
    message: {
        success: false,
        message: 'Too many face authentication attempts, please try again later'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
        // Skip rate limiting for successful authentications
        return req.session && req.session.faceAuthenticated;
    }
});

// Security middleware for face authentication
export const faceAuthSecurity = (req, res, next) => {
    // Check if this is a face authentication request
    if (req.path.includes('/deepface-auth/') && req.method === 'POST') {
        // Validate request headers
        if (!req.headers['content-type'] || !req.headers['content-type'].includes('application/json')) {
            return res.status(400).json({
                success: false,
                message: 'Invalid content type for face authentication'
            });
        }
        
        // Check for suspicious patterns
        const userAgent = req.headers['user-agent'] || '';
        if (userAgent.length < 10 || userAgent.includes('bot') || userAgent.includes('crawler')) {
            console.log('Suspicious user agent detected:', userAgent);
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }
        
        // Validate image data if present
        if (req.body && req.body.imageData) {
            const imageData = req.body.imageData;
            if (!imageData.startsWith('data:image/') || !imageData.includes('base64,')) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid image data format'
                });
            }
            
            // Check image size (prevent extremely large images)
            const base64Data = imageData.split(',')[1];
            const imageSize = (base64Data.length * 3) / 4; // Approximate size in bytes
            const maxImageSize = 10 * 1024 * 1024; // 10MB limit
            
            if (imageSize > maxImageSize) {
                return res.status(400).json({
                    success: false,
                    message: 'Image too large'
                });
            }
        }
    }
    
    next();
};

// Session security for face authentication
export const faceAuthSessionSecurity = (req, res, next) => {
    // If user is authenticated via face, add additional security checks
    if (req.session && req.session.faceAuthenticated) {
        // Check if session is from a different IP (basic security)
        const currentIP = req.ip || req.connection.remoteAddress;
        if (req.session.faceAuthIP && req.session.faceAuthIP !== currentIP) {
            console.log('Face auth session IP mismatch, clearing session');
            req.session.faceAuthenticated = false;
            req.session.faceAuthTime = null;
            req.session.faceAuthMethod = null;
            req.session.faceAuthIP = null;
            return res.redirect('/authorized/login');
        }
        
        // Store IP for future checks
        if (!req.session.faceAuthIP) {
            req.session.faceAuthIP = currentIP;
        }
        
        // Check if face auth is still valid (within time limit)
        if (req.session.faceAuthTime) {
            const faceAuthAge = Date.now() - req.session.faceAuthTime;
            const maxFaceAuthAge = 5 * 60 * 1000; // 5 minutes
            
            if (faceAuthAge > maxFaceAuthAge) {
                console.log('Face auth session expired, clearing');
                req.session.faceAuthenticated = false;
                req.session.faceAuthTime = null;
                req.session.faceAuthMethod = null;
                req.session.faceAuthIP = null;
                return res.redirect('/authorized/login');
            }
        }
    }
    
    next();
};
