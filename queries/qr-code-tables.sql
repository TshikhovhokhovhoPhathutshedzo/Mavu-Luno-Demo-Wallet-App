-- QR Code Tables for Wallet Application
-- This file creates the necessary tables for QR code generation and scanning

-- Create user_qr_codes table
CREATE TABLE IF NOT EXISTS user_qr_codes (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES luno_users(user_id) ON DELETE CASCADE,
    encrypted_id VARCHAR(500) NOT NULL UNIQUE,
    qr_code_url TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_qr_codes_user_id ON user_qr_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_user_qr_codes_encrypted_id ON user_qr_codes(encrypted_id);
CREATE INDEX IF NOT EXISTS idx_user_qr_codes_active ON user_qr_codes(is_active);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_qr_codes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
DROP TRIGGER IF EXISTS trigger_update_qr_codes_updated_at ON user_qr_codes;
CREATE TRIGGER trigger_update_qr_codes_updated_at
    BEFORE UPDATE ON user_qr_codes
    FOR EACH ROW
    EXECUTE FUNCTION update_qr_codes_updated_at();

-- Create function to get QR code statistics
CREATE OR REPLACE FUNCTION get_qr_code_stats()
RETURNS TABLE (
    total_qr_codes BIGINT,
    active_qr_codes BIGINT,
    inactive_qr_codes BIGINT,
    recent_generations BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*) as total_qr_codes,
        COUNT(*) FILTER (WHERE is_active = true) as active_qr_codes,
        COUNT(*) FILTER (WHERE is_active = false) as inactive_qr_codes,
        COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '7 days') as recent_generations
    FROM user_qr_codes;
END;
$$ LANGUAGE plpgsql;

-- Create function to clean up old inactive QR codes
CREATE OR REPLACE FUNCTION cleanup_old_qr_codes()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM user_qr_codes 
    WHERE is_active = false 
    AND created_at < CURRENT_DATE - INTERVAL '30 days';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Insert sample data for testing (optional)
-- This will be handled by the application when users generate their QR codes

-- Add comments for documentation
COMMENT ON TABLE user_qr_codes IS 'Stores QR code data for each user, including encrypted identifiers and URLs';
COMMENT ON COLUMN user_qr_codes.encrypted_id IS 'Encrypted unique identifier used in QR code';
COMMENT ON COLUMN user_qr_codes.qr_code_url IS 'URL to the generated QR code image';
COMMENT ON COLUMN user_qr_codes.is_active IS 'Whether this QR code is currently active and valid';
