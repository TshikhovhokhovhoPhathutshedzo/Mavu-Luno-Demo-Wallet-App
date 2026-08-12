import pool from './auth/db.js';
import fs from 'fs';
import path from 'path';

async function setupPasswordResetTables() {
    const client = await pool.connect();
    
    try {
        console.log('🔧 Setting up password reset tables...');
        
        // Read and execute the SQL file
        const sqlPath = path.join(process.cwd(), 'queries', 'password-reset-tables.sql');
        const sqlContent = fs.readFileSync(sqlPath, 'utf8');
        
        // Split by semicolon and execute each statement
        const statements = sqlContent.split(';').filter(stmt => stmt.trim());
        
        for (const statement of statements) {
            if (statement.trim()) {
                await client.query(statement);
                console.log('✅ Executed SQL statement');
            }
        }
        
        console.log('✅ Password reset tables setup completed successfully!');
        
        // Verify tables exist
        const tables = [
            'password_reset_codes',
            'password_reset_tokens',
            'face_login_audit'
        ];
        
        for (const table of tables) {
            const result = await client.query(`
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = $1
                );
            `, [table]);
            
            if (result.rows[0].exists) {
                console.log(`✅ Table '${table}' exists`);
            } else {
                console.log(`❌ Table '${table}' does not exist`);
            }
        }
        
    } catch (error) {
        console.error('❌ Error setting up password reset tables:', error);
        throw error;
    } finally {
        client.release();
    }
}

// Run the setup
setupPasswordResetTables()
    .then(() => {
        console.log('🎉 Password reset tables setup completed!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('💥 Setup failed:', error);
        process.exit(1);
    });
