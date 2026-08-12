import pool from "../auth/db.js";
import { randsToCents, centsToRands, formatRands } from "../utils/currencyUtils.js";

/**
 * Daily Limits Model
 * Handles user-configurable daily limits for deposits and withdrawals
 * 
 * Currency Handling:
 * - User input: Amounts in Rands (ZAR) with decimal places
 * - Database storage: Amounts in cents (BIGINT) for precision
 * - Calculations: All done in cents to avoid floating point errors
 * - Display: Convert back to Rands by dividing by 100 and formatting to 2 decimal places
 */

class DailyLimitsModel {
    /**
     * Set a daily limit for a user
     * @param {string} userId - User ID
     * @param {string} limitType - 'deposit' or 'withdrawal'
     * @param {number} limitAmountRands - Limit amount in Rands
     * @param {string} changedBy - Who changed the limit ('user', 'admin', 'system')
     * @param {string} changeReason - Reason for the change
     * @returns {Promise<Object>} Result object
     */
    async setDailyLimit(userId, limitType, limitAmountRands, changedBy = 'user', changeReason = null) {
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');
            
            // Validate limit type
            if (!['deposit', 'withdrawal'].includes(limitType)) {
                throw new Error('Invalid limit type. Must be "deposit" or "withdrawal"');
            }
            
            // Validate amount
            if (limitAmountRands <= 0) {
                throw new Error('Daily limit must be greater than 0');
            }
            
            // Convert to cents
            const limitAmountCents = randsToCents(limitAmountRands);
            
            // Get current limit for history
            const currentLimitResult = await client.query(`
                SELECT daily_limit_cents FROM user_daily_limits 
                WHERE user_id = $1 AND limit_type = $2
            `, [userId, limitType]);
            
            const oldLimitCents = currentLimitResult.rows.length > 0 ? 
                parseInt(currentLimitResult.rows[0].daily_limit_cents) : null;
            
            // Insert or update the limit
            await client.query(`
                INSERT INTO user_daily_limits (user_id, limit_type, daily_limit_cents, is_active)
                VALUES ($1, $2, $3, true)
                ON CONFLICT (user_id, limit_type)
                DO UPDATE SET
                    daily_limit_cents = $3,
                    is_active = true,
                    updated_at = CURRENT_TIMESTAMP
            `, [userId, limitType, limitAmountCents]);
            
            // Record the change in history
            await client.query(`
                INSERT INTO limit_change_history 
                (user_id, limit_type, old_limit_cents, new_limit_cents, changed_by, change_reason)
                VALUES ($1, $2, $3, $4, $5, $6)
            `, [userId, limitType, oldLimitCents, limitAmountCents, changedBy, changeReason]);
            
            await client.query('COMMIT');
            
            return {
                success: true,
                message: `Daily ${limitType} limit set to ${formatRands(limitAmountCents)}`,
                limit: {
                    type: limitType,
                    amountRands: limitAmountRands,
                    amountCents: limitAmountCents
                }
            };
            
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }
    
    /**
     * Get user's daily limits
     * @param {string} userId - User ID
     * @returns {Promise<Object>} User's limits
     */
    async getUserLimits(userId) {
        const client = await pool.connect();
        
        try {
            const result = await client.query(`
                SELECT limit_type, daily_limit_cents, is_active, created_at, updated_at
                FROM user_daily_limits
                WHERE user_id = $1
                ORDER BY limit_type
            `, [userId]);
            
            const limits = {
                deposit: null,
                withdrawal: null
            };
            
            result.rows.forEach(row => {
                limits[row.limit_type] = {
                    amountRands: centsToRands(parseInt(row.daily_limit_cents)),
                    amountCents: parseInt(row.daily_limit_cents),
                    isActive: row.is_active,
                    createdAt: row.created_at,
                    updatedAt: row.updated_at
                };
            });
            
            return {
                success: true,
                limits: limits
            };
            
        } catch (error) {
            throw error;
        } finally {
            client.release();
        }
    }
    
    /**
     * Get user's daily usage for a specific type and date
     * @param {string} userId - User ID
     * @param {string} limitType - 'deposit' or 'withdrawal'
     * @param {Date} date - Date to check (defaults to today)
     * @returns {Promise<Object>} Usage information
     */
    async getDailyUsage(userId, limitType, date = new Date()) {
        const client = await pool.connect();
        
        try {
            const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD format
            
            const result = await client.query(`
                SELECT total_amount_cents, transaction_count, last_transaction_at
                FROM daily_transaction_usage
                WHERE user_id = $1 AND transaction_type = $2 AND transaction_date = $3
            `, [userId, limitType, dateStr]);
            
            if (result.rows.length === 0) {
                return {
                    success: true,
                    usage: {
                        amountRands: 0,
                        amountCents: 0,
                        transactionCount: 0,
                        lastTransactionAt: null
                    }
                };
            }
            
            const row = result.rows[0];
            return {
                success: true,
                usage: {
                    amountRands: centsToRands(parseInt(row.total_amount_cents)),
                    amountCents: parseInt(row.total_amount_cents),
                    transactionCount: row.transaction_count,
                    lastTransactionAt: row.last_transaction_at
                }
            };
            
        } catch (error) {
            throw error;
        } finally {
            client.release();
        }
    }
    
    /**
     * Check if a transaction would exceed the daily limit
     * @param {string} userId - User ID
     * @param {string} limitType - 'deposit' or 'withdrawal'
     * @param {number} amountRands - Transaction amount in Rands
     * @param {Date} date - Date to check (defaults to today)
     * @returns {Promise<Object>} Limit check result
     */
    async checkDailyLimit(userId, limitType, amountRands, date = new Date()) {
        const client = await pool.connect();
        
        try {
            const amountCents = randsToCents(amountRands);
            const dateStr = date.toISOString().split('T')[0];
            
            const result = await client.query(`
                SELECT * FROM check_daily_limit($1, $2, $3, $4)
            `, [userId, limitType, amountCents, dateStr]);
            
            if (result.rows.length === 0) {
                throw new Error('Failed to check daily limit');
            }
            
            const row = result.rows[0];
            
            return {
                success: true,
                isWithinLimit: row.is_within_limit,
                currentUsage: {
                    amountRands: centsToRands(parseInt(row.current_usage_cents)),
                    amountCents: parseInt(row.current_usage_cents)
                },
                dailyLimit: {
                    amountRands: centsToRands(parseInt(row.daily_limit_cents)),
                    amountCents: parseInt(row.daily_limit_cents)
                },
                remainingLimit: {
                    amountRands: centsToRands(parseInt(row.remaining_limit_cents)),
                    amountCents: parseInt(row.remaining_limit_cents)
                }
            };
            
        } catch (error) {
            throw error;
        } finally {
            client.release();
        }
    }
    
    /**
     * Update daily usage after a transaction
     * @param {string} userId - User ID
     * @param {string} limitType - 'deposit' or 'withdrawal'
     * @param {number} amountRands - Transaction amount in Rands
     * @param {Date} date - Date of transaction (defaults to today)
     * @returns {Promise<Object>} Update result
     */
    async updateDailyUsage(userId, limitType, amountRands, date = new Date()) {
        const client = await pool.connect();
        
        try {
            const amountCents = randsToCents(amountRands);
            const dateStr = date.toISOString().split('T')[0];
            
            await client.query(`
                SELECT update_daily_usage($1, $2, $3, $4)
            `, [userId, limitType, amountCents, dateStr]);
            
            return {
                success: true,
                message: 'Daily usage updated successfully'
            };
            
        } catch (error) {
            throw error;
        } finally {
            client.release();
        }
    }
    
    /**
     * Disable a daily limit (set to unlimited)
     * @param {string} userId - User ID
     * @param {string} limitType - 'deposit' or 'withdrawal'
     * @param {string} changedBy - Who disabled the limit
     * @param {string} changeReason - Reason for disabling
     * @returns {Promise<Object>} Result object
     */
    async disableDailyLimit(userId, limitType, changedBy = 'user', changeReason = null) {
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');
            
            // Get current limit for history
            const currentLimitResult = await client.query(`
                SELECT daily_limit_cents FROM user_daily_limits 
                WHERE user_id = $1 AND limit_type = $2
            `, [userId, limitType]);
            
            const oldLimitCents = currentLimitResult.rows.length > 0 ? 
                parseInt(currentLimitResult.rows[0].daily_limit_cents) : null;
            
            // Update the limit to inactive
            await client.query(`
                UPDATE user_daily_limits 
                SET is_active = false, updated_at = CURRENT_TIMESTAMP
                WHERE user_id = $1 AND limit_type = $2
            `, [userId, limitType]);
            
            // Record the change in history
            await client.query(`
                INSERT INTO limit_change_history 
                (user_id, limit_type, old_limit_cents, new_limit_cents, changed_by, change_reason)
                VALUES ($1, $2, $3, 0, $4, $5)
            `, [userId, limitType, oldLimitCents, changedBy, changeReason || 'Limit disabled']);
            
            await client.query('COMMIT');
            
            return {
                success: true,
                message: `Daily ${limitType} limit disabled (unlimited)`
            };
            
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }
    
    /**
     * Get limit change history for a user
     * @param {string} userId - User ID
     * @param {string} limitType - Optional filter by limit type
     * @param {number} limit - Number of records to return (default 50)
     * @returns {Promise<Object>} History records
     */
    async getLimitHistory(userId, limitType = null, limit = 50) {
        const client = await pool.connect();
        
        try {
            let query = `
                SELECT limit_type, old_limit_cents, new_limit_cents, changed_by, 
                       change_reason, created_at
                FROM limit_change_history
                WHERE user_id = $1
            `;
            const params = [userId];
            
            if (limitType) {
                query += ` AND limit_type = $2`;
                params.push(limitType);
            }
            
            query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
            params.push(limit);
            
            const result = await client.query(query, params);
            
            const history = result.rows.map(row => ({
                limitType: row.limit_type,
                oldLimit: row.old_limit_cents ? {
                    amountRands: centsToRands(parseInt(row.old_limit_cents)),
                    amountCents: parseInt(row.old_limit_cents)
                } : null,
                newLimit: {
                    amountRands: centsToRands(parseInt(row.new_limit_cents)),
                    amountCents: parseInt(row.new_limit_cents)
                },
                changedBy: row.changed_by,
                changeReason: row.change_reason,
                changedAt: row.created_at
            }));
            
            return {
                success: true,
                history: history
            };
            
        } catch (error) {
            throw error;
        } finally {
            client.release();
        }
    }
    
    /**
     * Get comprehensive limit status for a user
     * @param {string} userId - User ID
     * @param {Date} date - Date to check (defaults to today)
     * @returns {Promise<Object>} Complete limit status
     */
    async getLimitStatus(userId, date = new Date()) {
        const client = await pool.connect();
        
        try {
            // Get user's limits
            const limitsResult = await this.getUserLimits(userId);
            
            // Get today's usage for both types
            const depositUsage = await this.getDailyUsage(userId, 'deposit', date);
            const withdrawalUsage = await this.getDailyUsage(userId, 'withdrawal', date);
            
            return {
                success: true,
                date: date.toISOString().split('T')[0],
                limits: limitsResult.limits,
                usage: {
                    deposit: depositUsage.usage,
                    withdrawal: withdrawalUsage.usage
                },
                status: {
                    deposit: limitsResult.limits.deposit ? {
                        isLimited: limitsResult.limits.deposit.isActive,
                        remaining: limitsResult.limits.deposit.isActive ? {
                            amountRands: Math.max(0, limitsResult.limits.deposit.amountRands - depositUsage.usage.amountRands),
                            amountCents: Math.max(0, limitsResult.limits.deposit.amountCents - depositUsage.usage.amountCents)
                        } : null
                    } : { isLimited: false, remaining: null },
                    withdrawal: limitsResult.limits.withdrawal ? {
                        isLimited: limitsResult.limits.withdrawal.isActive,
                        remaining: limitsResult.limits.withdrawal.isActive ? {
                            amountRands: Math.max(0, limitsResult.limits.withdrawal.amountRands - withdrawalUsage.usage.amountRands),
                            amountCents: Math.max(0, limitsResult.limits.withdrawal.amountCents - withdrawalUsage.usage.amountCents)
                        } : null
                    } : { isLimited: false, remaining: null }
                }
            };
            
        } catch (error) {
            throw error;
        } finally {
            client.release();
        }
    }
}

export default new DailyLimitsModel();

