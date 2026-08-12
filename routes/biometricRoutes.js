import express from 'express';
import BehavioralBiometrics from '../models/behavioralBiometrics.js';

const router = express.Router();
const biometrics = new BehavioralBiometrics();

// Get user patterns
router.get('/patterns', async (req, res) => {
    try {
        const userId = req.user.user_id;
        const patterns = await biometrics.getUserPatterns(userId);
        res.json({ patterns });
    } catch (error) {
        console.error('Error getting patterns:', error);
        res.status(500).json({ error: 'Failed to get patterns' });
    }
});

// Setup biometric pattern
router.post('/setup', async (req, res) => {
    try {
        const userId = req.user.user_id;
        const { patternType, patternData } = req.body;
        
        const result = await biometrics.setupBiometrics(userId, patternType, patternData);
        res.json(result);
    } catch (error) {
        console.error('Error setting up biometrics:', error);
        res.status(500).json({ error: 'Failed to setup biometrics' });
    }
});

// Verify pattern
router.post('/verify', async (req, res) => {
    try {
        const userId = req.user.user_id;
        const { patternType, patternData } = req.body;
        
        const result = await biometrics.verifyPattern(userId, patternType, patternData);
        res.json(result);
    } catch (error) {
        console.error('Error verifying pattern:', error);
        res.status(500).json({ error: 'Failed to verify pattern' });
    }
});

// Update pattern settings
router.put('/settings', async (req, res) => {
    try {
        const userId = req.user.user_id;
        const { patternType, active } = req.body;
        
        const result = await biometrics.updatePatternSettings(userId, patternType, active);
        res.json(result);
    } catch (error) {
        console.error('Error updating pattern settings:', error);
        res.status(500).json({ error: 'Failed to update pattern settings' });
    }
});

// Delete pattern
router.delete('/patterns', async (req, res) => {
    try {
        const userId = req.user.user_id;
        const { patternType } = req.body;
        
        const result = await biometrics.deletePattern(userId, patternType);
        res.json(result);
    } catch (error) {
        console.error('Error deleting pattern:', error);
        res.status(500).json({ error: 'Failed to delete pattern' });
    }
});

// Get verification statistics
router.get('/stats', async (req, res) => {
    try {
        const userId = req.user.user_id;
        const stats = await biometrics.getVerificationStats(userId);
        res.json(stats);
    } catch (error) {
        console.error('Error getting verification stats:', error);
        res.status(500).json({ error: 'Failed to get verification stats' });
    }
});

export default router;
