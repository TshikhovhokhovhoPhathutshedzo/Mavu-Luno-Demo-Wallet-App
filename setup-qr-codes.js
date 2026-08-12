import pool from './auth/db.js';

async function setupQRCodes() {
    const client = await pool.connect();
    
    try {
        console.log('🔗 Setting up QR codes system...');
        
        // Create user_qr_codes table
        const createTableQuery = `
            CREATE TABLE IF NOT EXISTS user_qr_codes (
                qr_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID NOT NULL REFERENCES luno_users(user_id) ON DELETE CASCADE,
                qr_identifier VARCHAR(255) NOT NULL,
                encrypted_data TEXT NOT NULL,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(user_id)
            );
        `;
        
        await client.query(createTableQuery);
        console.log('✅ Created user_qr_codes table');
        
        // Create indexes for better performance
        const createIndexesQuery = `
            CREATE INDEX IF NOT EXISTS idx_user_qr_codes_user_id ON user_qr_codes(user_id);
            CREATE INDEX IF NOT EXISTS idx_user_qr_codes_active ON user_qr_codes(is_active);
            CREATE INDEX IF NOT EXISTS idx_user_qr_codes_identifier ON user_qr_codes(qr_identifier);
        `;
        
        await client.query(createIndexesQuery);
        console.log('✅ Created QR codes indexes');
        
        // Create function to update updated_at timestamp
        const createUpdateFunctionQuery = `
            CREATE OR REPLACE FUNCTION update_qr_codes_updated_at()
            RETURNS TRIGGER AS $$
            BEGIN
                NEW.updated_at = NOW();
                RETURN NEW;
            END;
            $$ language 'plpgsql';
        `;
        
        await client.query(createUpdateFunctionQuery);
        console.log('✅ Created update_qr_codes_updated_at function');
        
        // Create trigger for updated_at
        const createTriggerQuery = `
            DROP TRIGGER IF EXISTS qr_codes_updated_at ON user_qr_codes;
            CREATE TRIGGER qr_codes_updated_at
                BEFORE UPDATE ON user_qr_codes
                FOR EACH ROW
                EXECUTE FUNCTION update_qr_codes_updated_at();
        `;
        
        await client.query(createTriggerQuery);
        console.log('✅ Created qr_codes_updated_at trigger');
        
        // Add QR_SECRET_KEY to environment if not present
        if (!process.env.QR_SECRET_KEY) {
            console.log('⚠️  QR_SECRET_KEY not found in environment variables');
            console.log('   Please add QR_SECRET_KEY to your .env file for QR code encryption');
            console.log('   Example: QR_SECRET_KEY=your-secret-key-here-32-chars');
        }
        
        console.log('🎉 QR codes system setup completed successfully!');
        
    } catch (error) {
        console.error('❌ Error setting up QR codes system:', error);
        throw error;
    } finally {
        client.release();
    }
}

// Run setup if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    setupQRCodes()
        .then(() => {
            console.log('✅ QR codes setup completed');
            process.exit(0);
        })
        .catch((error) => {
            console.error('❌ QR codes setup failed:', error);
            process.exit(1);
        });
}

export default setupQRCodes;
