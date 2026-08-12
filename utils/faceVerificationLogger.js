import pool from '../auth/db.js';

/**
 * Bulletproof face verification attempt logger
 * Ensures no null values are ever inserted into face_verification_attempts
 */
export class FaceVerificationLogger {
    /**
     * Log a face verification attempt with comprehensive validation
     * @param {Object} params - The parameters for logging
     * @param {string} params.userId - User ID
     * @param {boolean} params.success - Whether verification was successful
     * @param {number} params.confidenceScore - Confidence score (0-1)
     * @param {number} params.livenessScore - Liveness score (0-1)
     * @param {number} params.processingTime - Processing time in milliseconds
     * @param {Object} params.clientInfo - Client information
     * @param {string} params.errorCode - Error code if applicable
     * @param {string} params.sessionId - Session ID if applicable
     */
    static async logAttempt({
        userId,
        success,
        confidenceScore = 0,
        livenessScore = 0,
        processingTime = 0,
        clientInfo = {},
        errorCode = null,
        sessionId = null
    }) {
        const client = await pool.connect();
        
        try {
            // Comprehensive validation and sanitization
            const validatedData = {
                userId: this.validateUserId(userId),
                success: this.validateBoolean(success),
                confidenceScore: this.validateNumber(confidenceScore, 0, 1),
                livenessScore: this.validateNumber(livenessScore, 0, 1),
                processingTime: this.validateNumber(processingTime, 0, 60000), // Max 60 seconds
                clientIp: this.validateString(clientInfo.ip, 'unknown'),
                userAgent: this.validateString(clientInfo.userAgent, 'unknown'),
                deviceInfo: this.validateObject(clientInfo.deviceInfo, {}),
                errorCode: this.validateString(errorCode, null),
                sessionId: this.validateString(sessionId, null)
            };

            console.log('🔍 Logging face verification attempt:', {
                userId: validatedData.userId,
                success: validatedData.success,
                successType: typeof validatedData.success,
                confidenceScore: validatedData.confidenceScore,
                livenessScore: validatedData.livenessScore,
                processingTime: validatedData.processingTime,
                errorCode: validatedData.errorCode
            });

            // Insert with all required columns
            await client.query(`
                INSERT INTO face_verification_attempts 
                (user_id, success, confidence_score, liveness_score, processing_time_ms, 
                 client_ip, user_agent, device_info, error_code, session_id)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            `, [
                validatedData.userId,
                validatedData.success,
                validatedData.confidenceScore,
                validatedData.livenessScore,
                validatedData.processingTime,
                validatedData.clientIp,
                validatedData.userAgent,
                JSON.stringify(validatedData.deviceInfo),
                validatedData.errorCode,
                validatedData.sessionId
            ]);

            console.log('✅ Face verification attempt logged successfully');
            return true;

        } catch (error) {
            console.error('❌ Error logging face verification attempt:', error);
            console.error('❌ Parameters that caused the error:', {
                userId,
                success,
                confidenceScore,
                livenessScore,
                processingTime,
                errorCode,
                sessionId
            });
            return false;
        } finally {
            client.release();
        }
    }

    /**
     * Validate and sanitize user ID
     */
    static validateUserId(userId) {
        if (!userId) {
            throw new Error('Invalid userId: must be provided');
        }
        
        // Convert to string and trim
        const userIdStr = String(userId).trim();
        
        // Check if it's a valid UUID format
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(userIdStr)) {
            throw new Error(`Invalid userId format: ${userIdStr} is not a valid UUID`);
        }
        
        return userIdStr;
    }

    /**
     * Validate and ensure boolean value
     */
    static validateBoolean(value) {
        if (value === null || value === undefined) {
            return false;
        }
        return Boolean(value);
    }

    /**
     * Validate and sanitize number within range
     */
    static validateNumber(value, min = 0, max = 1) {
        if (value === null || value === undefined || isNaN(value)) {
            return min;
        }
        const num = Number(value);
        return Math.max(min, Math.min(max, num));
    }

    /**
     * Validate and sanitize string
     */
    static validateString(value, defaultValue = '') {
        if (value === null || value === undefined) {
            return defaultValue;
        }
        return String(value).trim() || defaultValue;
    }

    /**
     * Validate and sanitize object
     */
    static validateObject(value, defaultValue = {}) {
        if (value === null || value === undefined) {
            return defaultValue;
        }
        if (typeof value === 'object' && !Array.isArray(value)) {
            return value;
        }
        return defaultValue;
    }

    /**
     * Log a successful verification attempt
     */
    static async logSuccess(userId, confidenceScore, livenessScore, processingTime, clientInfo, sessionId = null) {
        return await this.logAttempt({
            userId,
            success: true,
            confidenceScore,
            livenessScore,
            processingTime,
            clientInfo,
            errorCode: 'SUCCESS',
            sessionId
        });
    }

    /**
     * Log a failed verification attempt
     */
    static async logFailure(userId, errorCode, clientInfo, sessionId = null, confidenceScore = 0, livenessScore = 0, processingTime = 0) {
        return await this.logAttempt({
            userId,
            success: false,
            confidenceScore,
            livenessScore,
            processingTime,
            clientInfo,
            errorCode,
            sessionId
        });
    }

    /**
     * Log an error during verification
     */
    static async logError(userId, error, clientInfo, sessionId = null) {
        return await this.logAttempt({
            userId,
            success: false,
            confidenceScore: 0,
            livenessScore: 0,
            processingTime: 0,
            clientInfo,
            errorCode: 'VERIFICATION_ERROR',
            sessionId
        });
    }
}
