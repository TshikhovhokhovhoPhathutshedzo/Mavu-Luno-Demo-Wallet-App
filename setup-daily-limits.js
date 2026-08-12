import pool from "./auth/db.js";

const setupDailyLimits = async () => {
    const client = await pool.connect();
    
    try {
        console.log("Setting up daily limits tables...");
        
        // Create user_daily_limits table
        await client.query(`
            CREATE TABLE IF NOT EXISTS user_daily_limits (
                limit_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                user_id UUID NOT NULL,
                limit_type VARCHAR(20) NOT NULL CHECK (limit_type IN ('deposit', 'withdrawal')),
                daily_limit_cents BIGINT NOT NULL CHECK (daily_limit_cents > 0),
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                
                UNIQUE(user_id, limit_type),
                FOREIGN KEY (user_id) REFERENCES luno_users(user_id) ON DELETE CASCADE
            );
        `);
        console.log("✓ user_daily_limits table created");

        // Create daily_transaction_usage table
        await client.query(`
            CREATE TABLE IF NOT EXISTS daily_transaction_usage (
                usage_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                user_id UUID NOT NULL,
                transaction_date DATE NOT NULL,
                transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('deposit', 'withdrawal')),
                total_amount_cents BIGINT NOT NULL DEFAULT 0,
                transaction_count INTEGER NOT NULL DEFAULT 0,
                last_transaction_at TIMESTAMP WITH TIME ZONE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                
                UNIQUE(user_id, transaction_date, transaction_type),
                FOREIGN KEY (user_id) REFERENCES luno_users(user_id) ON DELETE CASCADE
            );
        `);
        console.log("✓ daily_transaction_usage table created");

        // Create limit_change_history table
        await client.query(`
            CREATE TABLE IF NOT EXISTS limit_change_history (
                history_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                user_id UUID NOT NULL,
                limit_type VARCHAR(20) NOT NULL CHECK (limit_type IN ('deposit', 'withdrawal')),
                old_limit_cents BIGINT,
                new_limit_cents BIGINT NOT NULL,
                changed_by VARCHAR(50) DEFAULT 'user',
                change_reason TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                
                FOREIGN KEY (user_id) REFERENCES luno_users(user_id) ON DELETE CASCADE
            );
        `);
        console.log("✓ limit_change_history table created");

        // Create indexes for better performance
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_user_daily_limits_user_id ON user_daily_limits(user_id);
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_user_daily_limits_type ON user_daily_limits(limit_type);
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_daily_usage_user_date ON daily_transaction_usage(user_id, transaction_date);
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_daily_usage_type ON daily_transaction_usage(transaction_type);
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_limit_history_user_id ON limit_change_history(user_id);
        `);
        console.log("✓ Performance indexes created");

        // Create function to get user's daily limit
        await client.query(`
            CREATE OR REPLACE FUNCTION get_user_daily_limit(p_user_id UUID, p_limit_type VARCHAR(20))
            RETURNS BIGINT AS $$
            DECLARE
                limit_amount BIGINT;
            BEGIN
                SELECT daily_limit_cents INTO limit_amount
                FROM user_daily_limits
                WHERE user_id = p_user_id 
                AND limit_type = p_limit_type 
                AND is_active = true;
                
                RETURN COALESCE(limit_amount, 0);
            END;
            $$ LANGUAGE plpgsql;
        `);
        console.log("✓ get_user_daily_limit function created");

        // Create function to get user's daily usage
        await client.query(`
            CREATE OR REPLACE FUNCTION get_user_daily_usage(p_user_id UUID, p_limit_type VARCHAR(20), p_date DATE DEFAULT CURRENT_DATE)
            RETURNS BIGINT AS $$
            DECLARE
                usage_amount BIGINT;
            BEGIN
                SELECT total_amount_cents INTO usage_amount
                FROM daily_transaction_usage
                WHERE user_id = p_user_id 
                AND transaction_type = p_limit_type 
                AND transaction_date = p_date;
                
                RETURN COALESCE(usage_amount, 0);
            END;
            $$ LANGUAGE plpgsql;
        `);
        console.log("✓ get_user_daily_usage function created");

        // Create function to update daily usage
        await client.query(`
            CREATE OR REPLACE FUNCTION update_daily_usage(
                p_user_id UUID, 
                p_limit_type VARCHAR(20), 
                p_amount_cents BIGINT,
                p_date DATE DEFAULT CURRENT_DATE
            )
            RETURNS VOID AS $$
            BEGIN
                INSERT INTO daily_transaction_usage (user_id, transaction_date, transaction_type, total_amount_cents, transaction_count, last_transaction_at)
                VALUES (p_user_id, p_date, p_limit_type, p_amount_cents, 1, NOW())
                ON CONFLICT (user_id, transaction_date, transaction_type)
                DO UPDATE SET
                    total_amount_cents = daily_transaction_usage.total_amount_cents + p_amount_cents,
                    transaction_count = daily_transaction_usage.transaction_count + 1,
                    last_transaction_at = NOW(),
                    updated_at = NOW();
            END;
            $$ LANGUAGE plpgsql;
        `);
        console.log("✓ update_daily_usage function created");

        // Create function to check if transaction exceeds daily limit
        await client.query(`
            CREATE OR REPLACE FUNCTION check_daily_limit(
                p_user_id UUID, 
                p_limit_type VARCHAR(20), 
                p_amount_cents BIGINT,
                p_date DATE DEFAULT CURRENT_DATE
            )
            RETURNS TABLE(
                is_within_limit BOOLEAN,
                current_usage_cents BIGINT,
                daily_limit_cents BIGINT,
                remaining_limit_cents BIGINT
            ) AS $$
            DECLARE
                v_daily_limit BIGINT;
                v_current_usage BIGINT;
                v_remaining BIGINT;
                v_within_limit BOOLEAN;
            BEGIN
                v_daily_limit := get_user_daily_limit(p_user_id, p_limit_type);
                
                IF v_daily_limit = 0 THEN
                    RETURN QUERY SELECT true, 0::BIGINT, 0::BIGINT, 0::BIGINT;
                    RETURN;
                END IF;
                
                v_current_usage := get_user_daily_usage(p_user_id, p_limit_type, p_date);
                v_remaining := GREATEST(0, v_daily_limit - v_current_usage);
                v_within_limit := (v_current_usage + p_amount_cents) <= v_daily_limit;
                
                RETURN QUERY SELECT v_within_limit, v_current_usage, v_daily_limit, v_remaining;
            END;
            $$ LANGUAGE plpgsql;
        `);
        console.log("✓ check_daily_limit function created");

        console.log("✅ Daily limits system setup completed successfully!");
        
    } catch (error) {
        console.error("Error setting up daily limits:", error);
        process.exit(1);
    } finally {
        client.release();
        process.exit(0);
    }
};

setupDailyLimits();

