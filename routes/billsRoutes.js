import express from 'express';
import { 
    billsPage, 
    processBillPayment, 
    getBillsHistory, 
    getBillStats 
} from '../controllers/billsController.js';
import { ensureAuth } from '../middlewares/ensureAuth.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(ensureAuth);

// Bills page
router.get('/', billsPage);

// Process bill payment
router.post('/pay', processBillPayment);

// Get bills history
router.get('/history', getBillsHistory);

// Get bill statistics
router.get('/stats', getBillStats);

export default router;
