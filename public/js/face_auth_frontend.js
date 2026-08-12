/**
 * Face Authentication Frontend Integration for LunoWallet
 * Provides camera capture and face login functionality
 */

class FaceAuthManager {
    constructor(apiBaseUrl = 'http://localhost:5001') {
        this.apiBaseUrl = apiBaseUrl;
        this.video = null;
        this.canvas = null;
        this.stream = null;
        this.isCapturing = false;
    }

    /**
     * Initialize camera for face capture
     */
    async initCamera(videoElementId, canvasElementId) {
        try {
            this.video = document.getElementById(videoElementId);
            this.canvas = document.getElementById(canvasElementId);
            
            if (!this.video || !this.canvas) {
                throw new Error('Video or canvas element not found');
            }

            // Request camera access
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                    facingMode: 'user' // Front camera
                }
            });

            this.video.srcObject = this.stream;
            this.video.play();

            return true;
        } catch (error) {
            console.error('Error initializing camera:', error);
            throw new Error('Camera access denied or not available');
        }
    }

    /**
     * Stop camera stream
     */
    stopCamera() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        if (this.video) {
            this.video.srcObject = null;
        }
    }

    /**
     * Capture image from video stream
     */
    captureImage() {
        if (!this.video || !this.canvas) {
            throw new Error('Camera not initialized');
        }

        const context = this.canvas.getContext('2d');
        this.canvas.width = this.video.videoWidth;
        this.canvas.height = this.video.videoHeight;
        
        // Draw current video frame to canvas
        context.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
        
        // Convert canvas to blob
        return new Promise((resolve) => {
            this.canvas.toBlob(resolve, 'image/jpeg', 0.8);
        });
    }

    /**
     * Register a face for a user
     */
    async registerFace(userId, username, email = null, isPrimary = false) {
        try {
            const imageBlob = await this.captureImage();
            
            const formData = new FormData();
            formData.append('face_image', imageBlob, 'face.jpg');
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

            const result = await response.json();
            return result;
        } catch (error) {
            console.error('Error registering face:', error);
            return {
                success: false,
                message: 'Error registering face: ' + error.message
            };
        }
    }

    /**
     * Login using face recognition
     */
    async faceLogin(userId) {
        try {
            const imageBlob = await this.captureImage();
            
            const formData = new FormData();
            formData.append('face_image', imageBlob, 'login_face.jpg');
            formData.append('data', JSON.stringify({
                user_id: userId
            }));

            const response = await fetch(`${this.apiBaseUrl}/face-auth/login`, {
                method: 'POST',
                body: formData
            });

            const result = await response.json();
            return result;
        } catch (error) {
            console.error('Error during face login:', error);
            return {
                success: false,
                message: 'Error during face login: ' + error.message
            };
        }
    }

    /**
     * Get face authentication status for a user
     */
    async getFaceAuthStatus(userId) {
        try {
            const response = await fetch(`${this.apiBaseUrl}/face-auth/status/${userId}`);
            const result = await response.json();
            return result;
        } catch (error) {
            console.error('Error getting face auth status:', error);
            return {
                success: false,
                message: 'Error getting face auth status: ' + error.message
            };
        }
    }

    /**
     * Get list of registered faces for a user
     */
    async getUserFaces(userId) {
        try {
            const response = await fetch(`${this.apiBaseUrl}/face-auth/faces/${userId}`);
            const result = await response.json();
            return result;
        } catch (error) {
            console.error('Error getting user faces:', error);
            return {
                success: false,
                message: 'Error getting user faces: ' + error.message
            };
        }
    }

    /**
     * Delete all face data for a user
     */
    async deleteUserFaces(userId) {
        try {
            const response = await fetch(`${this.apiBaseUrl}/face-auth/faces/${userId}`, {
                method: 'DELETE'
            });
            const result = await response.json();
            return result;
        } catch (error) {
            console.error('Error deleting user faces:', error);
            return {
                success: false,
                message: 'Error deleting user faces: ' + error.message
            };
        }
    }

    /**
     * Delete a specific face for a user
     */
    async deleteSpecificFace(userId, faceIndex) {
        try {
            const response = await fetch(`${this.apiBaseUrl}/face-auth/faces/${userId}/${faceIndex}`, {
                method: 'DELETE'
            });
            const result = await response.json();
            return result;
        } catch (error) {
            console.error('Error deleting specific face:', error);
            return {
                success: false,
                message: 'Error deleting specific face: ' + error.message
            };
        }
    }

    /**
     * Set a face as primary for a user
     */
    async setPrimaryFace(userId, faceIndex) {
        try {
            const response = await fetch(`${this.apiBaseUrl}/face-auth/faces/${userId}/${faceIndex}/primary`, {
                method: 'POST'
            });
            const result = await response.json();
            return result;
        } catch (error) {
            console.error('Error setting primary face:', error);
            return {
                success: false,
                message: 'Error setting primary face: ' + error.message
            };
        }
    }
}

/**
 * Face Registration Component for Settings
 */
class FaceRegistrationComponent {
    constructor(containerId, faceAuthManager) {
        this.container = document.getElementById(containerId);
        this.faceAuth = faceAuthManager;
        this.isInitialized = false;
    }

    async init() {
        if (this.isInitialized) return;

        this.container.innerHTML = `
            <div class="face-registration-container">
                <h3>Face Authentication Setup</h3>
                <div class="camera-container">
                    <video id="face-capture-video" autoplay muted playsinline style="width: 100%; max-width: 400px; border-radius: 8px;"></video>
                    <canvas id="face-capture-canvas" style="display: none;"></canvas>
                </div>
                <div class="capture-controls">
                    <button id="start-camera-btn" class="btn btn-primary">Start Camera</button>
                    <button id="capture-face-btn" class="btn btn-success" disabled>Capture Face</button>
                    <button id="stop-camera-btn" class="btn btn-secondary" disabled>Stop Camera</button>
                </div>
                <div class="face-status" id="face-status">
                    <p>Camera not started</p>
                </div>
                <div class="registered-faces" id="registered-faces">
                    <!-- Registered faces will be displayed here -->
                </div>
            </div>
        `;

        this.setupEventListeners();
        this.isInitialized = true;
    }

    setupEventListeners() {
        const startBtn = document.getElementById('start-camera-btn');
        const captureBtn = document.getElementById('capture-face-btn');
        const stopBtn = document.getElementById('stop-camera-btn');

        startBtn.addEventListener('click', () => this.startCamera());
        captureBtn.addEventListener('click', () => this.captureFace());
        stopBtn.addEventListener('click', () => this.stopCamera());
    }

    async startCamera() {
        try {
            await this.faceAuth.initCamera('face-capture-video', 'face-capture-canvas');
            
            document.getElementById('start-camera-btn').disabled = true;
            document.getElementById('capture-face-btn').disabled = false;
            document.getElementById('stop-camera-btn').disabled = false;
            
            this.updateStatus('Camera started. Position your face in the frame and click "Capture Face"', 'success');
        } catch (error) {
            this.updateStatus('Error starting camera: ' + error.message, 'error');
        }
    }

    async captureFace() {
        try {
            const userId = this.getCurrentUserId(); // Implement this method based on your app
            const username = this.getCurrentUsername(); // Implement this method based on your app
            
            if (!userId || !username) {
                this.updateStatus('User information not available', 'error');
                return;
            }

            this.updateStatus('Capturing face...', 'info');
            
            const result = await this.faceAuth.registerFace(userId, username, null, false);
            
            if (result.success) {
                this.updateStatus(`Face registered successfully! Total faces: ${result.face_count}`, 'success');
                this.loadRegisteredFaces();
            } else {
                this.updateStatus('Error: ' + result.message, 'error');
            }
        } catch (error) {
            this.updateStatus('Error capturing face: ' + error.message, 'error');
        }
    }

    stopCamera() {
        this.faceAuth.stopCamera();
        
        document.getElementById('start-camera-btn').disabled = false;
        document.getElementById('capture-face-btn').disabled = true;
        document.getElementById('stop-camera-btn').disabled = true;
        
        this.updateStatus('Camera stopped', 'info');
    }

    updateStatus(message, type = 'info') {
        const statusDiv = document.getElementById('face-status');
        statusDiv.innerHTML = `<p class="status-${type}">${message}</p>`;
    }

    async loadRegisteredFaces() {
        const userId = this.getCurrentUserId();
        if (!userId) return;

        const result = await this.faceAuth.getUserFaces(userId);
        const facesContainer = document.getElementById('registered-faces');
        
        if (result.success && result.faces.length > 0) {
            facesContainer.innerHTML = `
                <h4>Registered Faces (${result.faces.length})</h4>
                <div class="faces-grid">
                    ${result.faces.map((face, index) => `
                        <div class="face-item">
                            <img src="${this.faceAuth.apiBaseUrl}/face-auth/faces/${userId}/${face.filename}" 
                                 alt="Face ${index + 1}" class="face-thumbnail">
                            <div class="face-actions">
                                <button onclick="faceRegistrationComponent.setPrimaryFace(${index})" 
                                        class="btn btn-sm ${face.is_primary ? 'btn-warning' : 'btn-outline'}">
                                    ${face.is_primary ? 'Primary' : 'Set Primary'}
                                </button>
                                <button onclick="faceRegistrationComponent.deleteFace(${index})" 
                                        class="btn btn-sm btn-danger">Delete</button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        } else {
            facesContainer.innerHTML = '<p>No faces registered yet</p>';
        }
    }

    async setPrimaryFace(faceIndex) {
        const userId = this.getCurrentUserId();
        const result = await this.faceAuth.setPrimaryFace(userId, faceIndex);
        
        if (result.success) {
            this.updateStatus('Primary face updated', 'success');
            this.loadRegisteredFaces();
        } else {
            this.updateStatus('Error: ' + result.message, 'error');
        }
    }

    async deleteFace(faceIndex) {
        if (!confirm('Are you sure you want to delete this face?')) return;
        
        const userId = this.getCurrentUserId();
        const result = await this.faceAuth.deleteSpecificFace(userId, faceIndex);
        
        if (result.success) {
            this.updateStatus('Face deleted', 'success');
            this.loadRegisteredFaces();
        } else {
            this.updateStatus('Error: ' + result.message, 'error');
        }
    }

    getCurrentUserId() {
        // Implement this method to get current user ID from your app
        // This is a placeholder - replace with your actual user management
        return localStorage.getItem('current_user_id') || 'demo_user';
    }

    getCurrentUsername() {
        // Implement this method to get current username from your app
        // This is a placeholder - replace with your actual user management
        return localStorage.getItem('current_username') || 'Demo User';
    }
}

/**
 * Face Login Component for Login Page
 */
class FaceLoginComponent {
    constructor(containerId, faceAuthManager) {
        this.container = document.getElementById(containerId);
        this.faceAuth = faceAuthManager;
        this.isInitialized = false;
    }

    async init() {
        if (this.isInitialized) return;

        this.container.innerHTML = `
            <div class="face-login-container">
                <h3>Face Login</h3>
                <div class="camera-container">
                    <video id="face-login-video" autoplay muted playsinline style="width: 100%; max-width: 400px; border-radius: 8px;"></video>
                    <canvas id="face-login-canvas" style="display: none;"></canvas>
                </div>
                <div class="login-controls">
                    <button id="start-login-camera-btn" class="btn btn-primary">Start Camera</button>
                    <button id="face-login-btn" class="btn btn-success" disabled>Login with Face</button>
                    <button id="stop-login-camera-btn" class="btn btn-secondary" disabled>Stop Camera</button>
                </div>
                <div class="login-status" id="login-status">
                    <p>Camera not started</p>
                </div>
            </div>
        `;

        this.setupEventListeners();
        this.isInitialized = true;
    }

    setupEventListeners() {
        const startBtn = document.getElementById('start-login-camera-btn');
        const loginBtn = document.getElementById('face-login-btn');
        const stopBtn = document.getElementById('stop-login-camera-btn');

        startBtn.addEventListener('click', () => this.startCamera());
        loginBtn.addEventListener('click', () => this.attemptFaceLogin());
        stopBtn.addEventListener('click', () => this.stopCamera());
    }

    async startCamera() {
        try {
            await this.faceAuth.initCamera('face-login-video', 'face-login-canvas');
            
            document.getElementById('start-login-camera-btn').disabled = true;
            document.getElementById('face-login-btn').disabled = false;
            document.getElementById('stop-login-camera-btn').disabled = false;
            
            this.updateStatus('Camera started. Position your face in the frame and click "Login with Face"', 'success');
        } catch (error) {
            this.updateStatus('Error starting camera: ' + error.message, 'error');
        }
    }

    async attemptFaceLogin() {
        try {
            const userId = this.getUserIdFromInput(); // Get from login form
            
            if (!userId) {
                this.updateStatus('Please enter your user ID first', 'error');
                return;
            }

            this.updateStatus('Verifying face...', 'info');
            
            const result = await this.faceAuth.faceLogin(userId);
            
            if (result.success) {
                this.updateStatus(`Login successful! Similarity: ${result.similarity}`, 'success');
                // Redirect to main app or trigger login success
                this.onLoginSuccess(userId);
            } else {
                this.updateStatus('Login failed: ' + result.message, 'error');
            }
        } catch (error) {
            this.updateStatus('Error during login: ' + error.message, 'error');
        }
    }

    stopCamera() {
        this.faceAuth.stopCamera();
        
        document.getElementById('start-login-camera-btn').disabled = false;
        document.getElementById('face-login-btn').disabled = true;
        document.getElementById('stop-login-camera-btn').disabled = true;
        
        this.updateStatus('Camera stopped', 'info');
    }

    updateStatus(message, type = 'info') {
        const statusDiv = document.getElementById('login-status');
        statusDiv.innerHTML = `<p class="status-${type}">${message}</p>`;
    }

    getUserIdFromInput() {
        // Get user ID from login form input
        const userIdInput = document.getElementById('user-id-input');
        return userIdInput ? userIdInput.value.trim() : null;
    }

    onLoginSuccess(userId) {
        // Implement login success logic
        // This is a placeholder - replace with your actual login handling
        console.log('Face login successful for user:', userId);
        // Example: redirect to dashboard
        // window.location.href = '/dashboard';
    }
}

// Global instances for easy access
const faceAuthManager = new FaceAuthManager('http://localhost:5001');
let faceRegistrationComponent;
let faceLoginComponent;

// Initialize components when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Initialize face registration component for settings page
    const registrationContainer = document.getElementById('face-registration-container');
    if (registrationContainer) {
        faceRegistrationComponent = new FaceRegistrationComponent('face-registration-container', faceAuthManager);
        faceRegistrationComponent.init();
    }

    // Initialize face login component for login page
    const loginContainer = document.getElementById('face-login-container');
    if (loginContainer) {
        faceLoginComponent = new FaceLoginComponent('face-login-container', faceAuthManager);
        faceLoginComponent.init();
    }
});
