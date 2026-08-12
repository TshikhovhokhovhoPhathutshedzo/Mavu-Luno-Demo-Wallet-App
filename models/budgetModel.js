import pool from '../auth/db.js';

class BudgetModel {
    constructor() {
        this.pool = pool;
    }

    /**
     * Get all available budget categories
     * @returns {Promise<Array>} Array of budget categories
     */
    async getBudgetCategories() {
        const client = await this.pool.connect();
        try {
            const result = await client.query(`
                SELECT category_id, category_name, description, icon, color
                FROM budget_categories
                WHERE is_active = true
                ORDER BY category_name
            `);
            return result.rows;
        } catch (error) {
            console.error('Error getting budget categories:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Create a new budget item for a user
     * @param {string} userId - User ID
     * @param {string} categoryId - Category ID
     * @param {number} budgetAmountRands - Budget amount in Rands
     * @param {string} periodType - Period type (weekly, monthly, yearly)
     * @returns {Promise<Object>} Result object
     */
    async createBudgetItem(userId, categoryId, budgetAmountRands, periodType = 'monthly') {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');

            // Validate period type
            if (!['weekly', 'monthly', 'yearly'].includes(periodType)) {
                throw new Error('Invalid period type. Must be weekly, monthly, or yearly');
            }

            // Validate amount
            if (budgetAmountRands <= 0) {
                throw new Error('Budget amount must be greater than 0');
            }

            // Convert to cents
            const budgetAmountCents = Math.round(budgetAmountRands * 100);

            // Check if budget already exists for this user and category
            const existingBudget = await client.query(`
                SELECT budget_id FROM user_budgets
                WHERE user_id = $1 AND category_id = $2 AND period_type = $3
            `, [userId, categoryId, periodType]);

            if (existingBudget.rows.length > 0) {
                throw new Error('Budget already exists for this category and period');
            }

            // Insert new budget
            const result = await client.query(`
                INSERT INTO user_budgets (user_id, category_id, budget_amount_cents, period_type)
                VALUES ($1, $2, $3, $4)
                RETURNING budget_id, created_at
            `, [userId, categoryId, budgetAmountCents, periodType]);

            await client.query('COMMIT');

            return {
                success: true,
                budgetId: result.rows[0].budget_id,
                createdAt: result.rows[0].created_at,
                message: 'Budget item created successfully'
            };

        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error creating budget item:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get all budget items for a user
     * @param {string} userId - User ID
     * @returns {Promise<Array>} Array of budget items with usage data
     */
    async getUserBudgets(userId) {
        const client = await this.pool.connect();
        try {
            const result = await client.query(`
                SELECT * FROM get_budget_summary($1)
            `, [userId]);

            return result.rows;
        } catch (error) {
            console.error('Error getting user budgets:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Update a budget item
     * @param {string} budgetId - Budget ID
     * @param {string} userId - User ID
     * @param {number} budgetAmountRands - New budget amount in Rands
     * @returns {Promise<Object>} Result object
     */
    async updateBudgetItem(budgetId, userId, budgetAmountRands) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');

            // Validate amount
            if (budgetAmountRands <= 0) {
                throw new Error('Budget amount must be greater than 0');
            }

            // Convert to cents
            const budgetAmountCents = Math.round(budgetAmountRands * 100);

            // Update budget
            const result = await client.query(`
                UPDATE user_budgets
                SET budget_amount_cents = $1, updated_at = CURRENT_TIMESTAMP
                WHERE budget_id = $2 AND user_id = $3
                RETURNING budget_id
            `, [budgetAmountCents, budgetId, userId]);

            if (result.rows.length === 0) {
                throw new Error('Budget item not found or access denied');
            }

            await client.query('COMMIT');

            return {
                success: true,
                budgetId: result.rows[0].budget_id,
                message: 'Budget item updated successfully'
            };

        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error updating budget item:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Delete a budget item
     * @param {string} budgetId - Budget ID
     * @param {string} userId - User ID
     * @returns {Promise<Object>} Result object
     */
    async deleteBudgetItem(budgetId, userId) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');

            // Delete budget (this will cascade to budget_usage)
            const result = await client.query(`
                DELETE FROM user_budgets
                WHERE budget_id = $1 AND user_id = $2
                RETURNING budget_id
            `, [budgetId, userId]);

            if (result.rows.length === 0) {
                throw new Error('Budget item not found or access denied');
            }

            await client.query('COMMIT');

            return {
                success: true,
                budgetId: result.rows[0].budget_id,
                message: 'Budget item deleted successfully'
            };

        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error deleting budget item:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Clear all budget items for a user
     * @param {string} userId - User ID
     * @returns {Promise<Object>} Result object
     */
    async clearUserBudgets(userId) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');

            // Delete all budgets for user (this will cascade to budget_usage)
            const result = await client.query(`
                DELETE FROM user_budgets
                WHERE user_id = $1
                RETURNING budget_id
            `, [userId]);

            await client.query('COMMIT');

            return {
                success: true,
                deletedCount: result.rows.length,
                message: `Cleared ${result.rows.length} budget items`
            };

        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error clearing user budgets:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get budget usage for a specific period
     * @param {string} userId - User ID
     * @param {string} startDate - Start date (YYYY-MM-DD)
     * @param {string} endDate - End date (YYYY-MM-DD)
     * @returns {Promise<Array>} Array of budget usage data
     */
    async getBudgetUsage(userId, startDate, endDate) {
        const client = await this.pool.connect();
        try {
            const result = await client.query(`
                SELECT 
                    bc.category_name,
                    bc.icon,
                    bc.color,
                    ub.budget_amount_cents,
                    COALESCE(SUM(bu.usage_amount_cents), 0) as total_usage_cents,
                    ROUND(ub.budget_amount_cents::NUMERIC / 100, 2) as budget_amount_rands,
                    ROUND(COALESCE(SUM(bu.usage_amount_cents), 0)::NUMERIC / 100, 2) as usage_amount_rands
                FROM user_budgets ub
                JOIN budget_categories bc ON ub.category_id = bc.category_id
                LEFT JOIN budget_usage bu ON ub.budget_id = bu.budget_id
                    AND bu.usage_date >= $2 AND bu.usage_date <= $3
                WHERE ub.user_id = $1 AND ub.is_active = true
                GROUP BY bc.category_name, bc.icon, bc.color, ub.budget_amount_cents
                ORDER BY bc.category_name
            `, [userId, startDate, endDate]);

            return result.rows;
        } catch (error) {
            console.error('Error getting budget usage:', error);
            throw error;
        } finally {
            client.release();
        }
    }
}

export default new BudgetModel();
