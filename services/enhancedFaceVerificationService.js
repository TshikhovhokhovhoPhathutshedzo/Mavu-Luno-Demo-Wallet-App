import axios from 'axios';
import pool from '../auth/db.js';
import crypto from 'crypto';
import { FaceVerificationLogger } from '../utils/faceVerificationLogger.js';
import bcrypt from 'bcryptjs';

class EnhancedFaceVerificationService {
    constructor() {
        this.microserviceUrl = process.env.FACE_MICROSERVICE_URL || 'http://localhost:5001';
        this.encryptionKey = process.env.FACE_ENCRYPTION_KEY || 'your-32-character-secret-key-here!';
        this.algorithm = 'aes-256-gcm';
    }

    /**
     * Encrypt face embedding before storing in database
     */
    encryptEmbedding(embedding) {
        try {
            const iv = crypto.randomBytes(16);
            const cipher = crypto.createCipher(this.algorithm, this.encryptionKey);
            cipher.setAAD(Buffer.from('face-embedding', 'utf8'));
            
            let encrypted = cipher.update(JSON.stringify(embedding), 'utf8', 'hex');
            encrypted += cipher.final('hex');
            
            const authTag = cipher.getAuthTag();
            
            return {
                encrypted: encrypted,
                iv: iv.toString('hex'),
                authTag: authTag.toString('hex')
            };
        } catch (error) {
            console.error('Error encrypting embedding:', error);
            throw new Error('Failed to encrypt face embedding');
        }
    }

    /**
     * Decrypt face embedding from database
     */
    decryptEmbedding(encryptedData) {
        try {
            const decipher = crypto.createDecipher(this.algorithm, this.encryptionKey);
            decipher.setAAD(Buffer.from('face-embedding', 'utf8'));
            decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));
            
            let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            return JSON.parse(decrypted);
        } catch (error) {
            console.error('Error decrypting embedding:', error);
            throw new Error('Failed to decrypt face embedding');
        }
    }

    /**
     * Check microservice health
     */
    async checkMicroserviceHealth() {
        try {
            const response = await axios.get(`${this.microserviceUrl}/health`, { timeout: 5000 });
            return response.data.status === 'healthy';
        } catch (error) {
            console.error('Microservice health check failed:', error);
            return false;
        }
    }

    /**
     * Extract face embedding from image
     */
    async extractFaceEmbedding(imageData) {
        try {
            const response = await axios.post(`${this.microserviceUrl}/extract-single-embedding`, {
                images: [imageData]
            }, { timeout: 10000 });

            if (!response.data.success) {
                throw new Error('Failed to extract face embedding');
            }

            return {
                embedding: response.data.embedding,
                success: true
            };
        } catch (error) {
            console.error('Error extracting face embedding:', error);
            throw new Error('Failed to extract face embedding from image');
        }
    }

    /**
     * Compare two face embeddings
     */
    async compareEmbeddings(embedding1, embedding2) {
        try {
            const response = await axios.post(`${this.microserviceUrl}/compare-embedding`, {
                embedding1: embedding1,
                embedding2: embedding2
            }, { timeout: 5000 });

            return {
                similarity: response.data.similarity,
                success: true
            };
        } catch (error) {
            console.error('Error comparing embeddings:', error);
            throw new Error('Failed to compare face embeddings');
        }
    }

    /**
     * Perform liveness detection
     */
    async detectLiveness(imageData) {
        try {
            // Call microservice for liveness detection
            const [textureResponse, depthResponse] = await Promise.all([
                axios.post(`${this.microserviceUrl}/analyze-texture`, { image: imageData }),
                axios.post(`${this.microserviceUrl}/analyze-depth`, { image: imageData })
            ]);

            const textureScore = textureResponse.data.texture_score;
            const depthScore = depthResponse.data.depth_score;
            
            // Combine scores for liveness detection
            const livenessScore = (textureScore + depthScore) / 2;
            const isLive = livenessScore > 0.5; // Threshold for liveness

            return {
                isLive: isLive,
                score: livenessScore,
                textureScore: textureScore,
                depthScore: depthScore
            };
        } catch (error) {
            console.error('Error in liveness detection:', error);
            // Fallback: assume live if detection fails
            return {
                isLive: true,
                score: 0.5,
                textureScore: 0.5,
                depthScore: 0.5
            };
        }
    }

    /**
     * Get user face verification status
     */
    async getUserFaceVerificationStatus(userId) {
        const client = await pool.connect();
        try {
            // Check if table exists first
            const tableExists = await client.query(`
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = 'user_face_verification_status'
                );
            `);

            if (!tableExists.rows[0].exists) {
                console.warn('user_face_verification_status table does not exist, returning default status');
                return {
                    face_auth_enabled: false,
                    verification_status: 'disabled',
                    face_records_count: 0,
                    confidence_threshold: 0.6,
                    require_liveness_check: true
                };
            }

            const result = await client.query(`
                SELECT * FROM user_face_verification_status 
                WHERE user_id = $1
            `, [userId]);

            if (result.rows.length === 0) {
                return {
                    face_auth_enabled: false,
                    verification_status: 'disabled',
                    face_records_count: 0,
                    confidence_threshold: 0.6,
                    require_liveness_check: true
                };
            }

            return result.rows[0];
        } catch (error) {
            console.error('Error checking face verification status:', error);
            // Return default status on error
            return {
                face_auth_enabled: false,
                verification_status: 'disabled',
                face_records_count: 0,
                confidence_threshold: 0.6,
                require_liveness_check: true
            };
        } finally {
            client.release();
        }
    }

    /**
     * Create face enrollment session
     */
    async createEnrollmentSession(userId) {
        const client = await pool.connect();
        try {
            const sessionToken = crypto.randomBytes(32).toString('hex');
            
            const result = await client.query(`
                INSERT INTO face_enrollment_sessions 
                (user_id, session_token, status, required_images)
                VALUES ($1, $2, 'pending', 5)
                RETURNING session_id, session_token, expires_at
            `, [userId, sessionToken]);

            return result.rows[0];
        } finally {
            client.release();
        }
    }

    /**
     * Enroll user face with multiple images
     */
    async enrollUserFace(userId, sessionToken, imageData) {
        const client = await pool.connect();
        try {
            // Verify session
            const sessionResult = await client.query(`
                SELECT * FROM face_enrollment_sessions 
                WHERE user_id = $1 AND session_token = $2 AND status = 'pending'
                AND expires_at > CURRENT_TIMESTAMP
            `, [userId, sessionToken]);

            if (sessionResult.rows.length === 0) {
                throw new Error('Invalid or expired enrollment session');
            }

            const session = sessionResult.rows[0];

            // Extract face embedding
            const embeddingResult = await this.extractFaceEmbedding(imageData);
            const embedding = embeddingResult.embedding;

            // Perform liveness detection
            const livenessResult = await this.detectLiveness(imageData);
            
            if (!livenessResult.isLive) {
                throw new Error('Liveness detection failed. Please ensure you are a real person.');
            }

            // Calculate quality score (simplified)
            const qualityScore = (livenessResult.textureScore + livenessResult.depthScore) / 2;

            if (qualityScore < session.quality_threshold) {
                throw new Error('Image quality too low. Please try again with better lighting.');
            }

            // Encrypt embedding
            const encryptedEmbedding = this.encryptEmbedding(embedding);

            // Store face data
            const faceResult = await client.query(`
                INSERT INTO user_face_data 
                (user_id, face_embedding, quality_score, liveness_score, metadata)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING face_id
            `, [
                userId,
                JSON.stringify(encryptedEmbedding),
                qualityScore,
                livenessResult.score,
                JSON.stringify({
                    session_id: session.session_id,
                    texture_score: livenessResult.textureScore,
                    depth_score: livenessResult.depthScore,
                    created_at: new Date().toISOString()
                })
            ]);

            const faceId = faceResult.rows[0].face_id;

            // Update session
            const newImageCount = session.images_captured + 1;
            let sessionStatus = 'in_progress';
            
            if (newImageCount >= session.required_images) {
                sessionStatus = 'completed';
                
                // Set this as primary face if it's the first one
                const existingFaces = await client.query(`
                    SELECT COUNT(*) FROM user_face_data 
                    WHERE user_id = $1 AND is_active = true
                `, [userId]);

                if (parseInt(existingFaces.rows[0].count) === 1) {
                    await client.query(`
                        UPDATE user_face_data 
                        SET is_primary = true 
                        WHERE face_id = $1
                    `, [faceId]);
                }

                // Enable face auth
                await client.query(`
                    INSERT INTO face_verification_settings (user_id, face_auth_enabled, confidence_threshold, require_liveness_check)
                    VALUES ($1, true, 0.6, true)
                    ON CONFLICT (user_id) 
                    DO UPDATE SET 
                        face_auth_enabled = true,
                        updated_at = CURRENT_TIMESTAMP
                `, [userId]);
            }

            await client.query(`
                UPDATE face_enrollment_sessions 
                SET images_captured = $1, status = $2, completed_at = $3
                WHERE session_id = $4
            `, [
                newImageCount,
                sessionStatus,
                sessionStatus === 'completed' ? new Date() : null,
                session.session_id
            ]);

            return {
                success: true,
                faceId: faceId,
                imagesCaptured: newImageCount,
                requiredImages: session.required_images,
                isComplete: sessionStatus === 'completed',
                qualityScore: qualityScore
            };

        } finally {
            client.release();
        }
    }

    /**
     * Verify user face for login
     */
    async verifyUserFace(userId, imageData, clientInfo = {}) {
        const client = await pool.connect();
        const startTime = Date.now();
        let processingTime = 0;
        
        try {
            // Get user settings
            const settingsResult = await client.query(`
                SELECT * FROM face_verification_settings 
                WHERE user_id = $1 AND face_auth_enabled = true
            `, [userId]);

            if (settingsResult.rows.length === 0) {
                processingTime = Date.now() - startTime;
                await FaceVerificationLogger.logFailure(userId, 'FACE_AUTH_DISABLED', clientInfo, null, 0, 0, processingTime);
                throw new Error('Face authentication not enabled for this user');
            }

            const settings = settingsResult.rows[0];

            // Check rate limiting
            const recentAttempts = await client.query(`
                SELECT COUNT(*) FROM face_verification_attempts 
                WHERE user_id = $1 AND created_at > CURRENT_TIMESTAMP - INTERVAL '1 hour'
            `, [userId]);

            if (parseInt(recentAttempts.rows[0].count) >= settings.max_attempts_per_hour) {
                processingTime = Date.now() - startTime;
                await FaceVerificationLogger.logFailure(userId, 'RATE_LIMIT_EXCEEDED', clientInfo, null, 0, 0, processingTime);
                throw new Error('Too many verification attempts. Please try again later.');
            }

            // Extract face embedding from input image
            const embeddingResult = await this.extractFaceEmbedding(imageData);
            const inputEmbedding = embeddingResult.embedding;

            // Perform liveness detection if required
            let livenessResult = { isLive: true, score: 1.0 };
            if (settings.require_liveness_check) {
                livenessResult = await this.detectLiveness(imageData);
                
                if (!livenessResult.isLive) {
                    processingTime = Date.now() - startTime;
                    await FaceVerificationLogger.logFailure(userId, 'LIVENESS_FAILED', clientInfo, null, 0, livenessResult.score, processingTime);
                    throw new Error('Liveness detection failed. Please ensure you are a real person.');
                }
            }

            // Get user's stored face embeddings
            const faceDataResult = await client.query(`
                SELECT face_id, face_embedding, quality_score, is_primary
                FROM user_face_data 
                WHERE user_id = $1 AND is_active = true
                ORDER BY is_primary DESC, quality_score DESC
            `, [userId]);

            if (faceDataResult.rows.length === 0) {
                processingTime = Date.now() - startTime;
                await FaceVerificationLogger.logFailure(userId, 'NO_FACE_DATA', clientInfo, null, 0, livenessResult.score, processingTime);
                throw new Error('No face data found for this user');
            }

            let bestMatch = null;
            let bestSimilarity = 0;

            // Compare with all stored faces
            for (const faceData of faceDataResult.rows) {
                const encryptedEmbedding = JSON.parse(faceData.face_embedding);
                const storedEmbedding = this.decryptEmbedding(encryptedEmbedding);
                
                const comparisonResult = await this.compareEmbeddings(inputEmbedding, storedEmbedding);
                const similarity = comparisonResult.similarity;

                if (similarity > bestSimilarity) {
                    bestSimilarity = similarity;
                    bestMatch = {
                        faceId: faceData.face_id,
                        similarity: similarity,
                        qualityScore: faceData.quality_score,
                        isPrimary: faceData.is_primary
                    };
                }
            }

            processingTime = Date.now() - startTime;
            const isMatch = Boolean(bestSimilarity >= settings.confidence_threshold);

            // Log verification attempt
            if (isMatch) {
                await FaceVerificationLogger.logSuccess(
                    userId, 
                    bestSimilarity, 
                    livenessResult.score, 
                    processingTime, 
                    clientInfo
                );
            } else {
                await FaceVerificationLogger.logFailure(
                    userId, 
                    'LOW_SIMILARITY', 
                    clientInfo, 
                    null, 
                    bestSimilarity, 
                    livenessResult.score, 
                    processingTime
                );
            }

            if (isMatch) {
                // Log successful authentication
                await client.query(`
                    INSERT INTO auth_logs 
                    (user_id, auth_method, success, confidence_score, liveness_score, client_ip, user_agent, device_info)
                    VALUES ($1, 'face', true, $2, $3, $4, $5, $6)
                `, [
                    userId,
                    bestSimilarity,
                    livenessResult.score,
                    clientInfo.ip,
                    clientInfo.userAgent,
                    JSON.stringify(clientInfo.deviceInfo || {})
                ]);

                return {
                    success: true,
                    confidence: bestSimilarity,
                    livenessScore: livenessResult.score,
                    processingTime: processingTime,
                    faceId: bestMatch.faceId
                };
            } else {
                throw new Error(`Face verification failed. Similarity: ${bestSimilarity.toFixed(3)}, Required: ${settings.confidence_threshold}`);
            }

        } catch (error) {
            // Log any errors that occur during verification
            processingTime = Date.now() - startTime;
            await FaceVerificationLogger.logError(userId, error, clientInfo);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Log verification attempt
     */
    async logVerificationAttempt(client, userId, success, confidenceScore, livenessScore, clientInfo, processingTime, errorCode = null) {
        try {
            // Ensure success is always a boolean
            const successValue = Boolean(success);
            
            // Debug logging
            console.log('Logging verification attempt:', {
                userId,
                success: success,
                successValue: successValue,
                successType: typeof successValue,
                confidenceScore,
                livenessScore,
                processingTime,
                errorCode
            });
            
            await client.query(`
                INSERT INTO face_verification_attempts 
                (user_id, success, confidence_score, liveness_score, processing_time_ms, client_ip, user_agent, device_info, error_code)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            `, [
                userId,
                successValue,
                confidenceScore || 0,
                livenessScore || 0,
                processingTime || 0,
                clientInfo.ip || 'unknown',
                clientInfo.userAgent || 'unknown',
                JSON.stringify(clientInfo.deviceInfo || {}),
                errorCode
            ]);
            
            console.log('Verification attempt logged successfully');
        } catch (error) {
            console.error('Error logging verification attempt:', error);
            console.error('Parameters that caused the error:', {
                userId,
                success,
                successValue: Boolean(success),
                confidenceScore,
                livenessScore,
                processingTime,
                errorCode
            });
        }
    }

    /**
     * Get user's face verification logs
     */
    async getUserFaceLogs(userId, limit = 50) {
        const client = await pool.connect();
        try {
            const result = await client.query(`
                SELECT 
                    attempt_id,
                    success,
                    confidence_score,
                    liveness_score,
                    processing_time_ms,
                    client_ip,
                    user_agent,
                    device_info,
                    error_code,
                    created_at
                FROM face_verification_attempts 
                WHERE user_id = $1
                ORDER BY created_at DESC
                LIMIT $2
            `, [userId, limit]);

            return result.rows;
        } finally {
            client.release();
        }
    }

    /**
     * Update face verification settings
     */
    async updateFaceVerificationSettings(userId, settings) {
        const client = await pool.connect();
        try {
            const result = await client.query(`
                INSERT INTO face_verification_settings 
                (user_id, face_auth_enabled, confidence_threshold, max_attempts_per_hour, require_liveness_check, allow_multiple_faces, auto_update_primary)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                ON CONFLICT (user_id) 
                DO UPDATE SET 
                    face_auth_enabled = EXCLUDED.face_auth_enabled,
                    confidence_threshold = EXCLUDED.confidence_threshold,
                    max_attempts_per_hour = EXCLUDED.max_attempts_per_hour,
                    require_liveness_check = EXCLUDED.require_liveness_check,
                    allow_multiple_faces = EXCLUDED.allow_multiple_faces,
                    auto_update_primary = EXCLUDED.auto_update_primary,
                    updated_at = CURRENT_TIMESTAMP
                RETURNING *
            `, [
                userId,
                settings.face_auth_enabled,
                settings.confidence_threshold,
                settings.max_attempts_per_hour,
                settings.require_liveness_check,
                settings.allow_multiple_faces,
                settings.auto_update_primary
            ]);

            return result.rows[0];
        } finally {
            client.release();
        }
    }

    /**
     * Disable face authentication for user
     */
    async disableFaceAuthentication(userId) {
        const client = await pool.connect();
        try {
            await client.query(`
                UPDATE face_verification_settings 
                SET face_auth_enabled = false, updated_at = CURRENT_TIMESTAMP
                WHERE user_id = $1
            `, [userId]);

            // Optionally, deactivate all face data
            await client.query(`
                UPDATE user_face_data 
                SET is_active = false, updated_at = CURRENT_TIMESTAMP
                WHERE user_id = $1
            `, [userId]);

            return { success: true };
        } finally {
            client.release();
        }
    }

    /**
     * Clean up expired sessions and old logs
     */
    async cleanupExpiredData() {
        const client = await pool.connect();
        try {
            // Clean up expired sessions
            await client.query(`
                DELETE FROM face_enrollment_sessions 
                WHERE expires_at < CURRENT_TIMESTAMP AND status IN ('pending', 'in_progress')
            `);

            // Clean up old verification attempts (older than 30 days)
            await client.query(`
                DELETE FROM face_verification_attempts 
                WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '30 days'
            `);

            return { success: true };
        } finally {
            client.release();
        }
    }
}

export default new EnhancedFaceVerificationService();
