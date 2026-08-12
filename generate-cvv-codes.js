import pool from "./auth/db.js";

const generateCVVCodes = async () => {
    const client = await pool.connect();
    
    try {
        console.log("🔐 Generating CVV codes for existing users...");
        
        // Find users without CVV codes
        const usersWithoutCVV = await client.query(`
            SELECT pc.card_id, pc.user_id, pc.card_number, pc.expiry_date
            FROM plastic_cards pc
            WHERE pc.cvv IS NULL OR pc.cvv = ''
        `);
        
        console.log(`Found ${usersWithoutCVV.rows.length} users without CVV codes`);
        
        if (usersWithoutCVV.rows.length === 0) {
            console.log("✅ All users already have CVV codes!");
            return;
        }
        
        // Generate CVV codes for each user
        for (const user of usersWithoutCVV.rows) {
            const cvv = Math.floor(100 + Math.random() * 900).toString();
            
            await client.query(
                `UPDATE plastic_cards SET cvv = $1 WHERE card_id = $2`,
                [cvv, user.card_id]
            );
            
            console.log(`✅ Generated CVV ${cvv} for user ${user.user_id}`);
        }
        
        console.log("🎉 CVV code generation completed successfully!");
        
    } catch (error) {
        console.error("❌ Error generating CVV codes:", error);
    } finally {
        client.release();
    }
};

// Run the script
generateCVVCodes().then(() => {
    console.log("✅ CVV generation script completed");
    process.exit(0);
}).catch((error) => {
    console.error("❌ Script failed:", error);
    process.exit(1);
});
