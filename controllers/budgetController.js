import BudgetModel from '../models/budgetModel.js';

/**
 * Get budget page
 */
export const getBudgetPage = async (req, res) => {
    try {
        const userId = req.user.user_id;
        
        // Get user's budget items
        const budgetItems = await BudgetModel.getUserBudgets(userId);
        
        // Get available categories
        const categories = await BudgetModel.getBudgetCategories();
        
        res.render('budget', {
            active: 'budget',
            budgetItems,
            categories,
            user: req.user
        });
    } catch (error) {
        console.error('Error getting budget page:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load budget page',
            message: error.message || 'An error occurred while loading the budget page'
        });
    }
};

/**
 * Get all budget categories
 */
export const getBudgetCategories = async (req, res) => {
    try {
        const categories = await BudgetModel.getBudgetCategories();
        res.json({
            success: true,
            categories
        });
    } catch (error) {
        console.error('Error getting budget categories:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get budget categories'
        });
    }
};

/**
 * Create a new budget item
 */
export const createBudgetItem = async (req, res) => {
    try {
        const userId = req.user.user_id;
        const { categoryId, budgetAmount, periodType = 'monthly' } = req.body;

        // Validate input
        if (!categoryId) {
            return res.status(400).json({
                success: false,
                message: 'Category ID is required'
            });
        }

        if (!budgetAmount || budgetAmount <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Budget amount must be greater than 0'
            });
        }

        const result = await BudgetModel.createBudgetItem(
            userId,
            categoryId,
            parseFloat(budgetAmount),
            periodType
        );

        res.json({
            success: true,
            message: result.message,
            budgetId: result.budgetId
        });

    } catch (error) {
        console.error('Error creating budget item:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to create budget item'
        });
    }
};

/**
 * Get user's budget items
 */
export const getUserBudgets = async (req, res) => {
    try {
        const userId = req.user.user_id;
        const budgetItems = await BudgetModel.getUserBudgets(userId);

        res.json({
            success: true,
            budgetItems
        });
    } catch (error) {
        console.error('Error getting user budgets:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get budget items'
        });
    }
};

/**
 * Update a budget item
 */
export const updateBudgetItem = async (req, res) => {
    try {
        const userId = req.user.user_id;
        const { budgetId } = req.params;
        const { budgetAmount } = req.body;

        if (!budgetAmount || budgetAmount <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Budget amount must be greater than 0'
            });
        }

        const result = await BudgetModel.updateBudgetItem(
            budgetId,
            userId,
            parseFloat(budgetAmount)
        );

        res.json({
            success: true,
            message: result.message
        });

    } catch (error) {
        console.error('Error updating budget item:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to update budget item'
        });
    }
};

/**
 * Delete a budget item
 */
export const deleteBudgetItem = async (req, res) => {
    try {
        const userId = req.user.user_id;
        const { budgetId } = req.params;

        const result = await BudgetModel.deleteBudgetItem(budgetId, userId);

        res.json({
            success: true,
            message: result.message
        });

    } catch (error) {
        console.error('Error deleting budget item:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to delete budget item'
        });
    }
};

/**
 * Clear all budget items for a user
 */
export const clearUserBudgets = async (req, res) => {
    try {
        const userId = req.user.user_id;

        const result = await BudgetModel.clearUserBudgets(userId);

        res.json({
            success: true,
            message: result.message,
            deletedCount: result.deletedCount
        });

    } catch (error) {
        console.error('Error clearing user budgets:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to clear budget items'
        });
    }
};

/**
 * Get budget usage for a specific period
 */
export const getBudgetUsage = async (req, res) => {
    try {
        const userId = req.user.user_id;
        const { startDate, endDate } = req.query;

        if (!startDate || !endDate) {
            return res.status(400).json({
                success: false,
                message: 'Start date and end date are required'
            });
        }

        const usage = await BudgetModel.getBudgetUsage(userId, startDate, endDate);

        res.json({
            success: true,
            usage
        });

    } catch (error) {
        console.error('Error getting budget usage:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get budget usage'
        });
    }
};
