-- Budget Management Tables
-- This file creates tables for managing user budget items

-- Create budget_categories table for predefined categories
CREATE TABLE IF NOT EXISTS budget_categories (
    category_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_name VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    icon VARCHAR(50),
    color VARCHAR(7), -- Hex color code
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert default budget categories
INSERT INTO budget_categories (category_name, description, icon, color) VALUES
('Food', 'Food and dining expenses', '🍽️', '#22c55e'),
('Transport', 'Transportation and fuel', '🚗', '#3b82f6'),
('Bills', 'Utilities and monthly bills', '💡', '#f59e0b'),
('Shopping', 'Shopping and retail', '🛍️', '#8b5cf6'),
('Entertainment', 'Entertainment and leisure', '🎬', '#ec4899'),
('Healthcare', 'Medical and health expenses', '🏥', '#ef4444'),
('Education', 'Education and learning', '📚', '#06b6d4'),
('Other', 'Other miscellaneous expenses', '📦', '#6b7280')
ON CONFLICT (category_name) DO NOTHING;

-- Create user_budgets table for storing user budget items
CREATE TABLE IF NOT EXISTS user_budgets (
    budget_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    category_id UUID NOT NULL,
    budget_amount_cents BIGINT NOT NULL CHECK (budget_amount_cents > 0),
    period_type VARCHAR(20) NOT NULL DEFAULT 'monthly' CHECK (period_type IN ('weekly', 'monthly', 'yearly')),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES luno_users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES budget_categories(category_id) ON DELETE CASCADE,
    UNIQUE(user_id, category_id, period_type)
);

-- Create budget_usage table for tracking actual spending against budgets
CREATE TABLE IF NOT EXISTS budget_usage (
    usage_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    budget_id UUID NOT NULL,
    user_id UUID NOT NULL,
    category_id UUID NOT NULL,
    usage_amount_cents BIGINT NOT NULL DEFAULT 0,
    usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (budget_id) REFERENCES user_budgets(budget_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES luno_users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES budget_categories(category_id) ON DELETE CASCADE,
    UNIQUE(budget_id, usage_date)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_user_budgets_user_id ON user_budgets(user_id);
CREATE INDEX IF NOT EXISTS idx_user_budgets_category_id ON user_budgets(category_id);
CREATE INDEX IF NOT EXISTS idx_user_budgets_active ON user_budgets(is_active);
CREATE INDEX IF NOT EXISTS idx_budget_usage_budget_id ON budget_usage(budget_id);
CREATE INDEX IF NOT EXISTS idx_budget_usage_user_id ON budget_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_budget_usage_date ON budget_usage(usage_date);

-- Create function to update budget_usage when transactions occur
CREATE OR REPLACE FUNCTION update_budget_usage()
RETURNS TRIGGER AS $$
DECLARE
    budget_record RECORD;
    v_category_name TEXT;
BEGIN
    -- Get the category name from the transaction
    SELECT tc.category_name INTO v_category_name
    FROM transaction_categories tc
    WHERE tc.category_id = NEW.category_id;
    
    -- Find matching budget for this user and category
    SELECT ub.budget_id, ub.user_id, ub.category_id
    INTO budget_record
    FROM user_budgets ub
    JOIN budget_categories bc ON ub.category_id = bc.category_id
    WHERE ub.user_id = NEW.user_id 
    AND bc.category_name = v_category_name
    AND ub.is_active = true
    AND ub.period_type = 'monthly';
    
    -- If budget exists, update usage
    IF budget_record.budget_id IS NOT NULL THEN
        INSERT INTO budget_usage (budget_id, user_id, category_id, usage_amount_cents, usage_date)
        VALUES (budget_record.budget_id, budget_record.user_id, budget_record.category_id, 
                ABS(NEW.amount), CURRENT_DATE)
        ON CONFLICT (budget_id, usage_date)
        DO UPDATE SET
            usage_amount_cents = budget_usage.usage_amount_cents + ABS(NEW.amount),
            updated_at = CURRENT_TIMESTAMP;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update budget usage when transactions are inserted
DROP TRIGGER IF EXISTS trigger_update_budget_usage ON transactions;
CREATE TRIGGER trigger_update_budget_usage
    AFTER INSERT ON transactions
    FOR EACH ROW
    EXECUTE FUNCTION update_budget_usage();

-- Create function to get budget summary for a user
CREATE OR REPLACE FUNCTION get_budget_summary(p_user_id UUID)
RETURNS TABLE (
    budget_id UUID,
    category_name VARCHAR(50),
    category_icon VARCHAR(50),
    category_color VARCHAR(7),
    budget_amount_rands NUMERIC(10,2),
    usage_amount_rands NUMERIC(10,2),
    remaining_amount_rands NUMERIC(10,2),
    usage_percentage NUMERIC(5,2),
    period_type VARCHAR(20),
    created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ub.budget_id,
        bc.category_name,
        bc.icon,
        bc.color,
        ROUND(ub.budget_amount_cents::NUMERIC / 100, 2) as budget_amount_rands,
        ROUND(COALESCE(bu.total_usage, 0)::NUMERIC / 100, 2) as usage_amount_rands,
        ROUND((ub.budget_amount_cents - COALESCE(bu.total_usage, 0))::NUMERIC / 100, 2) as remaining_amount_rands,
        ROUND((COALESCE(bu.total_usage, 0)::NUMERIC / ub.budget_amount_cents * 100), 2) as usage_percentage,
        ub.period_type,
        ub.created_at
    FROM user_budgets ub
    JOIN budget_categories bc ON ub.category_id = bc.category_id
    LEFT JOIN (
        SELECT 
            budget_usage.budget_id,
            SUM(budget_usage.usage_amount_cents) as total_usage
        FROM budget_usage
        WHERE budget_usage.usage_date >= DATE_TRUNC('month', CURRENT_DATE)
        GROUP BY budget_usage.budget_id
    ) bu ON ub.budget_id = bu.budget_id
    WHERE ub.user_id = p_user_id
    AND ub.is_active = true
    ORDER BY bc.category_name;
END;
$$ LANGUAGE plpgsql;
