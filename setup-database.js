import pool from "./auth/db.js";

const setupDatabase = async () => {
    const client = await pool.connect();
    
    try {
        console.log("Setting up database tables...");
        
        // Create security_questions table
        await client.query(`
            CREATE TABLE IF NOT EXISTS security_questions (
                question_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                user_id UUID NOT NULL,
                question_text VARCHAR(255) NOT NULL,
                answer_hash TEXT NOT NULL,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES luno_users(user_id) ON DELETE CASCADE
            );
        `);
        console.log("✓ security_questions table created");

        // Create user_locations table
        await client.query(`
            CREATE TABLE IF NOT EXISTS user_locations (
                location_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                user_id UUID NOT NULL,
                ip_address VARCHAR(45),
                country VARCHAR(100),
                city VARCHAR(100),
                latitude DECIMAL(10, 8),
                longitude DECIMAL(11, 8),
                timezone VARCHAR(50),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES luno_users(user_id) ON DELETE CASCADE
            );
        `);
        console.log("✓ user_locations table created");

        // Create anomaly_detections table
        await client.query(`
            CREATE TABLE IF NOT EXISTS anomaly_detections (
                anomaly_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                user_id UUID NOT NULL,
                transaction_id UUID,
                anomaly_type VARCHAR(50) NOT NULL CHECK (anomaly_type IN ('large_amount', 'rapid_transactions', 'location_change')),
                severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
                description TEXT NOT NULL,
                detected_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                resolved_at TIMESTAMP WITH TIME ZONE,
                status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'authorized', 'rejected', 'expired')),
                metadata JSONB,
                FOREIGN KEY (user_id) REFERENCES luno_users(user_id) ON DELETE CASCADE,
                FOREIGN KEY (transaction_id) REFERENCES transaction_history(transaction_id) ON DELETE SET NULL
            );
        `);
        console.log("✓ anomaly_detections table created");

        // Create user_notifications table
        await client.query(`
            CREATE TABLE IF NOT EXISTS user_notifications (
                notification_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                user_id UUID NOT NULL,
                title VARCHAR(255) NOT NULL,
                message TEXT NOT NULL,
                notification_type VARCHAR(50) NOT NULL CHECK (notification_type IN ('anomaly', 'security', 'transaction', 'system')),
                is_read BOOLEAN DEFAULT false,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                read_at TIMESTAMP WITH TIME ZONE,
                metadata JSONB,
                FOREIGN KEY (user_id) REFERENCES luno_users(user_id) ON DELETE CASCADE
            );
        `);
        console.log("✓ user_notifications table created");

        // Create email_alerts table
        await client.query(`
            CREATE TABLE IF NOT EXISTS email_alerts (
                alert_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                user_id UUID NOT NULL,
                email VARCHAR(255) NOT NULL,
                subject VARCHAR(255) NOT NULL,
                message TEXT NOT NULL,
                alert_type VARCHAR(50) NOT NULL CHECK (alert_type IN ('anomaly', 'security', 'transaction')),
                sent_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                status VARCHAR(20) DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'failed')),
                metadata JSONB,
                FOREIGN KEY (user_id) REFERENCES luno_users(user_id) ON DELETE CASCADE
            );
        `);
        console.log("✓ email_alerts table created");

        // Create user_notification_settings table
        await client.query(`
            CREATE TABLE IF NOT EXISTS user_notification_settings (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                user_id UUID UNIQUE NOT NULL,
                push_enabled BOOLEAN DEFAULT TRUE,
                inapp_enabled BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES luno_users(user_id) ON DELETE CASCADE
            );
        `);
        console.log("✓ user_notification_settings table created");

        // Create user_face_embeddings table
        await client.query(`
            CREATE TABLE IF NOT EXISTS user_face_embeddings (
                user_id UUID PRIMARY KEY REFERENCES luno_users(user_id) ON DELETE CASCADE,
                face_embeddings TEXT NOT NULL,
                last_trained TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                facial_login_enabled BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("✓ user_face_embeddings table created");

        // Create face_login_audit table
        await client.query(`
            CREATE TABLE IF NOT EXISTS face_login_audit (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                user_id UUID REFERENCES luno_users(user_id) ON DELETE CASCADE,
                attempt_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                success BOOLEAN,
                client_ip VARCHAR(64),
                user_agent TEXT,
                similarity_score FLOAT,
                notes TEXT
            );
        `);
        console.log("✓ face_login_audit table created");

        // Add transaction_location column to transaction_history if it doesn't exist
        await client.query(`
            ALTER TABLE transaction_history ADD COLUMN IF NOT EXISTS transaction_location JSONB;
        `);
        console.log("✓ transaction_location column added to transaction_history");

        // Create indexes for better performance
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_transaction_history_location ON transaction_history USING GIN (transaction_location);
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_transaction_history_user_created ON transaction_history (user_id, created_at DESC);
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_anomaly_detections_user_status ON anomaly_detections (user_id, status);
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_user_notifications_user_read ON user_notifications (user_id, is_read);
        `);
        console.log("✓ Performance indexes created");

        // Create Credit Scores Table
        await client.query(`
            CREATE TABLE IF NOT EXISTS credit_scores (
                score_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                user_id UUID NOT NULL,
                score INTEGER NOT NULL CHECK (score >= 300 AND score <= 850),
                grade VARCHAR(2) NOT NULL CHECK (grade IN ('A+', 'A', 'B+', 'B', 'C+', 'C', 'D', 'F')),
                factors JSONB NOT NULL,
                recommendations JSONB NOT NULL,
                last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES luno_users(user_id) ON DELETE CASCADE,
                UNIQUE(user_id)
            );
        `);
        console.log("✓ credit_scores table created");

        // Create Bank Statements Table
        await client.query(`
            CREATE TABLE IF NOT EXISTS bank_statements (
                statement_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                user_id UUID NOT NULL,
                statement_number VARCHAR(50) UNIQUE NOT NULL,
                period VARCHAR(20) NOT NULL CHECK (period IN ('weekly', 'monthly', 'quarterly', 'yearly')),
                content JSONB NOT NULL,
                generated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES luno_users(user_id) ON DELETE CASCADE
            );
        `);
        console.log("✓ bank_statements table created");

        // Create Behavioral Patterns Table
        await client.query(`
            CREATE TABLE IF NOT EXISTS behavioral_patterns (
                pattern_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                user_id UUID NOT NULL,
                pattern_type VARCHAR(20) NOT NULL CHECK (pattern_type IN ('swipe', 'tap', 'draw', 'gesture', 'typing')),
                pattern_data JSONB NOT NULL,
                pattern_hash VARCHAR(64) NOT NULL,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES luno_users(user_id) ON DELETE CASCADE,
                UNIQUE(user_id, pattern_type)
            );
        `);
        console.log("✓ behavioral_patterns table created");

        // Create Biometric Verification Logs Table
        await client.query(`
            CREATE TABLE IF NOT EXISTS biometric_verification_logs (
                log_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                user_id UUID NOT NULL,
                pattern_type VARCHAR(20) NOT NULL,
                verified BOOLEAN NOT NULL,
                similarity_score DECIMAL(3,2) NOT NULL CHECK (similarity_score >= 0 AND similarity_score <= 1),
                attempted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                ip_address INET,
                user_agent TEXT,
                FOREIGN KEY (user_id) REFERENCES luno_users(user_id) ON DELETE CASCADE
            );
        `);
        console.log("✓ biometric_verification_logs table created");

        // Create Password Reset Tables
        await client.query(`
            CREATE TABLE IF NOT EXISTS password_reset_codes (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                user_id UUID NOT NULL,
                email VARCHAR(255) NOT NULL,
                reset_code VARCHAR(6) NOT NULL,
                expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
                used BOOLEAN DEFAULT FALSE,
                used_at TIMESTAMP WITH TIME ZONE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES luno_users(user_id) ON DELETE CASCADE
            );
        `);
        console.log("✓ password_reset_codes table created");

        await client.query(`
            CREATE TABLE IF NOT EXISTS password_reset_tokens (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                user_id UUID NOT NULL,
                token VARCHAR(255) UNIQUE NOT NULL,
                expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
                verification_method VARCHAR(50) DEFAULT 'email',
                used BOOLEAN DEFAULT FALSE,
                used_at TIMESTAMP WITH TIME ZONE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES luno_users(user_id) ON DELETE CASCADE
            );
        `);
        console.log("✓ password_reset_tokens table created");

        // Create Payment History Table
        await client.query(`
            CREATE TABLE IF NOT EXISTS payment_history (
                payment_id SERIAL PRIMARY KEY,
                reference VARCHAR(50) UNIQUE NOT NULL,
                sender_id UUID NOT NULL REFERENCES luno_users(user_id) ON DELETE CASCADE,
                receiver_id UUID NOT NULL REFERENCES luno_users(user_id) ON DELETE CASCADE,
                sender_account_number VARCHAR(9) NOT NULL,
                receiver_account_number VARCHAR(9) NOT NULL,
                amount DECIMAL(15,2) NOT NULL,
                currency VARCHAR(3) DEFAULT 'ZAR',
                payment_status VARCHAR(20) DEFAULT 'pending',
                payment_type VARCHAR(20) DEFAULT 'peer_to_peer',
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("✓ payment_history table created");

        // Create Payment Verification Table
        await client.query(`
            CREATE TABLE IF NOT EXISTS payment_verification (
                verification_id SERIAL PRIMARY KEY,
                payment_reference VARCHAR(50) UNIQUE NOT NULL,
                sender_id UUID NOT NULL REFERENCES luno_users(user_id) ON DELETE CASCADE,
                receiver_account_number VARCHAR(9) NOT NULL,
                amount DECIMAL(15,2) NOT NULL,
                description TEXT,
                verification_code VARCHAR(6) NOT NULL,
                expires_at TIMESTAMP NOT NULL,
                verified BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("✓ payment_verification table created");

        // Create Face Verification Logs Table
        await client.query(`
            CREATE TABLE IF NOT EXISTS face_verification_logs (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                user_id UUID REFERENCES luno_users(user_id) ON DELETE CASCADE,
                success BOOLEAN NOT NULL,
                similarity_score DECIMAL(3,2) CHECK (similarity_score >= 0 AND similarity_score <= 1),
                liveness_score DECIMAL(3,2) CHECK (liveness_score >= 0 AND liveness_score <= 1),
                client_ip VARCHAR(64),
                user_agent TEXT,
                device_info JSONB,
                attempted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("✓ face_verification_logs table created");

        // Create Face Enrollment Logs Table
        await client.query(`
            CREATE TABLE IF NOT EXISTS face_enrollment_logs (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                user_id UUID NOT NULL REFERENCES luno_users(user_id) ON DELETE CASCADE,
                client_ip VARCHAR(64),
                user_agent TEXT,
                device_info JSONB,
                enrollment_success BOOLEAN NOT NULL,
                timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("✓ face_enrollment_logs table created");

        // Create Plastic Card Table
        await client.query(`
            CREATE TABLE IF NOT EXISTS plastic_card (
                wallet_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                card_number VARCHAR(16) UNIQUE NOT NULL,
                expiry_date DATE NOT NULL,
                cvv VARCHAR(3) NOT NULL,
                user_id UUID REFERENCES luno_users(user_id) ON DELETE CASCADE,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT valid_expiry_date CHECK (expiry_date >= CURRENT_DATE AND expiry_date <= '2030-12-31')
            );
        `);
        console.log("✓ plastic_card table created");

        // Create indexes for advanced models
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_credit_scores_user_id ON credit_scores(user_id);
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_credit_scores_last_updated ON credit_scores(last_updated);
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_bank_statements_user_id ON bank_statements(user_id);
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_bank_statements_generated_at ON bank_statements(generated_at);
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_behavioral_patterns_user_id ON behavioral_patterns(user_id);
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_behavioral_patterns_type ON behavioral_patterns(pattern_type);
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_biometric_logs_user_id ON biometric_verification_logs(user_id);
        `);
        // Try to create index, but don't fail if column doesn't exist
        try {
            await client.query(`
                CREATE INDEX IF NOT EXISTS idx_biometric_logs_attempted_at ON biometric_verification_logs(attempted_at);
            `);
        } catch (indexError) {
            console.log("ℹ️ Skipping biometric_logs_attempted_at index (column may not exist)");
        }
        
        // Create indexes for password reset tables
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_password_reset_codes_email ON password_reset_codes(email);
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_password_reset_codes_expires ON password_reset_codes(expires_at);
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens(token);
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires ON password_reset_tokens(expires_at);
        `);
        
        // Create indexes for face verification tables
        try {
            await client.query(`
                CREATE INDEX IF NOT EXISTS idx_face_verification_logs_user_id ON face_verification_logs(user_id);
            `);
        } catch (indexError) {
            console.log("ℹ️ Skipping face_verification_logs_user_id index");
        }
        
        try {
            await client.query(`
                CREATE INDEX IF NOT EXISTS idx_face_verification_logs_attempted_at ON face_verification_logs(attempted_at);
            `);
        } catch (indexError) {
            console.log("ℹ️ Skipping face_verification_logs_attempted_at index");
        }
        
        try {
            await client.query(`
                CREATE INDEX IF NOT EXISTS idx_face_enrollment_logs_user_id ON face_enrollment_logs(user_id);
            `);
        } catch (indexError) {
            console.log("ℹ️ Skipping face_enrollment_logs_user_id index");
        }
        
        try {
            await client.query(`
                CREATE INDEX IF NOT EXISTS idx_face_enrollment_logs_timestamp ON face_enrollment_logs(timestamp);
            `);
        } catch (indexError) {
            console.log("ℹ️ Skipping face_enrollment_logs_timestamp index");
        }
        
        console.log("✓ Advanced model indexes created");

        console.log("✅ All database tables and indexes created successfully!");
        
    } catch (error) {
        console.error("Error setting up database:", error);
        process.exit(1);
    } finally {
        client.release();
        process.exit(0);
    }
};

setupDatabase(); 