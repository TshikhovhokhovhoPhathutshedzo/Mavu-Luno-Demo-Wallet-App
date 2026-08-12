import pool from './auth/db.js';
import fs from 'fs';
import path from 'path';

async function setupBudgetTables() {
    const client = await pool.connect();
    
    try {
        console.log('🚀 Setting up budget tables...');
        
        // Read the SQL file
        const sqlFile = path.join(process.cwd(), 'queries', 'budget-tables.sql');
        const sqlContent = fs.readFileSync(sqlFile, 'utf8');
        
        // Execute the entire SQL file as one transaction
        try {
            await client.query(sqlContent);
            console.log('✅ Budget tables created successfully');
        } catch (error) {
            // Some statements might fail if tables already exist, that's okay
            if (error.code === '42P07') { // Table already exists
                console.log('⚠️  Some tables already exist, continuing...');
            } else {
                console.error('❌ Error creating budget tables:', error.message);
                throw error;
            }
        }
        
        console.log('✅ Budget tables setup completed successfully!');
        
        // Test the setup by querying budget categories
        const categoriesResult = await client.query('SELECT COUNT(*) as count FROM budget_categories');
        console.log(`📊 Created ${categoriesResult.rows[0].count} budget categories`);
        
    } catch (error) {
        console.error('❌ Error setting up budget tables:', error);
        throw error;
    } finally {
        client.release();
    }
}

// Run the setup
setupBudgetTables()
    .then(() => {
        console.log('🎉 Budget setup completed!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('💥 Budget setup failed:', error);
        process.exit(1);
    });
