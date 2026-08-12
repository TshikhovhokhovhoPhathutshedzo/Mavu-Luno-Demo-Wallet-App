-- Add account_number column to luno_users table
ALTER TABLE luno_users ADD COLUMN IF NOT EXISTS account_number VARCHAR(9) UNIQUE;

-- Create payment_history table for peer-to-peer payments
CREATE TABLE IF NOT EXISTS payment_history (
    payment_id SERIAL PRIMARY KEY,
    reference VARCHAR(50) UNIQUE NOT NULL,
    sender_id UUID NOT NULL REFERENCES luno_users(user_id),
    receiver_id UUID NOT NULL REFERENCES luno_users(user_id),
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

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_payment_sender ON payment_history(sender_id);
CREATE INDEX IF NOT EXISTS idx_payment_receiver ON payment_history(receiver_id);
CREATE INDEX IF NOT EXISTS idx_payment_account_numbers ON payment_history(sender_account_number, receiver_account_number);
CREATE INDEX IF NOT EXISTS idx_payment_reference ON payment_history(reference);

-- Update existing users with account numbers if they don't have one
UPDATE luno_users 
SET account_number = LPAD(FLOOR(RANDOM() * 1000000000)::TEXT, 9, '0')
WHERE account_number IS NULL;

-- Ensure all users have unique account numbers
DO $$
DECLARE
    user_record RECORD;
    new_account_number VARCHAR(9);
    counter INTEGER := 0;
BEGIN
    FOR user_record IN SELECT user_id FROM luno_users WHERE account_number IS NULL LOOP
        LOOP
            new_account_number := LPAD(FLOOR(RANDOM() * 1000000000)::TEXT, 9, '0');
            BEGIN
                UPDATE luno_users SET account_number = new_account_number WHERE user_id = user_record.user_id;
                EXIT;
            EXCEPTION WHEN unique_violation THEN
                counter := counter + 1;
                IF counter > 100 THEN
                    RAISE EXCEPTION 'Unable to generate unique account number after 100 attempts';
                END IF;
            END;
        END LOOP;
    END LOOP;
END $$;

