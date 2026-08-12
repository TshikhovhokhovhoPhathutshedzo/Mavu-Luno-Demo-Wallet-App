import pool from "../auth/db.js";
import crypto from "crypto";

class BehavioralBiometrics {
    constructor() {
        this.patternTypes = {
            'swipe': 'Swipe Pattern',
            'tap': 'Tap Pattern', 
            'draw': 'Draw Pattern',
            'gesture': 'Gesture Pattern',
            'typing': 'Typing Pattern'
        };
        this.verificationThreshold = 0.85; // 85% similarity required
    }

    // Setup behavioral biometrics for a user
    async setupBiometrics(userId, patternType, patternData) {
        const client = await pool.connect();
        
        try {
            // Validate pattern type
            if (!this.patternTypes[patternType]) {
                throw new Error('Invalid pattern type');
            }

            // Validate pattern data
            if (!this.validatePatternData(patternType, patternData)) {
                throw new Error('Invalid pattern data');
            }

            // Generate pattern hash
            const patternHash = this.generatePatternHash(patternData);
            
            // Store pattern in database
            await client.query(`
                INSERT INTO behavioral_patterns (
                    user_id,
                    pattern_type,
                    pattern_data,
                    pattern_hash,
                    is_active,
                    created_at
                ) VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (user_id, pattern_type) 
                DO UPDATE SET 
                    pattern_data = EXCLUDED.pattern_data,
                    pattern_hash = EXCLUDED.pattern_hash,
                    is_active = EXCLUDED.is_active,
                    updated_at = CURRENT_TIMESTAMP
            `, [
                userId,
                patternType,
                JSON.stringify(patternData),
                patternHash,
                true,
                new Date().toISOString()
            ]);

            console.log(`✅ Behavioral biometrics setup for user ${userId}: ${patternType}`);
            
            return {
                success: true,
                patternType: patternType,
                message: 'Behavioral biometrics setup successfully'
            };

        } catch (error) {
            console.error('Error setting up behavioral biometrics:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    // Verify user's behavioral pattern
    async verifyPattern(userId, patternType, inputPattern) {
        const client = await pool.connect();
        
        try {
            // Get stored pattern
            const result = await client.query(`
                SELECT pattern_data, pattern_hash
                FROM behavioral_patterns
                WHERE user_id = $1 
                AND pattern_type = $2 
                AND is_active = true
            `, [userId, patternType]);

            if (result.rows.length === 0) {
                return {
                    verified: false,
                    message: 'No pattern found for this user'
                };
            }

            const storedPattern = typeof result.rows[0].pattern_data === 'string' 
                ? JSON.parse(result.rows[0].pattern_data) 
                : result.rows[0].pattern_data;
            const storedHash = result.rows[0].pattern_hash;

            // Calculate similarity score
            const similarityScore = this.calculateSimilarity(patternType, storedPattern, inputPattern);
            
            // Verify against threshold
            const verified = similarityScore >= this.verificationThreshold;

            // Log verification attempt
            await this.logVerificationAttempt(userId, patternType, verified, similarityScore);

            return {
                verified: verified,
                similarity: similarityScore,
                threshold: this.verificationThreshold,
                message: verified ? 'Pattern verified successfully' : 'Pattern verification failed'
            };

        } catch (error) {
            console.error('Error verifying pattern:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    // Calculate similarity between stored and input patterns
    calculateSimilarity(patternType, storedPattern, inputPattern) {
        switch (patternType) {
            case 'swipe':
                return this.calculateSwipeSimilarity(storedPattern, inputPattern);
            case 'tap':
                return this.calculateTapSimilarity(storedPattern, inputPattern);
            case 'draw':
                return this.calculateDrawSimilarity(storedPattern, inputPattern);
            case 'gesture':
                return this.calculateGestureSimilarity(storedPattern, inputPattern);
            case 'typing':
                return this.calculateTypingSimilarity(storedPattern, inputPattern);
            default:
                return 0;
        }
    }

    // Calculate swipe pattern similarity
    calculateSwipeSimilarity(storedPattern, inputPattern) {
        const storedCoords = storedPattern.coordinates || [];
        const inputCoords = inputPattern.coordinates || [];
        const storedTiming = storedPattern.timing || [];
        const inputTiming = inputPattern.timing || [];

        if (storedCoords.length === 0 || inputCoords.length === 0) {
            return 0;
        }

        // Calculate direction similarity
        const storedDirection = this.calculateSwipeDirection(storedCoords);
        const inputDirection = this.calculateSwipeDirection(inputCoords);
        const directionSimilarity = this.calculateDirectionSimilarity(storedDirection, inputDirection);

        // Calculate speed similarity (using timing data)
        const storedSpeed = storedTiming.length > 0 ? storedTiming.reduce((a, b) => a + b, 0) / storedTiming.length : 0;
        const inputSpeed = inputTiming.length > 0 ? inputTiming.reduce((a, b) => a + b, 0) / inputTiming.length : 0;
        const speedSimilarity = this.calculateSpeedSimilarity(storedSpeed, inputSpeed);

        // Calculate length similarity
        const storedLength = this.calculateSwipeLength(storedCoords);
        const inputLength = this.calculateSwipeLength(inputCoords);
        const lengthSimilarity = this.calculateLengthSimilarity(storedLength, inputLength);

        // Weighted average
        return (directionSimilarity * 0.4 + speedSimilarity * 0.3 + lengthSimilarity * 0.3);
    }

    // Calculate tap pattern similarity
    calculateTapSimilarity(storedPattern, inputPattern) {
        const storedCoords = storedPattern.coordinates || [];
        const inputCoords = inputPattern.coordinates || [];
        const storedTiming = storedPattern.timing || [];
        const inputTiming = inputPattern.timing || [];

        if (storedCoords.length === 0 || inputCoords.length === 0) {
            return 0;
        }

        // Calculate position similarity
        let positionSimilarity = 0;
        for (let i = 0; i < Math.min(storedCoords.length, inputCoords.length); i++) {
            const storedCoord = storedCoords[i];
            const inputCoord = inputCoords[i];
            const distance = this.calculateDistance(storedCoord[0], storedCoord[1], inputCoord[0], inputCoord[1]);
            positionSimilarity += Math.max(0, 1 - (distance / 100)); // 100px tolerance
        }
        positionSimilarity /= Math.min(storedCoords.length, inputCoords.length);

        // Calculate timing similarity
        let timingSimilarity = 0;
        for (let i = 0; i < Math.min(storedTiming.length, inputTiming.length); i++) {
            const storedInterval = storedTiming[i];
            const inputInterval = inputTiming[i];
            const intervalDiff = Math.abs(storedInterval - inputInterval);
            timingSimilarity += Math.max(0, 1 - (intervalDiff / 1000)); // 1 second tolerance
        }
        timingSimilarity /= Math.min(storedTiming.length, inputTiming.length);

        return (positionSimilarity * 0.6 + timingSimilarity * 0.4);
    }

    // Calculate draw pattern similarity
    calculateDrawSimilarity(storedPattern, inputPattern) {
        const storedCoords = storedPattern.coordinates || [];
        const inputCoords = inputPattern.coordinates || [];
        const storedPressure = storedPattern.pressure || [];
        const inputPressure = inputPattern.pressure || [];

        if (storedCoords.length === 0 || inputCoords.length === 0) {
            return 0;
        }

        // Calculate path similarity using dynamic time warping
        const pathSimilarity = this.calculatePathSimilarity(storedCoords, inputCoords);

        // Calculate pressure similarity
        const pressureSimilarity = this.calculatePressureSimilarity(storedPressure, inputPressure);

        return (pathSimilarity * 0.7 + pressureSimilarity * 0.3);
    }

    // Calculate gesture pattern similarity
    calculateGestureSimilarity(storedPattern, inputPattern) {
        const storedCoords = storedPattern.coordinates || [];
        const inputCoords = inputPattern.coordinates || [];
        const storedTiming = storedPattern.timing || [];
        const inputTiming = inputPattern.timing || [];

        if (storedCoords.length === 0 || inputCoords.length === 0) {
            return 0;
        }

        // Calculate path similarity
        const pathSimilarity = this.calculatePathSimilarity(storedCoords, inputCoords);

        // Calculate timing similarity
        let timingSimilarity = 0;
        for (let i = 0; i < Math.min(storedTiming.length, inputTiming.length); i++) {
            const storedInterval = storedTiming[i];
            const inputInterval = inputTiming[i];
            const intervalDiff = Math.abs(storedInterval - inputInterval);
            timingSimilarity += Math.max(0, 1 - (intervalDiff / 1000));
        }
        timingSimilarity /= Math.min(storedTiming.length, inputTiming.length);

        return (pathSimilarity * 0.6 + timingSimilarity * 0.4);
    }

    // Calculate typing pattern similarity
    calculateTypingSimilarity(storedPattern, inputPattern) {
        const storedCoords = storedPattern.coordinates || [];
        const inputCoords = inputPattern.coordinates || [];
        const storedTiming = storedPattern.timing || [];
        const inputTiming = inputPattern.timing || [];
        const storedPressure = storedPattern.pressure || [];
        const inputPressure = inputPattern.pressure || [];

        if (storedCoords.length === 0 || inputCoords.length === 0) {
            return 0;
        }

        // Calculate timing similarity (rhythm)
        let rhythmSimilarity = 0;
        for (let i = 0; i < Math.min(storedTiming.length, inputTiming.length); i++) {
            const storedInterval = storedTiming[i];
            const inputInterval = inputTiming[i];
            const intervalDiff = Math.abs(storedInterval - inputInterval);
            rhythmSimilarity += Math.max(0, 1 - (intervalDiff / 500));
        }
        rhythmSimilarity /= Math.min(storedTiming.length, inputTiming.length);

        // Calculate pressure similarity
        const pressureSimilarity = this.calculatePressureSimilarity(storedPressure, inputPressure);

        // Calculate speed similarity
        const storedSpeed = storedTiming.length > 0 ? storedTiming.reduce((a, b) => a + b, 0) / storedTiming.length : 0;
        const inputSpeed = inputTiming.length > 0 ? inputTiming.reduce((a, b) => a + b, 0) / inputTiming.length : 0;
        const speedSimilarity = this.calculateSpeedSimilarity(storedSpeed, inputSpeed);

        return (rhythmSimilarity * 0.4 + pressureSimilarity * 0.3 + speedSimilarity * 0.3);
    }

    // Helper methods for similarity calculations
    calculateSwipeDirection(coordinates) {
        if (coordinates.length < 2) return { x: 0, y: 0 };
        
        const start = coordinates[0];
        const end = coordinates[coordinates.length - 1];
        
        return {
            x: end[0] - start[0],
            y: end[1] - start[1]
        };
    }

    calculateDirectionSimilarity(dir1, dir2) {
        const magnitude1 = Math.sqrt(dir1.x * dir1.x + dir1.y * dir1.y);
        const magnitude2 = Math.sqrt(dir2.x * dir2.x + dir2.y * dir2.y);
        
        if (magnitude1 === 0 || magnitude2 === 0) return 0;
        
        const dotProduct = dir1.x * dir2.x + dir1.y * dir2.y;
        const cosineSimilarity = dotProduct / (magnitude1 * magnitude2);
        
        return Math.max(0, cosineSimilarity);
    }

    calculateSwipeSpeed(coordinates, duration) {
        if (coordinates.length < 2 || duration <= 0) return 0;
        
        const totalDistance = this.calculateTotalDistance(coordinates);
        return totalDistance / duration;
    }

    calculateSpeedSimilarity(speed1, speed2) {
        if (speed1 === 0 || speed2 === 0) return 0;
        
        const speedDiff = Math.abs(speed1 - speed2);
        const avgSpeed = (speed1 + speed2) / 2;
        
        return Math.max(0, 1 - (speedDiff / avgSpeed));
    }

    calculateSwipeLength(coordinates) {
        return this.calculateTotalDistance(coordinates);
    }

    calculateLengthSimilarity(length1, length2) {
        if (length1 === 0 || length2 === 0) return 0;
        
        const lengthDiff = Math.abs(length1 - length2);
        const avgLength = (length1 + length2) / 2;
        
        return Math.max(0, 1 - (lengthDiff / avgLength));
    }

    calculateTotalDistance(coordinates) {
        let totalDistance = 0;
        for (let i = 1; i < coordinates.length; i++) {
            const prev = coordinates[i - 1];
            const curr = coordinates[i];
            totalDistance += this.calculateDistance(prev[0], prev[1], curr[0], curr[1]);
        }
        return totalDistance;
    }

    calculateDistance(x1, y1, x2, y2) {
        return Math.sqrt((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1));
    }

    calculatePathSimilarity(coordinates1, coordinates2) {
        // Simplified path similarity calculation
        // In a real implementation, you would use dynamic time warping
        let similarity = 0;
        const minLength = Math.min(coordinates1.length, coordinates2.length);
        
        for (let i = 0; i < minLength; i++) {
            const coord1 = coordinates1[i];
            const coord2 = coordinates2[i];
            const distance = this.calculateDistance(coord1[0], coord1[1], coord2[0], coord2[1]);
            similarity += Math.max(0, 1 - (distance / 50)); // 50px tolerance
        }
        
        return similarity / minLength;
    }

    calculatePressureSimilarity(pressure1, pressure2) {
        if (pressure1.length === 0 || pressure2.length === 0) return 0;
        
        let similarity = 0;
        const minLength = Math.min(pressure1.length, pressure2.length);
        
        for (let i = 0; i < minLength; i++) {
            const pressureDiff = Math.abs(pressure1[i] - pressure2[i]);
            similarity += Math.max(0, 1 - (pressureDiff / 1)); // Normalized pressure
        }
        
        return similarity / minLength;
    }

    calculateGestureParamSimilarity(gesture1, gesture2) {
        // Compare gesture parameters like size, angle, etc.
        const sizeSimilarity = Math.max(0, 1 - Math.abs(gesture1.size - gesture2.size) / Math.max(gesture1.size, gesture2.size));
        const angleSimilarity = Math.max(0, 1 - Math.abs(gesture1.angle - gesture2.angle) / 360);
        
        return (sizeSimilarity + angleSimilarity) / 2;
    }

    calculateTypingRhythmSimilarity(keystrokes1, keystrokes2) {
        if (keystrokes1.length < 2 || keystrokes2.length < 2) return 0;
        
        let rhythmSimilarity = 0;
        const minLength = Math.min(keystrokes1.length, keystrokes2.length);
        
        for (let i = 1; i < minLength; i++) {
            const interval1 = keystrokes1[i].timestamp - keystrokes1[i-1].timestamp;
            const interval2 = keystrokes2[i].timestamp - keystrokes2[i-1].timestamp;
            const intervalDiff = Math.abs(interval1 - interval2);
            rhythmSimilarity += Math.max(0, 1 - (intervalDiff / 1000)); // 1 second tolerance
        }
        
        return rhythmSimilarity / (minLength - 1);
    }

    calculateKeyPressureSimilarity(keystrokes1, keystrokes2) {
        if (keystrokes1.length === 0 || keystrokes2.length === 0) return 0;
        
        let pressureSimilarity = 0;
        const minLength = Math.min(keystrokes1.length, keystrokes2.length);
        
        for (let i = 0; i < minLength; i++) {
            const pressureDiff = Math.abs(keystrokes1[i].pressure - keystrokes2[i].pressure);
            pressureSimilarity += Math.max(0, 1 - (pressureDiff / 1)); // Normalized pressure
        }
        
        return pressureSimilarity / minLength;
    }

    calculateTypingSpeedSimilarity(keystrokes1, keystrokes2) {
        if (keystrokes1.length < 2 || keystrokes2.length < 2) return 0;
        
        const duration1 = keystrokes1[keystrokes1.length - 1].timestamp - keystrokes1[0].timestamp;
        const duration2 = keystrokes2[keystrokes2.length - 1].timestamp - keystrokes2[0].timestamp;
        
        const speed1 = keystrokes1.length / (duration1 / 1000); // characters per second
        const speed2 = keystrokes2.length / (duration2 / 1000);
        
        return this.calculateSpeedSimilarity(speed1, speed2);
    }

    // Validate pattern data
    validatePatternData(patternType, patternData) {
        switch (patternType) {
            case 'swipe':
                return this.validateSwipePattern(patternData);
            case 'tap':
                return this.validateTapPattern(patternData);
            case 'draw':
                return this.validateDrawPattern(patternData);
            case 'gesture':
                return this.validateGesturePattern(patternData);
            case 'typing':
                return this.validateTypingPattern(patternData);
            default:
                return false;
        }
    }

    // Pattern validation methods - Updated to match frontend data format
    validateSwipePattern(patternData) {
        return patternData.coordinates && 
               Array.isArray(patternData.coordinates) && 
               patternData.coordinates.length >= 2 &&
               patternData.timing && 
               Array.isArray(patternData.timing) &&
               patternData.pressure && 
               Array.isArray(patternData.pressure);
    }

    validateTapPattern(patternData) {
        return patternData.coordinates && 
               Array.isArray(patternData.coordinates) && 
               patternData.coordinates.length >= 2 &&
               patternData.timing && 
               Array.isArray(patternData.timing) &&
               patternData.pressure && 
               Array.isArray(patternData.pressure);
    }

    validateDrawPattern(patternData) {
        return patternData.coordinates && 
               Array.isArray(patternData.coordinates) && 
               patternData.coordinates.length >= 5 &&
               patternData.timing && 
               Array.isArray(patternData.timing) &&
               patternData.pressure && 
               Array.isArray(patternData.pressure);
    }

    validateGesturePattern(patternData) {
        return patternData.coordinates && 
               Array.isArray(patternData.coordinates) && 
               patternData.coordinates.length >= 3 &&
               patternData.timing && 
               Array.isArray(patternData.timing) &&
               patternData.pressure && 
               Array.isArray(patternData.pressure);
    }

    validateTypingPattern(patternData) {
        return patternData.coordinates && 
               Array.isArray(patternData.coordinates) && 
               patternData.coordinates.length >= 5 &&
               patternData.timing && 
               Array.isArray(patternData.timing) &&
               patternData.pressure && 
               Array.isArray(patternData.pressure);
    }

    // Generate pattern hash
    generatePatternHash(patternData) {
        const patternString = JSON.stringify(patternData);
        return crypto.createHash('sha256').update(patternString).digest('hex');
    }

    // Log verification attempt
    async logVerificationAttempt(userId, patternType, verified, similarityScore) {
        const client = await pool.connect();
        
        try {
            await client.query(`
                INSERT INTO biometric_verification_logs (
                    user_id,
                    pattern_type,
                    verified,
                    similarity_score,
                    attempted_at
                ) VALUES ($1, $2, $3, $4, $5)
            `, [
                userId,
                patternType,
                verified,
                similarityScore,
                new Date().toISOString()
            ]);
        } catch (error) {
            console.error('Error logging verification attempt:', error);
        } finally {
            client.release();
        }
    }

    // Get user's biometric patterns
    async getUserPatterns(userId) {
        const client = await pool.connect();
        
        try {
            const result = await client.query(`
                SELECT 
                    pattern_type,
                    pattern_data,
                    is_active,
                    created_at,
                    updated_at
                FROM behavioral_patterns
                WHERE user_id = $1
                ORDER BY created_at DESC
            `, [userId]);

            return result.rows.map(row => ({
                type: row.pattern_type,
                name: this.patternTypes[row.pattern_type],
                active: row.is_active,
                created_at: row.created_at,
                updated_at: row.updated_at
            }));
        } finally {
            client.release();
        }
    }

    // Update pattern settings
    async updatePatternSettings(userId, patternType, isActive) {
        const client = await pool.connect();
        
        try {
            await client.query(`
                UPDATE behavioral_patterns
                SET is_active = $3, updated_at = CURRENT_TIMESTAMP
                WHERE user_id = $1 AND pattern_type = $2
            `, [userId, patternType, isActive]);

            console.log(`✅ Pattern settings updated for user ${userId}: ${patternType} = ${isActive}`);
            
            return {
                success: true,
                message: 'Pattern settings updated successfully'
            };
        } finally {
            client.release();
        }
    }

    // Delete pattern
    async deletePattern(userId, patternType) {
        const client = await pool.connect();
        
        try {
            await client.query(`
                DELETE FROM behavioral_patterns
                WHERE user_id = $1 AND pattern_type = $2
            `, [userId, patternType]);

            console.log(`✅ Pattern deleted for user ${userId}: ${patternType}`);
            
            return {
                success: true,
                message: 'Pattern deleted successfully'
            };
        } finally {
            client.release();
        }
    }

    // Get verification statistics
    async getVerificationStats(userId) {
        const client = await pool.connect();
        
        try {
            const result = await client.query(`
                SELECT 
                    COUNT(*) as total_attempts,
                    COUNT(CASE WHEN verified = true THEN 1 END) as successful_verifications,
                    COUNT(CASE WHEN verified = false THEN 1 END) as failed_verifications,
                    AVG(similarity_score) as avg_similarity
                FROM biometric_verification_logs
                WHERE user_id = $1
            `, [userId]);

            const stats = result.rows[0] || {
                total_attempts: 0,
                successful_verifications: 0,
                failed_verifications: 0,
                avg_similarity: 0
            };

            return {
                totalAttempts: parseInt(stats.total_attempts) || 0,
                successfulVerifications: parseInt(stats.successful_verifications) || 0,
                failedVerifications: parseInt(stats.failed_verifications) || 0,
                avgSimilarity: parseFloat(stats.avg_similarity) || 0,
                successRate: stats.total_attempts > 0 ? 
                    parseFloat(stats.successful_verifications) / parseFloat(stats.total_attempts) : 0
            };
        } finally {
            client.release();
        }
    }

    // Get available pattern types
    getAvailablePatternTypes() {
        return this.patternTypes;
    }
}

export default BehavioralBiometrics;
