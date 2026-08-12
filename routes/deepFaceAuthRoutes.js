import express from 'express';
import multer from 'multer';
import { ensureAuth } from '../middlewares/ensureAuth.js';
// import { faceAuthRateLimit, faceAuthSecurity, faceAuthSessionSecurity } from '../middlewares/faceAuthSecurity.js';
import {
    faceEnrollmentPage,
    startFaceEnrollment,
    enrollFace,
    verifyFaceLogin,
    verifyFaceLoginJSON,
    handleFaceLoginSuccess,
    getFaceAuthStatus,
    getUserFaces,
    deleteUserFaces,
    deleteSpecificFace,
    setPrimaryFace,
    startDeepFaceAPI,
    stopDeepFaceAPI,
    checkAPIHealth
} from '../controllers/deepFaceAuthController.js';

const router = express.Router();

// Configure multer for image uploads
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 16 * 1024 * 1024, // 16MB limit
    },
    fileFilter: (req, file, cb) => {
        // Check file type
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'), false);
        }
    }
});

// Face enrollment page (protected route)
router.get('/enrollment', ensureAuth, faceEnrollmentPage);

// Start face enrollment session (protected route)
router.post('/enrollment/start', ensureAuth, startFaceEnrollment);

// Enroll face (protected route with image upload)
router.post('/enrollment/enroll', ensureAuth, upload.single('faceImage'), enrollFace);

// Verify face for login (public route for login)
router.post('/verify-login', upload.single('faceImage'), verifyFaceLogin);

// Test endpoint
router.get('/test', (req, res) => {
    console.log('=== TEST ENDPOINT CALLED ===');
    res.json({ message: 'Test endpoint working' });
});

// Verify face for login with JSON data (for frontend)
router.post('/verify-login-json', verifyFaceLoginJSON);

// Handle face login success (create session and redirect)
router.get('/face-login-success', handleFaceLoginSuccess);

// Get face authentication status (protected route)
router.get('/status', ensureAuth, getFaceAuthStatus);

// Get user's registered faces (protected route)
router.get('/faces', ensureAuth, getUserFaces);

// Delete all faces for user (protected route)
router.delete('/faces', ensureAuth, deleteUserFaces);

// Delete specific face (protected route)
router.delete('/faces/:faceIndex', ensureAuth, deleteSpecificFace);

// Set primary face (protected route)
router.post('/faces/:faceIndex/primary', ensureAuth, setPrimaryFace);

// API management routes (admin only - you might want to add admin middleware)
router.post('/api/start', startDeepFaceAPI);
router.post('/api/stop', stopDeepFaceAPI);
router.get('/api/health', checkAPIHealth);

export default router;
