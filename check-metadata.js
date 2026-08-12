import pool from "./auth/db.js";

async function checkMetadata() {
    console.log('🔍 Checking Transaction Metadata...\n');
    
    try {
        const client = await pool.connect();
        
        const result = await client.query(`
            SELECT 
                transaction_id,
                user_id,
                amount,
                transaction_type,
                metadata,
                created_at
            FROM transaction_history 
            WHERE transaction_type = 'internal' 
            AND metadata::text LIKE '%peer_to_peer%'
            ORDER BY created_at DESC
            LIMIT 5
        `);
        
        console.log(`Found ${result.rows.length} transactions with metadata:\n`);
        
        result.rows.forEach((row, index) => {
            console.log(`Transaction ${index + 1}:`);
            console.log(`  ID: ${row.transaction_id}`);
            console.log(`  User ID: ${row.user_id}`);
            console.log(`  Amount: ${row.amount} (R${(row.amount/100).toFixed(2)})`);
            console.log(`  Type: ${row.transaction_type}`);
            console.log(`  Created: ${row.created_at}`);
            console.log(`  Metadata: ${row.metadata}`);
            
            try {
                const parsed = JSON.parse(row.metadata);
                console.log(`  Parsed:`, parsed);
            } catch (e) {
                console.log(`  Parse Error: ${e.message}`);
            }
            console.log('');
        });
        
        client.release();
        
    } catch (error) {
        console.error('Error:', error);
    }
}

checkMetadata();

