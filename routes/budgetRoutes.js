import express from 'express';
import { ensureAuth } from '../middlewares/ensureAuth.js';
import {
    getBudgetPage,
    getBudgetCategories,
    createBudgetItem,
    getUserBudgets,
    updateBudgetItem,
    deleteBudgetItem,
    clearUserBudgets,
    getBudgetUsage
} from '../controllers/budgetController.js';

const budgetRouter = express.Router();

// Budget page
budgetRouter.get('/', ensureAuth, getBudgetPage);

// API routes
budgetRouter.get('/api/categories', ensureAuth, getBudgetCategories);
budgetRouter.get('/api/budgets', ensureAuth, getUserBudgets);
budgetRouter.post('/api/budgets', ensureAuth, createBudgetItem);
budgetRouter.put('/api/budgets/:budgetId', ensureAuth, updateBudgetItem);
budgetRouter.delete('/api/budgets/:budgetId', ensureAuth, deleteBudgetItem);
budgetRouter.delete('/api/budgets', ensureAuth, clearUserBudgets);
budgetRouter.get('/api/usage', ensureAuth, getBudgetUsage);

export default budgetRouter;
