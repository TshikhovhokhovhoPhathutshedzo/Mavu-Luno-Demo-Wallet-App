import pool from "./auth/db.js";

async function checkVerificationRecords() {
    console.log('🔍 Checking current verification records...\n');
    
    try {
        const client = await pool.connect();
        
        const result = await client.query(`
            SELECT 
                payment_reference,
                sender_id,
                receiver_account_number,
                amount,
                verified,
                expires_at,
                created_at
            FROM payment_verification
            ORDER BY created_at DESC
            LIMIT 10
        `);
        
        console.log(`Found ${result.rows.length} verification records:\n`);
        
        result.rows.forEach((record, index) => {
            const status = record.verified ? '✅ Verified' : '⏳ Pending';
            const expired = new Date(record.expires_at) < new Date() ? ' (EXPIRED)' : '';
            console.log(`${index + 1}. ${record.payment_reference}`);
            console.log(`   Amount: R${record.amount}`);
            console.log(`   Status: ${status}${expired}`);
            console.log(`   Created: ${record.created_at}`);
            console.log(`   Expires: ${record.expires_at}`);
            console.log('');
        });
        
        // Check for duplicates
        const duplicates = await client.query(`
            SELECT payment_reference, COUNT(*) as count
            FROM payment_verification
            GROUP BY payment_reference
            HAVING COUNT(*) > 1
        `);
        
        if (duplicates.rows.length > 0) {
            console.log('⚠️ Duplicate payment references found:');
            duplicates.rows.forEach(row => {
                console.log(`   - ${row.payment_reference}: ${row.count} occurrences`);
            });
        } else {
            console.log('✅ No duplicate payment references found');
        }
        
        client.release();
        
    } catch (error) {
        console.error('Error:', error);
    }
}

checkVerificationRecords();

