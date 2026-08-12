import anomalyDetection from "../services/anomalyDetection.js";

export const checkTransactionAnomalies = async (req, res, next) => {
    try {
        const { amount, anomalyVerified } = req.body;
        // Defensive checks
        if (!req.user || !req.user.user_id) {
            return res.status(401).json({ success: false, message: "User not authenticated" });
        }
        if (typeof amount === "undefined" || amount === null) {
            return res.status(400).json({ success: false, message: "Amount is required" });
        }
        
        console.log('Anomaly check - Amount:', amount, 'User ID:', req.user.user_id, 'Anomaly Verified:', anomalyVerified);
        
        // If anomaly is already verified, skip anomaly checks
        if (anomalyVerified) {
            console.log('Anomaly already verified, skipping checks');
            return next();
        }
        
        // Determine transaction type from the route
        const transactionType = req.path.includes('deposit') ? 'deposit' : 'withdrawal';
        
        // Get user's IP and location (simplified for demo)
        const userLocation = {
            ip: req.ip || req.connection.remoteAddress,
            country: 'South Africa', // In production, use a geolocation service
            city: 'Johannesburg',
            latitude: -26.2041,
            longitude: 28.0473,
            timezone: 'Africa/Johannesburg'
        };

        // Check for large amount anomalies
        const largeAmountCheck = await anomalyDetection.checkLargeAmount(req.user.user_id, amount, transactionType);
        console.log('Large amount check:', largeAmountCheck);
        
        // Check for rapid transaction anomalies
        const rapidTransactionCheck = await anomalyDetection.checkRapidTransactions(req.user.user_id);
        console.log('Rapid transaction check:', rapidTransactionCheck);
        
        // Check for location change anomalies
        const locationCheck = await anomalyDetection.checkLocationChange(req.user.user_id, userLocation);
        console.log('Location check:', locationCheck);

        // If any anomaly is detected, store it in the request for later handling
        req.anomalies = [];
        if (largeAmountCheck.isAnomaly) req.anomalies.push(largeAmountCheck);
        if (rapidTransactionCheck.isAnomaly) req.anomalies.push(rapidTransactionCheck);
        if (locationCheck.isAnomaly) req.anomalies.push(locationCheck);

        console.log('Total anomalies detected:', req.anomalies.length);

        // Continue to next middleware/route handler
        next();
    } catch (error) {
        console.error('Error checking anomalies:', error);
        // BLOCK TRANSACTION ON ERROR - don't call next()
        return res.status(500).json({
            success: false,
            message: 'Error during anomaly check. Transaction blocked for security.',
            requiresVerification: true
        });
    }
};

export const requireAnomalyVerification = async (req, res, next) => {
    try {
        console.log('Verification middleware - Anomalies:', req.anomalies ? req.anomalies.length : 0);
        
        if (req.anomalies && req.anomalies.length > 0) {
            console.log('Anomalies detected, checking security questions...');
            
            // Check if user has security questions set up
            let hasSecurityQuestions = false;
            try {
                hasSecurityQuestions = await anomalyDetection.hasSecurityQuestions(req.user.user_id);
                console.log('Has security questions:', hasSecurityQuestions);
            } catch (error) {
                console.error('Error checking security questions in middleware:', error);
                return res.status(500).json({
                    success: false,
                    message: 'Unable to verify security settings. Please try again later.',
                    error: 'SECURITY_CHECK_FAILED'
                });
            }
            
            if (!hasSecurityQuestions) {
                console.log('No security questions set up');
                return res.status(403).json({
                    success: false,
                    message: 'Security questions not set up. Please set up security questions in settings first.',
                    requiresSetup: true
                });
            }

            console.log('BLOCKING TRANSACTION - requiring verification');
            // BLOCK THE TRANSACTION - return immediately without calling next()
            return res.status(200).json({
                success: false,
                message: 'Anomaly detected. Please verify this transaction.',
                anomalies: req.anomalies.map(anomaly => ({
                    ...anomaly,
                    anomaly_id: anomaly.anomaly_id || null
                })),
                requiresVerification: true
            });
        }
        
        console.log('No anomalies detected, proceeding with transaction');
        // Only call next() if no anomalies detected
        next();
    } catch (error) {
        console.error('Error in anomaly verification:', error);
        console.error('Error message:', error.message);
        console.error('Error code:', error.code);
        console.error('Error stack:', error.stack);
        // BLOCK TRANSACTION ON ERROR - don't call next()
        return res.status(500).json({
            success: false,
            message: 'Error during verification. Transaction blocked for security.',
            requiresVerification: true
        });
    }
}; 