import express from "express";
import { homePage, settingsPage, updateSecurityQuestions, verifyAnomaly, getSecurityQuestions, testAnomaly, getFraudInsights, updateProfile, checkUsernameUnique, checkEmailUnique, checkUsernameAndEmailUnique, getNotificationSettings, updateNotificationSettings, enrollFace, authFace, deleteFace, faceStatus, transactionsPage, requestBankStatement, changePassword } from "../controllers/homeController.js";
import { analyticsPage } from "../controllers/analyticsController.js";
import { statementPage, generateStatementPDF } from "../controllers/statementController.js";
import path from "path";
import {ensureAuth} from "../middlewares/ensureAuth.js";
import pool from "../auth/db.js";

const homeRouter = express.Router();

homeRouter.get("/", ensureAuth, homePage);
homeRouter.get("/settings", ensureAuth, settingsPage);
homeRouter.post("/settings/security-questions", ensureAuth, updateSecurityQuestions);
homeRouter.post("/test-security-questions", ensureAuth, (req, res) => {
    console.log('Test security questions endpoint called');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    console.log('Request headers:', req.headers);
    res.json({ 
        success: true, 
        message: 'Test endpoint reached',
        receivedData: req.body 
    });
});

// Simple test endpoint without auth for debugging
homeRouter.post("/debug-security-questions", (req, res) => {
    console.log('=== DEBUG SECURITY QUESTIONS ===');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    console.log('Request headers:', req.headers);
    console.log('Request method:', req.method);
    console.log('Request URL:', req.url);
    res.json({ 
        success: true, 
        message: 'Debug endpoint reached',
        receivedData: req.body,
        timestamp: new Date().toISOString()
    });
});

// Test endpoint to check security questions for current user
homeRouter.get("/check-security-questions", ensureAuth, async (req, res) => {
    try {
        const anomalyDetection = await import('../services/anomalyDetection.js');
        const hasQuestions = await anomalyDetection.default.hasSecurityQuestions(req.user.user_id);
        
        res.json({
            success: true,
            hasSecurityQuestions: hasQuestions,
            userId: req.user.user_id
        });
    } catch (error) {
        console.error('Error checking security questions:', error);
        res.status(500).json({
            success: false,
            message: 'Error checking security questions',
            error: error.message
        });
    }
});
homeRouter.post("/verify-anomaly", ensureAuth, verifyAnomaly);
homeRouter.get("/security-questions", ensureAuth, getSecurityQuestions);
homeRouter.post("/test-anomaly", ensureAuth, testAnomaly);
homeRouter.get("/fraud-insights", ensureAuth, getFraudInsights);
homeRouter.patch("/settings/profile", ensureAuth, updateProfile);
// Public username validation (no auth required)
homeRouter.get("/check-username", async (req, res) => {
  const client = await pool.connect();
  try {
    const { username } = req.query;
    
    console.log('🔍 Public username validation request:', { username });
    
    if (!username) {
      return res.status(400).json({ 
        success: false, 
        message: 'Username is required' 
      });
    }

    const trimmedUsername = username.trim();
    
    // Validate username format
    if (!/^[a-zA-Z0-9_]{3,30}$/.test(trimmedUsername)) {
      return res.json({ 
        unique: false, 
        message: 'Username must be 3-30 characters and contain only letters, numbers, and underscores' 
      });
    }

    // Check if username exists (without excluding any user)
    const result = await client.query(
      'SELECT user_id, username FROM luno_users WHERE username = $1',
      [trimmedUsername]
    );

    const isUnique = result.rows.length === 0;
    
    console.log('🔍 Public username check result:', {
      username: trimmedUsername,
      isUnique,
      existingUsers: result.rows.length
    });
    
    res.json({ 
      success: true, 
      unique: isUnique,
      message: isUnique ? 'Username is available' : 'Username is already in use'
    });

  } catch (error) {
    console.error('Error checking username uniqueness:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error checking username uniqueness'
    });
  } finally {
    client.release();
  }
});

// Public email validation (no auth required)
homeRouter.get("/check-email", async (req, res) => {
  const client = await pool.connect();
  try {
    const { email } = req.query;
    
    console.log('🔍 Public email validation request:', { email });
    
    if (!email) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email is required' 
      });
    }

    const trimmedEmail = email.trim();
    
    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      return res.json({ 
        unique: false, 
        message: 'Please enter a valid email address' 
      });
    }

    // Check if email exists (without excluding any user)
    const result = await client.query(
      'SELECT user_id, email FROM luno_users WHERE email = $1',
      [trimmedEmail]
    );

    const isUnique = result.rows.length === 0;
    
    console.log('🔍 Public email check result:', {
      email: trimmedEmail,
      isUnique,
      existingUsers: result.rows.length
    });
    
    res.json({ 
      success: true, 
      unique: isUnique,
      message: isUnique ? 'Email is available' : 'Email is already in use'
    });

  } catch (error) {
    console.error('Error checking email uniqueness:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error checking email uniqueness'
    });
  } finally {
    client.release();
  }
});

// Authenticated username validation (for profile updates)
homeRouter.get("/check-username-auth", ensureAuth, checkUsernameUnique);
homeRouter.get("/check-email-auth", ensureAuth, checkEmailUnique);
homeRouter.get("/debug-user", ensureAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT user_id, username, email FROM luno_users WHERE user_id = $1', [req.user.user_id]);
    res.json({ success: true, user: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
});

// Debug endpoint to see all usernames in database
homeRouter.get("/debug-all-usernames", async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT user_id, username, email FROM luno_users ORDER BY username');
    res.json({ 
      success: true, 
      count: result.rows.length,
      users: result.rows 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
});
homeRouter.post("/check-username", ensureAuth, checkUsernameUnique);
homeRouter.post("/check-email", ensureAuth, checkEmailUnique);
homeRouter.post("/check-availability", ensureAuth, checkUsernameAndEmailUnique);
homeRouter.get("/notification-settings", ensureAuth, getNotificationSettings);
homeRouter.patch("/api/notification-settings", ensureAuth, updateNotificationSettings);
homeRouter.post("/api/face/enroll", ensureAuth, enrollFace);
homeRouter.get("/enroll-face", ensureAuth, (req, res) => {
    res.redirect("/api/face/enroll");
});

// QR Scan page
homeRouter.get("/scan", ensureAuth, (req, res) => {
    res.render("scan", { active: "scan" });
});

// New feature pages
homeRouter.get("/currency", ensureAuth, (req, res) => {
    res.render("currency", { active: "currency" });
});

homeRouter.get("/voice", ensureAuth, (req, res) => {
    // Redirect to the new Gemini voice assistant
    res.redirect("/api/voice-ai/chat");
});

homeRouter.get("/predictions", ensureAuth, (req, res) => {
    res.render("predictions", { active: "predictions" });
});

// API endpoint for prediction data
homeRouter.get("/api/predictions/data", ensureAuth, async (req, res) => {
    try {
        console.log('🔧 Predictions API called - User:', req.user);
        const { type = 'expenses', days = 30 } = req.query;
        const userId = req.user?.user_id || req.user?.id || 'default-user';
        
        console.log('🔧 Predictions API - Parameters:', { type, days, userId });
        
        if (!userId || userId === 'default-user') {
            console.log('⚠️ No user ID found, using default');
        }
        
        // This would typically query your database for user's transaction data
        // For now, we'll return sample data that simulates real user data
        const sampleData = generateSampleUserData(type, days, userId);
        
        console.log('🔧 Predictions API - Generated sample data length:', sampleData.length);
        
        res.json({
            success: true,
            values: sampleData,
            type: type,
            days: days,
            message: 'Data loaded successfully'
        });
    } catch (error) {
        console.error('❌ Error loading prediction data:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load prediction data',
            values: []
        });
    }
});

// Helper function to generate sample user data
function generateSampleUserData(type, days, userId) {
    // Ensure userId is a string and has a fallback
    const safeUserId = userId ? userId.toString() : 'default-user-' + Date.now();
    
    // Create deterministic but varied data based on user ID
    const seed = safeUserId.split('').reduce((a, b) => {
        const num = parseInt(b);
        return a + (isNaN(num) ? 0 : num);
    }, 0);
    const baseAmount = type === 'expenses' ? 150 : type === 'income' ? 5000 : type === 'balance' ? 10000 : 100;
    const variation = baseAmount * 0.4;
    
    const data = [];
    for (let i = 0; i < days; i++) {
        // Use seed to create consistent but varied data
        const randomFactor = Math.sin(seed + i) * 0.5 + 0.5;
        const seasonalFactor = Math.sin(i * 2 * Math.PI / 7) * 0.2; // Weekly pattern
        const trendFactor = (i / days) * 0.1; // Slight trend over time
        
        const value = baseAmount + (randomFactor - 0.5) * variation + 
                     (baseAmount * seasonalFactor) + (baseAmount * trendFactor);
        
        data.push(Math.max(0, Math.round(value * 100) / 100));
    }
    
    return data;
}

homeRouter.get("/limits", ensureAuth, (req, res) => {
    res.render("limits", { active: "limits" });
});

homeRouter.get("/analytics", ensureAuth, analyticsPage);

homeRouter.get("/statement", ensureAuth, statementPage);
homeRouter.post("/statement/generate-pdf", ensureAuth, generateStatementPDF);

// Budget route moved to dedicated budget router


homeRouter.get("/marketplace", ensureAuth, (req, res) => {
    res.render("marketplace", { active: "marketplace" });
});

homeRouter.delete("/api/face", ensureAuth, deleteFace);
homeRouter.get("/api/face/status", ensureAuth, faceStatus);
homeRouter.post("/api/face/authenticate", ensureAuth, authFace);
homeRouter.get("/transactions", ensureAuth, transactionsPage);
homeRouter.post("/bank-statement", ensureAuth, requestBankStatement);
homeRouter.post("/settings/change-password", ensureAuth, changePassword);

export default homeRouter;