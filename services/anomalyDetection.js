import pool from "../auth/db.js";
import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";

class AnomalyDetectionService {
    constructor() {
        this.LARGE_AMOUNT_THRESHOLD = 10000; // R10,000
        this.RAPID_TRANSACTION_WINDOW = 5; // 5 minutes
        this.LOCATION_CHANGE_THRESHOLD = 100; // 100km minimum for location change
    }

    // Check for large amount anomalies
    async checkLargeAmount(userId, amount, transactionType) {
        if (amount >= this.LARGE_AMOUNT_THRESHOLD) {
            const description = `Large ${transactionType} detected: R${amount.toLocaleString()}`;
            const severity = amount >= 50000 ? 'critical' : amount >= 25000 ? 'high' : 'medium';
            
            const anomalyId = await this.createAnomaly(userId, 'large_amount', severity, description, {
                amount,
                transactionType,
                threshold: this.LARGE_AMOUNT_THRESHOLD
            });

            return {
                isAnomaly: true,
                type: 'large_amount',
                severity,
                anomaly_id: anomalyId,
                requiresAuth: true
            };
        }
        return { isAnomaly: false };
    }

    // Check for rapid transaction anomalies
    async checkRapidTransactions(userId) {
        const client = await pool.connect();
        try {
            const recentTransactions = await client.query(`
                SELECT created_at, transaction_type, amount
                FROM transactions
                WHERE user_id = $1
                AND created_at >= NOW() - INTERVAL '${this.RAPID_TRANSACTION_WINDOW} minutes'
                ORDER BY created_at DESC
            `, [userId]);

            if (recentTransactions.rows.length > 1) {
                const description = `Rapid transactions detected: ${recentTransactions.rows.length} transactions in ${this.RAPID_TRANSACTION_WINDOW} minutes`;
                const severity = recentTransactions.rows.length >= 5 ? 'critical' : recentTransactions.rows.length >= 3 ? 'high' : 'medium';
                
                const anomalyId = await this.createAnomaly(userId, 'rapid_transactions', severity, description, {
                    transactionCount: recentTransactions.rows.length,
                    timeWindow: this.RAPID_TRANSACTION_WINDOW,
                    transactions: recentTransactions.rows
                });

                return {
                    isAnomaly: true,
                    type: 'rapid_transactions',
                    severity,
                    anomaly_id: anomalyId,
                    requiresAuth: true
                };
            }
            return { isAnomaly: false };
        } catch (error) {
            console.error('Error checking rapid transactions:', error);
            return { isAnomaly: false };
        } finally {
            client.release();
        }
    }

    // Check for location change anomalies
    async checkLocationChange(userId, newLocation) {
        const client = await pool.connect();
        try {
            const lastLocation = await client.query(`
                SELECT latitude, longitude, created_at, country, city
                FROM user_locations
                WHERE user_id = $1
                ORDER BY created_at DESC
                LIMIT 1
            `, [userId]);

            if (lastLocation.rows.length > 0) {
                const last = lastLocation.rows[0];
                const distance = this.calculateDistance(
                    last.latitude, last.longitude,
                    newLocation.latitude, newLocation.longitude
                );

                const timeDiff = Math.abs(new Date() - new Date(last.created_at)) / (1000 * 60 * 60); // hours

                // Check if distance is too large for the time difference
                if (distance > this.LOCATION_CHANGE_THRESHOLD && timeDiff < 24) {
                    const description = `Suspicious location change detected: ${distance.toFixed(1)}km in ${timeDiff.toFixed(1)} hours`;
                    const severity = distance > 500 ? 'critical' : distance > 200 ? 'high' : 'medium';
                    
                    const anomalyId = await this.createAnomaly(userId, 'location_change', severity, description, {
                        distance,
                        timeDiff,
                        fromLocation: { country: last.country, city: last.city },
                        toLocation: { country: newLocation.country, city: newLocation.city }
                    });

                    return {
                        isAnomaly: true,
                        type: 'location_change',
                        severity,
                        anomaly_id: anomalyId,
                        requiresAuth: true
                    };
                }
            }

            // Store new location
            await client.query(`
                INSERT INTO user_locations (user_id, ip_address, country, city, latitude, longitude, timezone)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
            `, [userId, newLocation.ip, newLocation.country, newLocation.city, 
                newLocation.latitude, newLocation.longitude, newLocation.timezone]);

            return { isAnomaly: false };
        } catch (error) {
            console.error('Error checking location change:', error);
            return { isAnomaly: false };
        } finally {
            client.release();
        }
    }

    // Calculate distance between two points using Haversine formula
    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Earth's radius in kilometers
        const dLat = this.deg2rad(lat2 - lat1);
        const dLon = this.deg2rad(lon2 - lon1);
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }

    deg2rad(deg) {
        return deg * (Math.PI/180);
    }

    // Create anomaly record
    async createAnomaly(userId, type, severity, description, metadata) {
        const client = await pool.connect();
        try {
            const result = await client.query(`
                INSERT INTO anomaly_detections (user_id, anomaly_type, severity, description, metadata)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING anomaly_id
            `, [userId, type, severity, description, JSON.stringify(metadata)]);

            const anomalyId = result.rows[0].anomaly_id;

            // Create notification
            await this.createNotification(userId, type, severity, description);

            // Send email alert
            await this.sendEmailAlert(userId, type, severity, description);

            return anomalyId;
        } catch (error) {
            console.error('Error creating anomaly:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    // Create in-app notification
    async createNotification(userId, type, severity, description) {
        const client = await pool.connect();
        try {
            const titles = {
                large_amount: 'Large Transaction Detected',
                rapid_transactions: 'Rapid Transactions Detected',
                location_change: 'Suspicious Location Change'
            };

            const messages = {
                large_amount: 'A large transaction has been detected on your account. Please verify this transaction.',
                rapid_transactions: 'Multiple transactions detected in a short time period. Please verify these transactions.',
                location_change: 'A transaction from an unusual location has been detected. Please verify this is you.'
            };

            await client.query(`
                INSERT INTO user_notifications (user_id, title, message, notification_type)
                VALUES ($1, $2, $3, $4)
            `, [userId, titles[type], messages[type], 'anomaly']);
        } catch (error) {
            console.error('Error creating notification:', error);
        } finally {
            client.release();
        }
    }

    // Send email alert
    async sendEmailAlert(userId, type, severity, description) {
        const client = await pool.connect();
        try {
            const user = await client.query(`
                SELECT email, username FROM luno_users WHERE user_id = $1
            `, [userId]);

            if (user.rows.length === 0) return;

            const email = user.rows[0].email;
            const username = user.rows[0].username;

            const subjects = {
                large_amount: '🚨 Large Transaction Alert - Luno Security',
                rapid_transactions: '🚨 Rapid Transactions Alert - Luno Security',
                location_change: '🚨 Suspicious Location Alert - Luno Security'
            };

            const emailBody = `
                Dear ${username},

                We have detected suspicious activity on your Luno account:

                ${description}

                Severity Level: ${severity.toUpperCase()}

                For your security, this transaction requires additional verification.
                Please log into your Luno account to verify this activity.

                If this was not you, please contact our support team immediately.

                Best regards,
                Luno Security Team
            `;

            await client.query(`
                INSERT INTO email_alerts (user_id, email, subject, message, alert_type)
                VALUES ($1, $2, $3, $4, $5)
            `, [userId, email, subjects[type], emailBody, 'anomaly']);

            // Only send email if email service is configured
            if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
                try {
                    const transporter = nodemailer.createTransport({
                        service: 'gmail',
                        auth: {
                            user: process.env.EMAIL_USER,
                            pass: process.env.EMAIL_PASS
                        }
                    });

                    await transporter.sendMail({
                        from: process.env.EMAIL_USER,
                        to: email,
                        subject: subjects[type],
                        text: emailBody
                    });
                } catch (emailError) {
                    console.error('Failed to send email alert:', emailError);
                }
            }
        } catch (error) {
            console.error('Error sending email alert:', error);
        } finally {
            client.release();
        }
    }

    // Check if user has security questions set up
    async hasSecurityQuestions(userId) {
        console.log('=== hasSecurityQuestions called ===');
        console.log('userId:', userId);
        console.log('pool:', pool);
        
        const client = await pool.connect();
        try {
            console.log('hasSecurityQuestions called with userId:', userId);
            console.log('About to query security_questions table...');
            
            const questions = await client.query(`
                SELECT COUNT(*) as count
                FROM security_questions
                WHERE user_id = $1
            `, [userId]);

            console.log('Security questions query result:', questions.rows);
            const result = parseInt(questions.rows[0].count) > 0;
            console.log('hasSecurityQuestions returning:', result);
            return result;
        } catch (error) {
            console.error('Error checking security questions:', error);
            console.error('Error message:', error.message);
            console.error('Error code:', error.code);
            console.error('Error stack:', error.stack);
            return false;
        } finally {
            client.release();
        }
    }

    // Verify security questions
    async verifySecurityQuestions(userId, answers) {
        const client = await pool.connect();
        try {
            console.log('=== verifySecurityQuestions called ===');
            console.log('userId:', userId);
            console.log('answers received:', answers);
            
            const questions = await client.query(`
                SELECT question_text, answer_hash
                FROM security_questions
                WHERE user_id = $1
                ORDER BY question_id
                LIMIT 3
            `, [userId]);

            console.log('Questions found in database:', questions.rows.length);
            console.log('Questions data:', questions.rows);

            if (questions.rows.length === 0) {
                console.log('No security questions found for user');
                return { verified: false, message: 'No security questions found. Please set up security questions in settings first.' };
            }

            let correctAnswers = 0;
            for (let i = 0; i < questions.rows.length && i < answers.length; i++) {
                const userAnswer = answers[i].toLowerCase().trim();
                const storedAnswerHash = questions.rows[i].answer_hash;
                
                console.log(`Comparing answer ${i + 1}:`);
                console.log(`  User answer: "${userAnswer}"`);
                console.log(`  Stored answer hash: "${storedAnswerHash.substring(0, 20)}..."`);
                
                // Use bcrypt to compare the hashed answer
                const bcrypt = await import('bcryptjs');
                const isMatch = await bcrypt.default.compare(userAnswer, storedAnswerHash);
                console.log(`  Match result: ${isMatch}`);
                
                if (isMatch) correctAnswers++;
            }

            console.log(`Total correct answers: ${correctAnswers} out of ${Math.min(questions.rows.length, answers.length)}`);
            
            const verified = correctAnswers >= 2; // Require at least 2 correct answers
            const message = verified ? 'Security questions verified' : `Incorrect security answers. You got ${correctAnswers} out of ${Math.min(questions.rows.length, answers.length)} correct.`;
            
            console.log(`Verification result: ${verified} - ${message}`);
            
            return {
                verified,
                message
            };
        } catch (error) {
            console.error('Error verifying security questions:', error);
            return { verified: false, message: 'Error verifying security questions' };
        } finally {
            client.release();
        }
    }

    // Resolve anomaly
    async resolveAnomaly(anomalyId, status, userId) {
        const client = await pool.connect();
        try {
            console.log('=== resolveAnomaly called ===');
            console.log('anomalyId type:', typeof anomalyId, 'value:', anomalyId);
            console.log('status type:', typeof status, 'value:', status);
            console.log('userId type:', typeof userId, 'value:', userId);

            // First, check if the anomaly exists
            const checkResult = await client.query(`
                SELECT anomaly_id, status, user_id, description 
                FROM anomaly_detections 
                WHERE anomaly_id = $1
            `, [anomalyId]);
            
            console.log('Check query result rows:', checkResult.rows);
            console.log('Check query rowCount:', checkResult.rowCount);

            if (checkResult.rowCount === 0) {
                console.log('ERROR: No anomaly found with anomalyId:', anomalyId);
                return;
            }

            // Log the anomaly row before update
            const before = await client.query(`SELECT anomaly_id, status, user_id FROM anomaly_detections WHERE anomaly_id = $1`, [anomalyId]);
            console.log('Before update:', before.rows);

            // Try the update with more detailed logging
            console.log('Executing UPDATE query with params:', [status, anomalyId]);
            const result = await client.query(`
                UPDATE anomaly_detections
                SET status = $1, resolved_at = NOW()
                WHERE anomaly_id = $2
            `, [status, anomalyId]);
            console.log(`resolveAnomaly: Updated ${result.rowCount} row(s) for anomalyId=${anomalyId}, status=${status}`);

            // Log the anomaly row after update
            const after = await client.query(`SELECT anomaly_id, status, user_id FROM anomaly_detections WHERE anomaly_id = $1`, [anomalyId]);
            console.log('After update:', after.rows);

            // Additional check - try to find any anomalies for this user
            const userAnomalies = await client.query(`
                SELECT anomaly_id, status, description 
                FROM anomaly_detections 
                WHERE user_id = $1 AND status = 'pending'
            `, [userId]);
            console.log('All pending anomalies for user:', userAnomalies.rows);
        } catch (error) {
            console.error('Error resolving anomaly:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    // Get pending anomalies for user
    async getPendingAnomalies(userId) {
        const client = await pool.connect();
        try {
            const anomalies = await client.query(`
                SELECT anomaly_id, anomaly_type, severity, description, detected_at, metadata
                FROM anomaly_detections
                WHERE user_id = $1 AND status = 'pending'
                ORDER BY detected_at DESC
            `, [userId]);

            return anomalies.rows;
        } catch (error) {
            console.error('Error getting pending anomalies:', error);
            return [];
        } finally {
            client.release();
        }
    }

    // Reject all pending anomalies for a user
    async rejectAllPendingAnomalies(userId) {
        const client = await pool.connect();
        try {
            console.log('=== rejectAllPendingAnomalies called ===');
            console.log('userId type:', typeof userId, 'value:', userId);

            // First check what pending anomalies exist
            const checkPending = await client.query(`
                SELECT anomaly_id, status, description 
                FROM anomaly_detections 
                WHERE user_id = $1 AND status = 'pending'
            `, [userId]);
            console.log('Pending anomalies before rejection:', checkPending.rows);

            const result = await client.query(`
                UPDATE anomaly_detections
                SET status = 'rejected', resolved_at = NOW()
                WHERE user_id = $1 AND status = 'pending'
            `, [userId]);
            console.log(`rejectAllPendingAnomalies: Updated ${result.rowCount} row(s) for userId=${userId}`);

            // Check what's left after the update
            const checkAfter = await client.query(`
                SELECT anomaly_id, status, description 
                FROM anomaly_detections 
                WHERE user_id = $1 AND status = 'pending'
            `, [userId]);
            console.log('Pending anomalies after rejection:', checkAfter.rows);
        } catch (error) {
            console.error('Error rejecting pending anomalies:', error);
            throw error;
        } finally {
            client.release();
        }
    }
}

export default new AnomalyDetectionService(); 