import axios from 'axios';

class GPSService {
    constructor() {
        this.geolocationAPI = 'https://ipapi.co'; // Free IP geolocation service
        this.googleMapsAPI = 'https://maps.googleapis.com/maps/api/geocode/json';
        this.timeout = 5000; // 5 second timeout
    }

    // Get location from IP address
    async getLocationFromIP(ipAddress) {
        try {
            // Skip localhost and private IPs
            if (this.isPrivateIP(ipAddress)) {
                return this.getDefaultLocation(ipAddress);
            }

            const response = await axios.get(`${this.geolocationAPI}/${ipAddress}/json/`, {
                timeout: this.timeout
            });
            
            if (response.data && response.data.latitude && response.data.longitude) {
                return {
                    latitude: parseFloat(response.data.latitude),
                    longitude: parseFloat(response.data.longitude),
                    city: response.data.city || 'Unknown',
                    country: response.data.country_name || 'Unknown',
                    country_code: response.data.country_code || 'Unknown',
                    region: response.data.region || 'Unknown',
                    timezone: response.data.timezone || 'UTC',
                    ip_address: ipAddress,
                    timestamp: new Date().toISOString()
                };
            }
            
            throw new Error('Invalid location data received');
        } catch (error) {
            console.error('Error getting location from IP:', error.message);
            return this.getDefaultLocation(ipAddress);
        }
    }

    // Check if IP is private/localhost
    isPrivateIP(ip) {
        if (!ip || ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') {
            return true;
        }
        
        // Check for private IP ranges
        const privateRanges = [
            /^10\./,
            /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
            /^192\.168\./
        ];
        
        return privateRanges.some(range => range.test(ip));
    }

    // Get default location (Johannesburg, South Africa)
    getDefaultLocation(ipAddress) {
        return {
            latitude: -26.2041,
            longitude: 28.0473,
            city: 'Johannesburg',
            country: 'South Africa',
            country_code: 'ZA',
            region: 'Gauteng',
            timezone: 'Africa/Johannesburg',
            ip_address: ipAddress,
            timestamp: new Date().toISOString(),
            is_default: true
        };
    }

    // Get location from browser GPS (for mobile devices)
    async getLocationFromGPS() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error('Geolocation is not supported by this browser'));
                return;
            }

            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const location = {
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                        accuracy: position.coords.accuracy,
                        timestamp: new Date().toISOString(),
                        source: 'gps'
                    };

                    // Get address from coordinates using reverse geocoding
                    this.getAddressFromCoordinates(location.latitude, location.longitude)
                        .then(address => {
                            resolve({
                                ...location,
                                ...address
                            });
                        })
                        .catch(() => {
                            // If reverse geocoding fails, return just coordinates
                            resolve(location);
                        });
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

    // Get address from coordinates using reverse geocoding
    async getAddressFromCoordinates(latitude, longitude) {
        try {
            // Using a free reverse geocoding service
            const response = await axios.get(
                `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=10`,
                { timeout: this.timeout }
            );

            if (response.data && response.data.address) {
                const address = response.data.address;
                return {
                    city: address.city || address.town || address.village || 'Unknown',
                    country: address.country || 'Unknown',
                    country_code: address.country_code || 'Unknown',
                    region: address.state || address.province || 'Unknown',
                    street: address.road || 'Unknown',
                    postal_code: address.postcode || 'Unknown'
                };
            }

            return {
                city: 'Unknown',
                country: 'Unknown',
                country_code: 'Unknown',
                region: 'Unknown'
            };
        } catch (error) {
            console.error('Error getting address from coordinates:', error.message);
            return {
                city: 'Unknown',
                country: 'Unknown',
                country_code: 'Unknown',
                region: 'Unknown'
            };
        }
    }

    // Get client IP address from request
    getClientIP(req) {
        // Ensure headers exist
        if (!req.headers) {
            return req.ip || '127.0.0.1';
        }

        // Check for forwarded headers first (for proxy/load balancer setups)
        const forwarded = req.headers['x-forwarded-for'];
        if (forwarded) {
            const ips = forwarded.split(',').map(ip => ip.trim());
            return ips[0]; // Return the first IP in the chain
        }

        // Check for real IP header
        const realIP = req.headers['x-real-ip'];
        if (realIP) {
            return realIP;
        }

        // Fallback to connection info
        return req.ip || 
               req.connection?.remoteAddress || 
               req.socket?.remoteAddress || 
               req.connection?.socket?.remoteAddress ||
               '127.0.0.1';
    }

    // Calculate distance between two points using Haversine formula
    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Earth's radius in kilometers
        const dLat = this.deg2rad(lat2 - lat1);
        const dLon = this.deg2rad(lon2 - lon1);
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }

    deg2rad(deg) {
        return deg * (Math.PI/180);
    }

    // Format location for display
    formatLocation(location) {
        if (!location) return 'Unknown Location';
        
        const parts = [];
        if (location.city && location.city !== 'Unknown') parts.push(location.city);
        if (location.region && location.region !== 'Unknown') parts.push(location.region);
        if (location.country && location.country !== 'Unknown') parts.push(location.country);
        
        return parts.length > 0 ? parts.join(', ') : 'Unknown Location';
    }

    // Check if location is suspicious (distance-based)
    isSuspiciousLocation(currentLocation, previousLocation, threshold = 100) {
        if (!previousLocation || !currentLocation) return false;
        
        const distance = this.calculateDistance(
            previousLocation.latitude,
            previousLocation.longitude,
            currentLocation.latitude,
            currentLocation.longitude
        );
        
        return distance > threshold; // Suspicious if more than 100km
    }

    // Validate coordinates
    isValidCoordinates(latitude, longitude) {
        return (
            typeof latitude === 'number' && 
            typeof longitude === 'number' &&
            latitude >= -90 && latitude <= 90 &&
            longitude >= -180 && longitude <= 180
        );
    }
}

export default new GPSService(); 