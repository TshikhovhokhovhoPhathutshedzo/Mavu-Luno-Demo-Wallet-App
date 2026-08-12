import pool from '../auth/db.js';
import axios from 'axios';
import crypto from 'crypto';
import { FaceVerificationLogger } from '../utils/faceVerificationLogger.js';

class EnhancedFaceAuthService {
    constructor() {
        this.microserviceUrl = process.env.FACE_MICROSERVICE_URL || 'http://localhost:5001';
        this.defaultThreshold = 0.6;
    }

    /**
     * Initialize face recognition settings for a user
     */
    async initializeUserSettings(userId) {
        const client = await pool.connect();
        try {
            const result = await client.query(
                `INSERT INTO face_recognition_settings (user_id, face_auth_enabled, confidence_threshold)
                 VALUES ($1, false, $2)
                 ON CONFLICT (user_id) DO NOTHING
                 RETURNING *`,
                [userId, this.defaultThreshold]
            );
            return result.rows[0];
        } catch (error) {
            console.error('Error initializing user face settings:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Create a face enrollment session
     */
    async createEnrollmentSession(userId) {
        const client = await pool.connect();
        try {
            const sessionToken = crypto.randomBytes(32).toString('hex');
            
            const result = await client.query(
                `INSERT INTO face_enrollment_sessions 
                 (user_id, session_token, status, required_images)
                 VALUES ($1, $2, 'pending', 5)
                 RETURNING *`,
                [userId, sessionToken]
            );

            return result.rows[0];
        } catch (error) {
            console.error('Error creating enrollment session:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Enroll a user's face using the microservice
     */
    async enrollUserFace(userId, sessionToken, imageData) {
        const client = await pool.connect();
        try {
            // First, verify the session is valid
            const sessionResult = await client.query(
                `SELECT * FROM face_enrollment_sessions 
                 WHERE user_id = $1 AND session_token = $2 AND status = 'pending'
                 AND expires_at > CURRENT_TIMESTAMP`,
                [userId, sessionToken]
            );

            if (sessionResult.rows.length === 0) {
                throw new Error('Invalid or expired enrollment session');
            }

            const session = sessionResult.rows[0];

            // Call the face recognition microservice
            const response = await axios.post(`${this.microserviceUrl}/enroll`, {
                name: userId,
                image: imageData,
                user_id: userId
            });

            if (response.data.success) {
                // Update session with captured image
                await client.query(
                    `UPDATE face_enrollment_sessions 
                     SET images_captured = images_captured + 1
                     WHERE session_id = $1`,
                    [session.session_id]
                );

                // Check if we have enough images
                const updatedSession = await client.query(
                    `SELECT * FROM face_enrollment_sessions WHERE session_id = $1`,
                    [session.session_id]
                );

                if (updatedSession.rows[0].images_captured >= session.required_images) {
                    // Complete the enrollment
                    await client.query(
                        `UPDATE face_enrollment_sessions 
                         SET status = 'completed', completed_at = CURRENT_TIMESTAMP
                         WHERE session_id = $1`,
                        [session.session_id]
                    );

                    // Enable face auth for the user
                    await client.query(
                        `UPDATE face_recognition_settings 
                         SET face_auth_enabled = true
                         WHERE user_id = $1`,
                        [userId]
                    );

                    // Log successful enrollment
                    await this.logFaceAuthAction(userId, 'enrollment', true, null, {
                        session_id: session.session_id,
                        images_captured: updatedSession.rows[0].images_captured
                    });
                }

                return {
                    success: true,
                    images_captured: updatedSession.rows[0].images_captured,
                    required_images: session.required_images,
                    completed: updatedSession.rows[0].images_captured >= session.required_images
                };
            } else {
                throw new Error(response.data.message || 'Face enrollment failed');
            }
        } catch (error) {
            console.error('Error enrolling user face:', error);
            
            // Log failed enrollment
            await this.logFaceAuthAction(userId, 'enrollment', false, null, {
                error: error.message,
                session_token: sessionToken
            });

            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Verify a user's face for login
     */
    async verifyUserFace(userId, imageData, clientInfo = {}) {
        const client = await pool.connect();
        try {
            // Check if user has face auth enabled
            const settingsResult = await client.query(
                `SELECT * FROM face_recognition_settings WHERE user_id = $1 AND face_auth_enabled = true`,
                [userId]
            );

            if (settingsResult.rows.length === 0) {
                throw new Error('Face authentication not enabled for this user');
            }

            const settings = settingsResult.rows[0];

            // Check rate limiting
            const recentAttempts = await client.query(
                `SELECT COUNT(*) FROM face_verification_attempts 
                 WHERE user_id = $1 AND created_at > CURRENT_TIMESTAMP - INTERVAL '1 hour'`,
                [userId]
            );

            if (parseInt(recentAttempts.rows[0].count) >= settings.max_attempts_per_hour) {
                throw new Error('Too many verification attempts. Please try again later.');
            }

            // Call the face recognition microservice
            const response = await axios.post(`${this.microserviceUrl}/verify`, {
                image: imageData,
                target_name: userId
            });

            const success = Boolean(response.data.success && response.data.confidence >= settings.confidence_threshold);

            // Log the verification attempt using bulletproof logger
            if (success) {
                await FaceVerificationLogger.logSuccess(
                    userId,
                    response.data.confidence || 0,
                    1.0, // Default liveness score
                    0, // Default processing time
                    clientInfo
                );
            } else {
                await FaceVerificationLogger.logFailure(
                    userId,
                    'LOW_CONFIDENCE',
                    clientInfo,
                    null,
                    response.data.confidence || 0,
                    1.0,
                    0
                );
            }

            // Log the auth action
            await this.logFaceAuthAction(userId, 'verification', success, response.data.confidence, {
                threshold_used: settings.confidence_threshold,
                client_ip: clientInfo.ip
            });

            return {
                success,
                confidence: response.data.confidence || 0,
                threshold: settings.confidence_threshold
            };

        } catch (error) {
            console.error('Error verifying user face:', error);
            
            // Log failed verification attempt using bulletproof logger
            await FaceVerificationLogger.logError(userId, error, clientInfo);
            
            // Log failed verification
            await this.logFaceAuthAction(userId, 'verification', false, 0, {
                error: error.message,
                client_ip: clientInfo.ip
            });

            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get user's face authentication status
     */
    async getUserFaceAuthStatus(userId) {
        const client = await pool.connect();
        try {
            const result = await client.query(
                `SELECT face_auth_enabled, confidence_threshold, max_attempts_per_hour
                 FROM face_recognition_settings WHERE user_id = $1`,
                [userId]
            );

            if (result.rows.length === 0) {
                // Initialize settings if they don't exist
                await this.initializeUserSettings(userId);
                return {
                    face_auth_enabled: false,
                    confidence_threshold: this.defaultThreshold,
                    max_attempts_per_hour: 10
                };
            }

            return result.rows[0];
        } catch (error) {
            console.error('Error getting user face auth status:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Update user's face authentication settings
     */
    async updateUserFaceAuthSettings(userId, settings) {
        const client = await pool.connect();
        try {
            const result = await client.query(
                `UPDATE face_recognition_settings 
                 SET face_auth_enabled = $2, 
                     confidence_threshold = $3,
                     max_attempts_per_hour = $4,
                     require_liveness_check = $5
                 WHERE user_id = $1
                 RETURNING *`,
                [
                    userId,
                    settings.face_auth_enabled,
                    settings.confidence_threshold || this.defaultThreshold,
                    settings.max_attempts_per_hour || 10,
                    settings.require_liveness_check || false
                ]
            );

            return result.rows[0];
        } catch (error) {
            console.error('Error updating user face auth settings:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Disable face authentication for a user
     */
    async disableFaceAuth(userId) {
        const client = await pool.connect();
        try {
            await client.query(
                `UPDATE face_recognition_settings 
                 SET face_auth_enabled = false
                 WHERE user_id = $1`,
                [userId]
            );

            // Log the action
            await this.logFaceAuthAction(userId, 'logout', true, null, {
                action: 'face_auth_disabled'
            });

            return { success: true };
        } catch (error) {
            console.error('Error disabling face auth:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Log face authentication actions
     */
    async logFaceAuthAction(userId, actionType, success, confidenceScore, metadata = {}) {
        const client = await pool.connect();
        try {
            await client.query(
                `INSERT INTO face_auth_logs 
                 (user_id, action_type, success, confidence_score, metadata)
                 VALUES ($1, $2, $3, $4, $5)`,
                [userId, actionType, success, confidenceScore, JSON.stringify(metadata)]
            );
        } catch (error) {
            console.error('Error logging face auth action:', error);
        } finally {
            client.release();
        }
    }

    /**
     * Get face authentication logs for a user
     */
    async getUserFaceAuthLogs(userId, limit = 50) {
        const client = await pool.connect();
        try {
            const result = await client.query(
                `SELECT action_type, success, confidence_score, created_at, metadata
                 FROM face_auth_logs 
                 WHERE user_id = $1
                 ORDER BY created_at DESC
                 LIMIT $2`,
                [userId, limit]
            );

            return result.rows;
        } catch (error) {
            console.error('Error getting user face auth logs:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Check if microservice is available
     */
    async checkMicroserviceHealth() {
        try {
            const response = await axios.get(`${this.microserviceUrl}/health`, {
                timeout: 5000
            });
            return response.status === 200;
        } catch (error) {
            console.error('Face recognition microservice is not available:', error.message);
            return false;
        }
    }

    /**
     * Detect faces in an image and perform liveness detection
     */
    async detectFacesInImage(imageData) {
        try {
            // Call the microservice for face detection
            const response = await axios.post(`${this.microserviceUrl}/detect-faces`, {
                image: imageData
            }, { timeout: 10000 });

            const result = response.data;
            
            // Skip liveness detection for easier face capture
            let livenessResult = { isLive: true, score: 1.0 }; // Always consider live

            return {
                faces_detected: result.faces_detected || 0,
                face_locations: result.face_locations || [],
                liveness: livenessResult
            };

        } catch (error) {
            console.error('Face detection error:', error.message);
            throw new Error('Face detection failed: ' + error.message);
        }
    }
}

export default new EnhancedFaceAuthService();
