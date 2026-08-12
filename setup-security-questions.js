import pool from "./auth/db.js";
import bcrypt from "bcryptjs";

const setupSecurityQuestions = async () => {
    const client = await pool.connect();
    
    try {
        console.log("🔐 Setting up security questions for testing...");
        
        // Get a user to set up security questions for
        const users = await client.query("SELECT user_id, username, email FROM luno_users LIMIT 1");
        
        if (users.rows.length === 0) {
            console.log("❌ No users found in database");
            return;
        }
        
        const user = users.rows[0];
        console.log(`👤 Setting up security questions for: ${user.username} (${user.email})`);
        
        // Deactivate existing questions
        await client.query(`
            UPDATE security_questions 
            SET is_active = false 
            WHERE user_id = $1
        `, [user.user_id]);
        
        // Set up test security questions
        const questions = [
            {
                question: "What was your first pet's name?",
                answer: "Fluffy"
            },
            {
                question: "What city were you born in?",
                answer: "Johannesburg"
            },
            {
                question: "What is your mother's maiden name?",
                answer: "Smith"
            }
        ];
        
        for (const q of questions) {
            const hashedAnswer = await bcrypt.hash(q.answer.toLowerCase().trim(), 10);
            await client.query(`
                INSERT INTO security_questions (user_id, question_text, answer_hash)
                VALUES ($1, $2, $3)
            `, [user.user_id, q.question, hashedAnswer]);
        }
        
        console.log("✅ Security questions set up successfully!");
        console.log("   Questions:");
        questions.forEach((q, index) => {
            console.log(`   ${index + 1}. ${q.question} (Answer: ${q.answer})`);
        });
        
    } catch (error) {
        console.error("❌ Error setting up security questions:", error);
    } finally {
        client.release();
        process.exit(0);
    }
};

setupSecurityQuestions();
