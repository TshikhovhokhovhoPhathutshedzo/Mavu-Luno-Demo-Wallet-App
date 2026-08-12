import pool from "./auth/db.js";

const setupPasswordReset = async () => {
    const client = await pool.connect();
    
    try {
        console.log("🔐 Setting up password reset functionality...");
        
        // Create password_reset_codes table
        await client.query(`
            CREATE TABLE IF NOT EXISTS password_reset_codes (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                user_id UUID NOT NULL,
                email VARCHAR(255) NOT NULL,
                reset_code VARCHAR(6) NOT NULL,
                expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
                used BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                used_at TIMESTAMP WITH TIME ZONE,
                FOREIGN KEY (user_id) REFERENCES luno_users(user_id) ON DELETE CASCADE
            );
        `);
        console.log("✓ password_reset_codes table created");

        // Create indexes for better performance
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_password_reset_codes_email ON password_reset_codes(email);
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_password_reset_codes_user_id ON password_reset_codes(user_id);
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_password_reset_codes_expires_at ON password_reset_codes(expires_at);
        `);
        console.log("✓ Password reset indexes created");

        console.log("✅ Password reset functionality set up successfully!");
        
    } catch (error) {
        console.error("❌ Error setting up password reset:", error);
    } finally {
        client.release();
        process.exit(0);
    }
};

setupPasswordReset();
