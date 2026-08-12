/**
 * Debug Middleware Issues
 * 
 * This script helps debug the "cannot set property path" error
 */

import express from 'express';
import { checkDepositLimits } from './middlewares/dailyLimitsCheck.js';

const app = express();
app.use(express.json());

// Test route to debug middleware
app.post('/test-middleware', (req, res, next) => {
    console.log('🔍 Testing middleware...');
    console.log('Original req.path:', req.path);
    console.log('Original req.transactionType:', req.transactionType);
    
    // Test the middleware
    checkDepositLimits(req, res, (err) => {
        if (err) {
            console.error('❌ Middleware error:', err);
            return res.status(500).json({ 
                success: false, 
                message: 'Middleware error: ' + err.message 
            });
        }
        
        console.log('✅ Middleware passed');
        console.log('Final req.path:', req.path);
        console.log('Final req.transactionType:', req.transactionType);
        
        res.json({ 
            success: true, 
            message: 'Middleware test passed',
            path: req.path,
            transactionType: req.transactionType
        });
    });
});

// Start test server
const PORT = 3001;
app.listen(PORT, () => {
    console.log(`🧪 Test server running on port ${PORT}`);
    console.log('Test with: curl -X POST http://localhost:3001/test-middleware -H "Content-Type: application/json" -d "{\"amount\": 1000}"');
});

export default app;
