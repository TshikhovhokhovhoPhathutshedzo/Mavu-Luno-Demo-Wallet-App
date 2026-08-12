import pool from '../auth/db.js';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * DeepFace Face Authentication Controller
 * Integrates DeepFace face recognition with LunoWallet
 */

class DeepFaceAuthController {
    constructor() {
        this.pythonPath = path.join(__dirname, '..', 'face_auth_deepface');
        this.apiScript = path.join(this.pythonPath, 'face_auth_api.py');
        this.pythonProcess = null;
        this.apiBaseUrl = 'http://localhost:5001';
    }

    /**
     * Start the DeepFace API server
     */
    async startDeepFaceAPI() {
        try {
            if (this.pythonProcess) {
                console.log('DeepFace API already running');
                return true;
            }

            console.log('Starting DeepFace API server...');
            this.pythonProcess = spawn('python', [this.apiScript], {
                cwd: this.pythonPath,
                stdio: ['pipe', 'pipe', 'pipe']
            });

            this.pythonProcess.stdout.on('data', (data) => {
                console.log(`DeepFace API: ${data}`);
            });

            this.pythonProcess.stderr.on('data', (data) => {
                console.error(`DeepFace API Error: ${data}`);
            });

            this.pythonProcess.on('close', (code) => {
                console.log(`DeepFace API process exited with code ${code}`);
                this.pythonProcess = null;
            });

            // Wait a moment for the server to start
            await new Promise(resolve => setTimeout(resolve, 3000));
            return true;
        } catch (error) {
            console.error('Error starting DeepFace API:', error);
            return false;
        }
    }

    /**
     * Stop the DeepFace API server
     */
    stopDeepFaceAPI() {
        if (this.pythonProcess) {
            this.pythonProcess.kill();
            this.pythonProcess = null;
            console.log('DeepFace API server stopped');
        }
    }

    /**
     * Check if DeepFace API is running
     */
    async checkAPIHealth() {
        try {
            const response = await fetch(`${this.apiBaseUrl}/face-auth/health`);
            const data = await response.json();
            return data.success;
        } catch (error) {
            return false;
        }
    }

    /**
     * Make API call to DeepFace service
     */
    async makeAPICall(endpoint, method = 'GET', data = null) {
        try {
            const options = {
                method,
                headers: {
                    'Content-Type': 'application/json'
                }
            };

            if (data) {
                options.body = JSON.stringify(data);
            }

            const response = await fetch(`${this.apiBaseUrl}${endpoint}`, options);
            return await response.json();
        } catch (error) {
            console.error(`API call failed: ${error}`);
            return { success: false, message: 'API call failed' };
        }
    }

    /**
     * Register a face for a user
     */
    async registerFace(userId, username, email, imageBuffer, isPrimary = false) {
        try {
            // Ensure API is running
            const isRunning = await this.checkAPIHealth();
            if (!isRunning) {
                const started = await this.startDeepFaceAPI();
                if (!started) {
                    return { success: false, message: 'Failed to start DeepFace API' };
                }
            }

            // Convert buffer to base64
            const base64Image = imageBuffer.toString('base64');
            
            // Create form data
            const formData = new FormData();
            const blob = new Blob([imageBuffer], { type: 'image/jpeg' });
            formData.append('face_image', blob, 'face.jpg');
            formData.append('data', JSON.stringify({
                user_id: userId,
                username: username,
                email: email,
                is_primary: isPrimary
            }));

            const response = await fetch(`${this.apiBaseUrl}/face-auth/register`, {
                method: 'POST',
                body: formData
            });

            return await response.json();
        } catch (error) {
            console.error('Error registering face:', error);
            return { success: false, message: 'Error registering face' };
        }
    }

    /**
     * Verify face for login
     */
    async verifyFaceLogin(userId, imageBuffer) {
        try {
            // Ensure API is running
            const isRunning = await this.checkAPIHealth();
            if (!isRunning) {
                const started = await this.startDeepFaceAPI();
                if (!started) {
                    return { success: false, message: 'Failed to start DeepFace API' };
                }
            }

            // Create form data
            const formData = new FormData();
            const blob = new Blob([imageBuffer], { type: 'image/jpeg' });
            formData.append('face_image', blob, 'login_face.jpg');
            formData.append('data', JSON.stringify({
                user_id: userId
            }));

            const response = await fetch(`${this.apiBaseUrl}/face-auth/login`, {
                method: 'POST',
                body: formData
            });

            return await response.json();
        } catch (error) {
            console.error('Error verifying face login:', error);
            return { success: false, message: 'Error verifying face login' };
        }
    }

    /**
     * Verify face for login against all users (for login page)
     */
    async verifyFaceLoginForAnyUser(imageBuffer) {
        try {
            // Ensure API is running
            const isRunning = await this.checkAPIHealth();
            if (!isRunning) {
                const started = await this.startDeepFaceAPI();
                if (!started) {
                    return { success: false, message: 'Failed to start DeepFace API' };
                }
            }

            // Convert buffer to base64 for JSON API
            const base64Image = imageBuffer.toString('base64');
            const dataUrl = `data:image/jpeg;base64,${base64Image}`;

            const response = await fetch(`${this.apiBaseUrl}/face-auth/verify-any-user`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    image: dataUrl
                })
            });

            return await response.json();
        } catch (error) {
            console.error('Error verifying face login for any user:', error);
            return { success: false, message: 'Error verifying face login' };
        }
    }

    /**
     * Get face authentication status for a user
     */
    async getFaceAuthStatus(userId) {
        try {
            return await this.makeAPICall(`/face-auth/status/${userId}`);
        } catch (error) {
            console.error('Error getting face auth status:', error);
            return { success: false, message: 'Error getting face auth status' };
        }
    }

    /**
     * Get user's registered faces
     */
    async getUserFaces(userId) {
        try {
            return await this.makeAPICall(`/face-auth/faces/${userId}`);
        } catch (error) {
            console.error('Error getting user faces:', error);
            return { success: false, message: 'Error getting user faces' };
        }
    }

    /**
     * Delete all faces for a user
     */
    async deleteUserFaces(userId) {
        try {
            return await this.makeAPICall(`/face-auth/faces/${userId}`, 'DELETE');
        } catch (error) {
            console.error('Error deleting user faces:', error);
            return { success: false, message: 'Error deleting user faces' };
        }
    }

    /**
     * Delete a specific face for a user
     */
    async deleteSpecificFace(userId, faceIndex) {
        try {
            return await this.makeAPICall(`/face-auth/faces/${userId}/${faceIndex}`, 'DELETE');
        } catch (error) {
            console.error('Error deleting specific face:', error);
            return { success: false, message: 'Error deleting specific face' };
        }
    }

    /**
     * Set a face as primary for a user
     */
    async setPrimaryFace(userId, faceIndex) {
        try {
            return await this.makeAPICall(`/face-auth/faces/${userId}/${faceIndex}/primary`, 'POST');
        } catch (error) {
            console.error('Error setting primary face:', error);
            return { success: false, message: 'Error setting primary face' };
        }
    }
}

// Create singleton instance
const deepFaceAuthController = new DeepFaceAuthController();

// Export controller functions
export const faceEnrollmentPage = async (req, res) => {
    if (!req.user) {
        return res.redirect('/authorized/login');
    }

    try {
        const faceAuthStatus = await deepFaceAuthController.getFaceAuthStatus(req.user.user_id);
        
        res.render('deepface-enrollment', {
            user: req.user,
            faceAuthStatus,
            active: 'settings',
            success: req.flash('success'),
            error: req.flash('error')
        });
    } catch (error) {
        console.error('Error loading face enrollment page:', error);
        req.flash('error', 'Failed to load face enrollment page');
        res.redirect('/settings');
    }
};

export const startFaceEnrollment = async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    try {
        // Check if DeepFace API is available
        const isRunning = await deepFaceAuthController.checkAPIHealth();
        if (!isRunning) {
            const started = await deepFaceAuthController.startDeepFaceAPI();
            if (!started) {
                return res.status(503).json({ 
                    success: false, 
                    message: 'Face recognition service is currently unavailable' 
                });
            }
        }

        // Check if user already has face auth enabled
        const faceAuthStatus = await deepFaceAuthController.getFaceAuthStatus(req.user.user_id);
        
        if (faceAuthStatus.success && faceAuthStatus.face_auth_enabled) {
            return res.json({ 
                success: false, 
                message: 'Face authentication is already enabled for this user' 
            });
        }

        return res.json({ 
            success: true, 
            message: 'Face enrollment session started',
            sessionId: `face_enroll_${Date.now()}`
        });
    } catch (error) {
        console.error('Error starting face enrollment:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Failed to start face enrollment' 
        });
    }
};

export const enrollFace = async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No image provided' });
        }

        const { isPrimary } = req.body;
        const imageBuffer = req.file.buffer;

        const result = await deepFaceAuthController.registerFace(
            req.user.user_id,
            req.user.username,
            req.user.email,
            imageBuffer,
            isPrimary === 'true'
        );

        if (result.success) {
            req.flash('success', 'Face registered successfully!');
        } else {
            req.flash('error', result.message);
        }

        return res.json(result);
    } catch (error) {
        console.error('Error enrolling face:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Failed to enroll face' 
        });
    }
};

export const verifyFaceLogin = async (req, res) => {
    try {
        const { userId } = req.body;
        
        if (!userId) {
            return res.status(400).json({ success: false, message: 'User ID is required' });
        }

        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No image provided' });
        }

        const imageBuffer = req.file.buffer;
        const result = await deepFaceAuthController.verifyFaceLogin(userId, imageBuffer);

        return res.json(result);
    } catch (error) {
        console.error('Error verifying face login:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Failed to verify face login' 
        });
    }
};

export const verifyFaceLoginJSON = async (req, res) => {
    console.log('=== FACE LOGIN JSON ENDPOINT CALLED ===');
    console.log('Request body:', req.body);
    console.log('Session ID:', req.sessionID);
    console.log('Session data:', req.session);
    
    try {
        const { imageData } = req.body;
        
        if (!imageData) {
            console.log('No image data provided');
            return res.status(400).json({ success: false, message: 'No image data provided' });
        }

        // Convert base64 to buffer
        const base64Data = imageData.replace(/^data:image\/[a-z]+;base64,/, '');
        const imageBuffer = Buffer.from(base64Data, 'base64');

        // For face login, we need to find which user this face belongs to
        // We'll need to check all users' faces to find a match
        const result = await deepFaceAuthController.verifyFaceLoginForAnyUser(imageBuffer);

        // If face verification is successful, authenticate the user directly
        if (result.success && result.user_id) {
            try {
                // Get user data from database
                const client = await pool.connect();
                try {
                    const userResult = await client.query(
                        'SELECT user_id, username, email, account_number FROM luno_users WHERE user_id = $1',
                        [result.user_id]
                    );

                    if (userResult.rows.length === 0) {
                        return res.json({
                            success: false,
                            message: 'User not found in database'
                        });
                    }

                    const user = userResult.rows[0];
                    console.log('Found user for authentication:', user);

                    // Use Passport.js to authenticate the user
                    req.login(user, (err) => {
                        // Release database connection in the callback
                        client.release();
                        
                        if (err) {
                            console.error('Error logging in user:', err);
                            return res.json({
                                success: false,
                                message: 'Failed to authenticate user'
                            });
                        }
                        
                        console.log('User authenticated with Passport.js');
                        console.log('User after login:', req.user);
                        console.log('Is authenticated:', req.isAuthenticated());
                        
                        // Set additional session data for face authentication
                        req.session.faceAuthenticated = true;
                        req.session.faceAuthTime = Date.now();
                        req.session.faceAuthMethod = 'deepface';
                        req.session.faceAuthIP = req.ip || req.connection.remoteAddress;
                        
                        // Also set the standard session authentication flags
                        req.session.isAuthenticated = true;
                        req.session.user_id = user.user_id;
                        
                        console.log('Face auth session data set:', {
                            faceAuthenticated: req.session.faceAuthenticated,
                            faceAuthTime: req.session.faceAuthTime,
                            faceAuthMethod: req.session.faceAuthMethod,
                            faceAuthIP: req.session.faceAuthIP,
                            isAuthenticated: req.session.isAuthenticated,
                            user_id: req.session.user_id
                        });
                        
                        // Save session to ensure authentication persists
                        req.session.save((saveErr) => {
                            if (saveErr) {
                                console.error('Error saving session:', saveErr);
                                return res.json({
                                    success: false,
                                    message: 'Failed to save session'
                                });
                            }
                            
                            console.log('Session saved successfully with face auth data');
                            
                            // Return success response with redirect info
                            return res.json({
                                success: true,
                                message: 'Face authentication successful',
                                user: {
                                    user_id: user.user_id,
                                    username: user.username,
                                    email: user.email,
                                    account_number: user.account_number
                                },
                                redirect: '/'
                            });
                        });
                    });
                } catch (dbError) {
                    client.release();
                    throw dbError;
                }
            } catch (error) {
                console.error('Error authenticating user:', error);
                return res.json({
                    success: false,
                    message: 'Failed to authenticate user'
                });
            }
        } else {
            // Return the verification result if not successful
            return res.json(result);
        }
    } catch (error) {
        console.error('Error verifying face login:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Failed to verify face login' 
        });
    }
};

export const handleFaceLoginSuccess = async (req, res) => {
    try {
        const { user_id } = req.query;
        console.log('Face login success - User ID:', user_id);
        
        if (!user_id) {
            return res.status(400).json({ success: false, message: 'User ID is required' });
        }

        // Get user data from database
        const client = await pool.connect();
        try {
            console.log('Querying database for user:', user_id);
            const result = await client.query(
                'SELECT user_id, username, email, account_number FROM luno_users WHERE user_id = $1',
                [user_id]
            );

            console.log('Database query result:', result.rows);

            if (result.rows.length === 0) {
                console.log('User not found in database');
                return res.status(404).json({ success: false, message: 'User not found' });
            }

            const user = result.rows[0];
            console.log('Found user:', user);

            // Use Passport.js to authenticate the user
            req.login(user, (err) => {
                if (err) {
                    console.error('Error logging in user:', err);
                    return res.status(500).json({ 
                        success: false, 
                        message: 'Failed to authenticate user' 
                    });
                }
                
                console.log('User authenticated with Passport.js');
                console.log('User after login:', req.user);
                console.log('Is authenticated:', req.isAuthenticated());
                
                // Redirect to dashboard
                res.redirect('/');
            });
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Error handling face login success:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to complete face login' 
        });
    }
};

export const getFaceAuthStatus = async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    try {
        const result = await deepFaceAuthController.getFaceAuthStatus(req.user.user_id);
        return res.json(result);
    } catch (error) {
        console.error('Error getting face auth status:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Failed to get face auth status' 
        });
    }
};

export const getUserFaces = async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    try {
        const result = await deepFaceAuthController.getUserFaces(req.user.user_id);
        return res.json(result);
    } catch (error) {
        console.error('Error getting user faces:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Failed to get user faces' 
        });
    }
};

export const deleteUserFaces = async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    try {
        const result = await deepFaceAuthController.deleteUserFaces(req.user.user_id);
        return res.json(result);
    } catch (error) {
        console.error('Error deleting user faces:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Failed to delete user faces' 
        });
    }
};

export const deleteSpecificFace = async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    try {
        const { faceIndex } = req.params;
        const result = await deepFaceAuthController.deleteSpecificFace(req.user.user_id, faceIndex);
        return res.json(result);
    } catch (error) {
        console.error('Error deleting specific face:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Failed to delete specific face' 
        });
    }
};

export const setPrimaryFace = async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    try {
        const { faceIndex } = req.params;
        const result = await deepFaceAuthController.setPrimaryFace(req.user.user_id, faceIndex);
        return res.json(result);
    } catch (error) {
        console.error('Error setting primary face:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Failed to set primary face' 
        });
    }
};

export const startDeepFaceAPI = async (req, res) => {
    try {
        const started = await deepFaceAuthController.startDeepFaceAPI();
        return res.json({ 
            success: started, 
            message: started ? 'DeepFace API started' : 'Failed to start DeepFace API' 
        });
    } catch (error) {
        console.error('Error starting DeepFace API:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Failed to start DeepFace API' 
        });
    }
};

export const stopDeepFaceAPI = async (req, res) => {
    try {
        deepFaceAuthController.stopDeepFaceAPI();
        return res.json({ 
            success: true, 
            message: 'DeepFace API stopped' 
        });
    } catch (error) {
        console.error('Error stopping DeepFace API:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Failed to stop DeepFace API' 
        });
    }
};

export const checkAPIHealth = async (req, res) => {
    try {
        const isHealthy = await deepFaceAuthController.checkAPIHealth();
        return res.json({ 
            success: isHealthy, 
            message: isHealthy ? 'API is healthy' : 'API is not responding' 
        });
    } catch (error) {
        console.error('Error checking API health:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Failed to check API health' 
        });
    }
};

// Graceful shutdown
process.on('SIGINT', () => {
    deepFaceAuthController.stopDeepFaceAPI();
    process.exit(0);
});

process.on('SIGTERM', () => {
    deepFaceAuthController.stopDeepFaceAPI();
    process.exit(0);
});
