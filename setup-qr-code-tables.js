import fs from 'fs';
import path from 'path';
import pool from './auth/db.js';

async function setupQRTables() {
    const client = await pool.connect();
    
    try {
        console.log('🚀 Setting up QR code tables...');
        
        // Read the SQL file
        const sqlFilePath = path.join(process.cwd(), 'queries', 'qr-code-tables.sql');
        const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');
        
        // Execute the SQL
        await client.query(sqlContent);
        
        console.log('✅ QR code tables created successfully');
        console.log('✅ Indexes created successfully');
        console.log('✅ Functions and triggers created successfully');
        
        // Test the setup
        const statsResult = await client.query('SELECT * FROM get_qr_code_stats()');
        console.log('📊 QR Code Statistics:', statsResult.rows[0]);
        
    } catch (error) {
        console.error('❌ Error setting up QR code tables:', error);
        throw error;
    } finally {
        client.release();
    }
}

// Run the setup
setupQRTables()
    .then(() => {
        console.log('🎉 QR code setup completed successfully!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('💥 QR code setup failed:', error);
        process.exit(1);
    });
