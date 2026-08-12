-- Add transaction_location column to transaction_history table if it doesn't exist
ALTER TABLE transaction_history ADD COLUMN IF NOT EXISTS transaction_location JSONB;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_transaction_history_location ON transaction_history USING GIN (transaction_location);

-- Add index for user_id and created_at for better performance
CREATE INDEX IF NOT EXISTS idx_transaction_history_user_created ON transaction_history (user_id, created_at DESC); 