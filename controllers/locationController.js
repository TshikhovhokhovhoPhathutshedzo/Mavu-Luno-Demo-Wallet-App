import pool from "../auth/db.js";
import gpsService from "../services/gpsService.js";

export const updateUserLocation = async (req, res) => {
    const client = await pool.connect();
    const user_id = req.user.user_id;
    const { latitude, longitude, accuracy, source, timestamp } = req.body;

    try {
        // Validate location data
        if (!latitude || !longitude) {
            return res.status(400).json({
                success: false,
                message: 'Invalid location data'
            });
        }

        // Get address from coordinates
        const address = await gpsService.getAddressFromCoordinates(latitude, longitude);

        // Create location object
        const locationData = {
            latitude: parseFloat(latitude),
            longitude: parseFloat(longitude),
            accuracy: accuracy || null,
            source: source || 'gps',
            timestamp: timestamp || new Date().toISOString(),
            ...address
        };

        // Store in user_locations table
        await client.query(`
            INSERT INTO user_locations 
            (user_id, latitude, longitude, country, city, timezone, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
            user_id,
            locationData.latitude,
            locationData.longitude,
            locationData.country,
            locationData.city,
            locationData.timezone || 'UTC',
            new Date()
        ]);

        res.json({
            success: true,
            message: 'Location updated successfully',
            location: locationData
        });

    } catch (error) {
        console.error('Location update error:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating location'
        });
    } finally {
        client.release();
    }
}; 