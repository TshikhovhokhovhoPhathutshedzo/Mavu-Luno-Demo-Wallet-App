-- Daily Limits System Tables
-- This file creates the necessary tables for user-configurable daily limits

-- User Daily Limits Table
CREATE TABLE IF NOT EXISTS user_daily_limits (
    limit_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    limit_type VARCHAR(20) NOT NULL CHECK (limit_type IN ('deposit', 'withdrawal')),
    daily_limit_cents BIGINT NOT NULL CHECK (daily_limit_cents > 0), -- Store in cents for precision
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Ensure one limit per user per type
    UNIQUE(user_id, limit_type),
    FOREIGN KEY (user_id) REFERENCES luno_users(user_id) ON DELETE CASCADE
);

-- Daily Transaction Usage Tracking Table
CREATE TABLE IF NOT EXISTS daily_transaction_usage (
    usage_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    transaction_date DATE NOT NULL,
    transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('deposit', 'withdrawal')),
    total_amount_cents BIGINT NOT NULL DEFAULT 0, -- Total amount used today in cents
    transaction_count INTEGER NOT NULL DEFAULT 0, -- Number of transactions today
    last_transaction_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Ensure one record per user per type per day
    UNIQUE(user_id, transaction_date, transaction_type),
    FOREIGN KEY (user_id) REFERENCES luno_users(user_id) ON DELETE CASCADE
);

-- Limit Change History Table (for audit trail)
CREATE TABLE IF NOT EXISTS limit_change_history (
    history_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    limit_type VARCHAR(20) NOT NULL CHECK (limit_type IN ('deposit', 'withdrawal')),
    old_limit_cents BIGINT,
    new_limit_cents BIGINT NOT NULL,
    changed_by VARCHAR(50) DEFAULT 'user', -- 'user', 'admin', 'system'
    change_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES luno_users(user_id) ON DELETE CASCADE
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_user_daily_limits_user_id ON user_daily_limits(user_id);
CREATE INDEX IF NOT EXISTS idx_user_daily_limits_type ON user_daily_limits(limit_type);
CREATE INDEX IF NOT EXISTS idx_daily_usage_user_date ON daily_transaction_usage(user_id, transaction_date);
CREATE INDEX IF NOT EXISTS idx_daily_usage_type ON daily_transaction_usage(transaction_type);
CREATE INDEX IF NOT EXISTS idx_limit_history_user_id ON limit_change_history(user_id);

-- Insert default limits for existing users (if any)
-- This will be handled by the application logic, not in SQL

-- Function to get user's daily limit
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
    
    -- Return 0 if no limit is set (unlimited)
    RETURN COALESCE(limit_amount, 0);
END;
$$ LANGUAGE plpgsql;

-- Function to get user's daily usage
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
    
    -- Return 0 if no usage recorded
    RETURN COALESCE(usage_amount, 0);
END;
$$ LANGUAGE plpgsql;

-- Function to update daily usage
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

-- Function to check if transaction exceeds daily limit
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
    -- Get user's daily limit
    v_daily_limit := get_user_daily_limit(p_user_id, p_limit_type);
    
    -- If no limit is set (0), consider it unlimited
    IF v_daily_limit = 0 THEN
        RETURN QUERY SELECT true, 0::BIGINT, 0::BIGINT, 0::BIGINT;
        RETURN;
    END IF;
    
    -- Get current usage
    v_current_usage := get_user_daily_usage(p_user_id, p_limit_type, p_date);
    
    -- Calculate remaining limit
    v_remaining := GREATEST(0, v_daily_limit - v_current_usage);
    
    -- Check if transaction would exceed limit
    v_within_limit := (v_current_usage + p_amount_cents) <= v_daily_limit;
    
    RETURN QUERY SELECT v_within_limit, v_current_usage, v_daily_limit, v_remaining;
END;
$$ LANGUAGE plpgsql;
