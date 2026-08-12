import pool from "./auth/db.js";

const setupSettingsTables = async () => {
    const client = await pool.connect();
    
    try {
        console.log('🔧 Setting up settings-related database tables...\n');
        
        // 1. Security Questions Table
        console.log('1. Creating security_questions table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS security_questions (
                question_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                user_id UUID NOT NULL,
                question_text TEXT NOT NULL,
                answer_hash VARCHAR(255) NOT NULL,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES luno_users(user_id) ON DELETE CASCADE
            );
        `);
        console.log('✅ security_questions table created');

        // 2. Notification Settings Table
        console.log('2. Creating notification_settings table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS notification_settings (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                user_id UUID UNIQUE NOT NULL,
                push_enabled BOOLEAN DEFAULT true,
                inapp_enabled BOOLEAN DEFAULT true,
                email_enabled BOOLEAN DEFAULT true,
                sms_enabled BOOLEAN DEFAULT false,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES luno_users(user_id) ON DELETE CASCADE
            );
        `);
        console.log('✅ notification_settings table created');

        // 3. User Profiles Table
        console.log('3. Creating user_profiles table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS user_profiles (
                profile_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                user_id UUID UNIQUE NOT NULL,
                profile_picture_url TEXT,
                bio TEXT,
                preferences JSONB,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES luno_users(user_id) ON DELETE CASCADE
            );
        `);
        console.log('✅ user_profiles table created');

        // 4. Face Enrollments Table
        console.log('4. Creating face_enrollments table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS face_enrollments (
                enrollment_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                user_id UUID UNIQUE NOT NULL,
                face_data TEXT NOT NULL,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES luno_users(user_id) ON DELETE CASCADE
            );
        `);
        console.log('✅ face_enrollments table created');

        // 5. Behavioral Patterns Table
        console.log('5. Creating behavioral_patterns table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS behavioral_patterns (
                pattern_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                user_id UUID UNIQUE NOT NULL,
                pattern_type VARCHAR(50) NOT NULL,
                pattern_data JSONB NOT NULL,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES luno_users(user_id) ON DELETE CASCADE
            );
        `);
        console.log('✅ behavioral_patterns table created');

        // 6. Anomaly Verifications Table
        console.log('6. Creating anomaly_verifications table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS anomaly_verifications (
                verification_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                user_id UUID NOT NULL,
                anomaly_id VARCHAR(255) NOT NULL,
                verification_code VARCHAR(10),
                verification_method VARCHAR(50) DEFAULT 'questions',
                is_verified BOOLEAN DEFAULT false,
                verified_at TIMESTAMP WITH TIME ZONE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES luno_users(user_id) ON DELETE CASCADE
            );
        `);
        console.log('✅ anomaly_verifications table created');

        // 7. Fraud Insights Table
        console.log('7. Creating fraud_insights table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS fraud_insights (
                insight_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                user_id UUID NOT NULL,
                insight_type VARCHAR(50) NOT NULL,
                insight_data JSONB NOT NULL,
                risk_score DECIMAL(5,2) DEFAULT 0.0,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES luno_users(user_id) ON DELETE CASCADE
            );
        `);
        console.log('✅ fraud_insights table created');

        // 8. Create indexes for better performance
        console.log('8. Creating indexes...');
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_security_questions_user_id ON security_questions(user_id);
            CREATE INDEX IF NOT EXISTS idx_notification_settings_user_id ON notification_settings(user_id);
            CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON user_profiles(user_id);
            CREATE INDEX IF NOT EXISTS idx_face_enrollments_user_id ON face_enrollments(user_id);
            CREATE INDEX IF NOT EXISTS idx_behavioral_patterns_user_id ON behavioral_patterns(user_id);
            CREATE INDEX IF NOT EXISTS idx_anomaly_verifications_user_id ON anomaly_verifications(user_id);
            CREATE INDEX IF NOT EXISTS idx_fraud_insights_user_id ON fraud_insights(user_id);
        `);
        console.log('✅ Indexes created');

        console.log('\n🎉 All settings tables created successfully!');
        
    } catch (error) {
        console.error('❌ Error setting up settings tables:', error);
        throw error;
    } finally {
        client.release();
    }
};

// Run the setup
setupSettingsTables()
    .then(() => {
        console.log('✅ Database setup completed successfully!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('❌ Database setup failed:', error);
        process.exit(1);
    });
