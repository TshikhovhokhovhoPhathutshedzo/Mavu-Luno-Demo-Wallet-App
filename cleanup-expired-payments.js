import pool from "./auth/db.js";

// Clean up expired payment verifications
async function cleanupExpiredPayments() {
    console.log('🧹 Cleaning up expired payment verifications...\n');
    
    try {
        const client = await pool.connect();
        
        // Check current expired records
        const expiredCount = await client.query(`
            SELECT COUNT(*) as count 
            FROM payment_verification 
            WHERE expires_at < NOW() AND verified = FALSE
        `);
        
        console.log(`Found ${expiredCount.rows[0].count} expired verification records`);
        
        if (expiredCount.rows[0].count > 0) {
            // Delete expired records
            const result = await client.query(`
                DELETE FROM payment_verification 
                WHERE expires_at < NOW() AND verified = FALSE
            `);
            
            console.log(`✅ Cleaned up ${result.rowCount} expired verification records`);
        } else {
            console.log('✅ No expired records to clean up');
        }
        
        // Check for duplicate references
        const duplicateRefs = await client.query(`
            SELECT payment_reference, COUNT(*) as count
            FROM payment_verification
            GROUP BY payment_reference
            HAVING COUNT(*) > 1
        `);
        
        if (duplicateRefs.rows.length > 0) {
            console.log(`⚠️ Found ${duplicateRefs.rows.length} duplicate payment references:`);
            duplicateRefs.rows.forEach(row => {
                console.log(`   - ${row.payment_reference}: ${row.count} occurrences`);
            });
        } else {
            console.log('✅ No duplicate payment references found');
        }
        
        // Show current verification records
        const currentRecords = await client.query(`
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
        
        console.log(`\n📋 Current verification records (${currentRecords.rows.length}):`);
        currentRecords.rows.forEach(record => {
            const status = record.verified ? '✅ Verified' : '⏳ Pending';
            const expired = new Date(record.expires_at) < new Date() ? ' (EXPIRED)' : '';
            console.log(`   - ${record.payment_reference}: R${record.amount} ${status}${expired}`);
        });
        
        client.release();
        
    } catch (error) {
        console.error('❌ Error during cleanup:', error);
    }
}

cleanupExpiredPayments();

