-- Missing Tables for Luno Backend
-- These tables are referenced in the code but missing from the schema

-- Accounts table (referenced in controllers but missing)
CREATE TABLE IF NOT EXISTS accounts (
    account_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    account_number VARCHAR(20) UNIQUE NOT NULL,
    balance BIGINT NOT NULL DEFAULT 0, -- Store in cents for precision
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES luno_users(user_id) ON DELETE CASCADE
);

-- Transaction Categories table (referenced in controllers but missing)
CREATE TABLE IF NOT EXISTS transaction_categories (
    category_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_name VARCHAR(50) NOT NULL,
    category_type VARCHAR(20) NOT NULL CHECK (category_type IN ('income', 'expense', 'transfer')),
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert default transaction categories
INSERT INTO transaction_categories (category_name, category_type, description) VALUES
('deposit', 'income', 'Money deposited into account'),
('withdrawal', 'expense', 'Money withdrawn from account'),
('transfer', 'transfer', 'Internal transfer between accounts'),
('bills', 'expense', 'Bill payments'),
('peer_to_peer', 'transfer', 'Peer-to-peer transfers')
ON CONFLICT DO NOTHING;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_accounts_account_number ON accounts(account_number);
CREATE INDEX IF NOT EXISTS idx_accounts_active ON accounts(is_active);
CREATE INDEX IF NOT EXISTS idx_transaction_categories_type ON transaction_categories(category_type);
CREATE INDEX IF NOT EXISTS idx_transaction_categories_active ON transaction_categories(is_active);

-- Create function to generate account numbers
CREATE OR REPLACE FUNCTION generate_account_number()
RETURNS VARCHAR(20) AS $$
DECLARE
    new_number VARCHAR(20);
    exists_count INTEGER;
BEGIN
    LOOP
        -- Generate a 10-digit account number
        new_number := LPAD(FLOOR(RANDOM() * 10000000000)::TEXT, 10, '0');
        
        -- Check if it already exists
        SELECT COUNT(*) INTO exists_count FROM accounts WHERE account_number = new_number;
        
        -- If it doesn't exist, we can use it
        IF exists_count = 0 THEN
            EXIT;
        END IF;
    END LOOP;
    
    RETURN new_number;
END;
$$ LANGUAGE plpgsql;

-- Create function to create account for new users
CREATE OR REPLACE FUNCTION create_user_account(p_user_id UUID)
RETURNS UUID AS $$
DECLARE
    new_account_id UUID;
    new_account_number VARCHAR(20);
BEGIN
    -- Generate unique account number
    new_account_number := generate_account_number();
    
    -- Create account
    INSERT INTO accounts (user_id, account_number, balance, is_active)
    VALUES (p_user_id, new_account_number, 0, true)
    RETURNING account_id INTO new_account_id;
    
    RETURN new_account_id;
END;
$$ LANGUAGE plpgsql;

-- Add comments for documentation
COMMENT ON TABLE accounts IS 'User accounts with balances and account numbers';
COMMENT ON TABLE transaction_categories IS 'Categories for organizing transactions';
COMMENT ON COLUMN accounts.balance IS 'Account balance stored in cents for precision';
COMMENT ON COLUMN accounts.account_number IS 'Unique 10-digit account number';
