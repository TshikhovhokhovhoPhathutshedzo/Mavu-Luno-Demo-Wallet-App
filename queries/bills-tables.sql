-- Bills Section Database Schema
-- This file contains the database tables for the bills payment system

-- Bills History Table
CREATE TABLE IF NOT EXISTS bills_history (
    bill_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES luno_users(user_id) ON DELETE CASCADE,
    bill_type VARCHAR(20) NOT NULL CHECK (bill_type IN ('electricity', 'airtime', 'water')),
    amount_paid INTEGER NOT NULL, -- Amount in cents
    meter_number VARCHAR(20), -- For electricity and water bills
    phone_number VARCHAR(20), -- For airtime recharge
    recharge_code VARCHAR(20), -- Generated for airtime payments
    transaction_id UUID REFERENCES transaction_history(transaction_id) ON DELETE CASCADE,
    payment_status VARCHAR(20) DEFAULT 'completed' CHECK (payment_status IN ('pending', 'completed', 'failed')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for better query performance
CREATE INDEX IF NOT EXISTS idx_bills_history_user_id ON bills_history(user_id);
CREATE INDEX IF NOT EXISTS idx_bills_history_bill_type ON bills_history(bill_type);
CREATE INDEX IF NOT EXISTS idx_bills_history_created_at ON bills_history(created_at);

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_bills_history_updated_at()
RETURNS TRIGGER AS $func$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$func$ language 'plpgsql';

-- Trigger to automatically update the updated_at column
CREATE TRIGGER update_bills_history_updated_at
    BEFORE UPDATE ON bills_history
    FOR EACH ROW
    EXECUTE FUNCTION update_bills_history_updated_at();

-- Add comments for documentation
COMMENT ON TABLE bills_history IS 'Stores all bill payment transactions including electricity, airtime, and water bills';
COMMENT ON COLUMN bills_history.bill_id IS 'Unique identifier for each bill payment';
COMMENT ON COLUMN bills_history.user_id IS 'Reference to the user who made the payment';
COMMENT ON COLUMN bills_history.bill_type IS 'Type of bill: electricity, airtime, or water';
COMMENT ON COLUMN bills_history.amount_paid IS 'Amount paid in cents for consistency with other transactions';
COMMENT ON COLUMN bills_history.meter_number IS 'Meter number for electricity and water bills';
COMMENT ON COLUMN bills_history.phone_number IS 'Phone number for airtime recharge';
COMMENT ON COLUMN bills_history.recharge_code IS 'Generated recharge code for airtime payments';
COMMENT ON COLUMN bills_history.transaction_id IS 'Reference to the transaction in transaction_history table';
