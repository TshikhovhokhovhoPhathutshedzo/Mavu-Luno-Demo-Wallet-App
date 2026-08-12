// GPS Location Service for Frontend
class FrontendGPSService {
    constructor() {
        this.isSupported = 'geolocation' in navigator;
    }

    // Get current GPS location
    async getCurrentLocation() {
        if (!this.isSupported) {
            throw new Error('Geolocation is not supported by this browser');
        }

        return new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const location = {
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                        accuracy: position.coords.accuracy,
                        timestamp: new Date().toISOString(),
                        source: 'gps'
                    };
                    resolve(location);
                },
                (error) => {
                    console.error('GPS Error:', error.message);
                    reject(error);
                },
                {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 300000 // 5 minutes
                }
            );
        });
    }

    // Request location permission and get coordinates
    async requestLocationPermission() {
        try {
            const location = await this.getCurrentLocation();
            
            // Send location to server for transaction
            const response = await fetch('/api/update-location', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(location)
            });

            const data = await response.json();
            
            if (data.success) {
                console.log('Location updated successfully');
                return location;
            } else {
                throw new Error(data.message || 'Failed to update location');
            }
        } catch (error) {
            console.error('Location permission error:', error);
            throw error;
        }
    }

    // Show location permission dialog
    showLocationPermissionDialog() {
        const dialog = document.createElement('div');
        dialog.className = 'location-permission-dialog';
        dialog.innerHTML = `
            <div class="location-dialog-content">
                <h3>📍 Location Access</h3>
                <p>To enhance your security and provide better transaction tracking, we need access to your location.</p>
                <div class="location-buttons">
                    <button class="btn-allow-location" onclick="allowLocation()">Allow Location</button>
                    <button class="btn-skip-location" onclick="skipLocation()">Skip</button>
                </div>
            </div>
        `;

        // Add styles
        const style = document.createElement('style');
        style.textContent = `
            .location-permission-dialog {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.5);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 10000;
            }
            .location-dialog-content {
                background: white;
                padding: 2rem;
                border-radius: 12px;
                max-width: 400px;
                text-align: center;
                box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
            }
            .location-dialog-content h3 {
                color: #2563eb;
                margin-bottom: 1rem;
            }
            .location-dialog-content p {
                color: #666;
                margin-bottom: 1.5rem;
                line-height: 1.5;
            }
            .location-buttons {
                display: flex;
                gap: 1rem;
                justify-content: center;
            }
            .btn-allow-location, .btn-skip-location {
                padding: 0.75rem 1.5rem;
                border: none;
                border-radius: 6px;
                font-weight: 600;
                cursor: pointer;
                transition: background-color 0.3s;
            }
            .btn-allow-location {
                background: #2563eb;
                color: white;
            }
            .btn-allow-location:hover {
                background: #1d4ed8;
            }
            .btn-skip-location {
                background: #f3f4f6;
                color: #374151;
            }
            .btn-skip-location:hover {
                background: #e5e7eb;
            }
        `;

        document.head.appendChild(style);
        document.body.appendChild(dialog);

        // Add global functions
        window.allowLocation = async () => {
            try {
                await this.requestLocationPermission();
                document.body.removeChild(dialog);
                showSuccessMessage('Location access granted!');
            } catch (error) {
                showErrorMessage('Failed to get location: ' + error.message);
            }
        };

        window.skipLocation = () => {
            document.body.removeChild(dialog);
            showInfoMessage('Location access skipped. You can enable it later in settings.');
        };
    }

    // Check if location permission is granted
    async checkLocationPermission() {
        if (!this.isSupported) return false;

        try {
            const permission = await navigator.permissions.query({ name: 'geolocation' });
            return permission.state === 'granted';
        } catch (error) {
            console.error('Permission check error:', error);
            return false;
        }
    }

    // Get location for transaction (with fallback to IP)
    async getTransactionLocation() {
        try {
            // Try GPS first
            const gpsLocation = await this.getCurrentLocation();
            return {
                ...gpsLocation,
                method: 'gps'
            };
        } catch (error) {
            console.log('GPS not available, using IP-based location');
            // Fallback to IP-based location (handled by server)
            return {
                method: 'ip',
                timestamp: new Date().toISOString()
            };
        }
    }
}

// Initialize GPS service
const gpsService = new FrontendGPSService();

// Show location permission dialog on page load (optional)
document.addEventListener('DOMContentLoaded', async () => {
    // Check if user has already granted permission
    const hasPermission = await gpsService.checkLocationPermission();
    
    // Only show dialog if permission not granted and on transaction pages
    if (!hasPermission && (window.location.pathname.includes('transaction') || window.location.pathname === '/')) {
        // Show dialog after a short delay
        setTimeout(() => {
            gpsService.showLocationPermissionDialog();
        }, 2000);
    }
});

// Utility functions for messages
function showSuccessMessage(message) {
    // Implementation depends on your existing message system
    console.log('Success:', message);
}

function showErrorMessage(message) {
    // Implementation depends on your existing message system
    console.error('Error:', message);
}

function showInfoMessage(message) {
    // Implementation depends on your existing message system
    console.log('Info:', message);
}

export default gpsService; 