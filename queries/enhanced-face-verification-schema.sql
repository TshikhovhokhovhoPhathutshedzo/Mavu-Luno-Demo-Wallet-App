-- Enhanced Face Verification Database Schema
-- This schema supports the new face verification requirements

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enhanced user face data table with multiple face records support
CREATE TABLE IF NOT EXISTS user_face_data (
    face_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES luno_users(user_id) ON DELETE CASCADE,
    face_embedding BYTEA NOT NULL, -- Encrypted face embedding vector (128D or 512D)
    embedding_model VARCHAR(50) DEFAULT 'facenet', -- Model used for embedding
    embedding_version VARCHAR(10) DEFAULT '1.0',
    is_primary BOOLEAN DEFAULT false, -- Primary face for verification
    is_active BOOLEAN DEFAULT true,
    quality_score DECIMAL(5,4), -- Face quality score (0-1)
    liveness_score DECIMAL(5,4), -- Liveness detection score
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB -- Additional metadata (lighting, angle, etc.)
);

-- Face verification settings per user
CREATE TABLE IF NOT EXISTS face_verification_settings (
    setting_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES luno_users(user_id) ON DELETE CASCADE,
    face_auth_enabled BOOLEAN DEFAULT false,
    confidence_threshold DECIMAL(5,4) DEFAULT 0.6, -- Similarity threshold
    max_attempts_per_hour INTEGER DEFAULT 10,
    require_liveness_check BOOLEAN DEFAULT true,
    allow_multiple_faces BOOLEAN DEFAULT false, -- Allow multiple face records
    auto_update_primary BOOLEAN DEFAULT true, -- Auto-update primary face
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

-- Enhanced authentication logs
CREATE TABLE IF NOT EXISTS auth_logs (
    log_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES luno_users(user_id) ON DELETE SET NULL,
    auth_method VARCHAR(20) NOT NULL CHECK (auth_method IN ('password', 'face', 'otp', 'biometric')),
    success BOOLEAN NOT NULL,
    confidence_score DECIMAL(5,4), -- For face auth
    liveness_score DECIMAL(5,4), -- For face auth
    client_ip INET,
    user_agent TEXT,
    device_info JSONB,
    location_info JSONB,
    error_message TEXT,
    session_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Face enrollment sessions (enhanced)
CREATE TABLE IF NOT EXISTS face_enrollment_sessions (
    session_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES luno_users(user_id) ON DELETE CASCADE,
    session_token VARCHAR(255) UNIQUE NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'expired')),
    images_captured INTEGER DEFAULT 0,
    required_images INTEGER DEFAULT 5,
    quality_threshold DECIMAL(5,4) DEFAULT 0.7,
    liveness_required BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP + INTERVAL '15 minutes'),
    completed_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB
);

-- Face verification attempts (enhanced)
CREATE TABLE IF NOT EXISTS face_verification_attempts (
    attempt_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES luno_users(user_id) ON DELETE SET NULL,
    session_id VARCHAR(255),
    success BOOLEAN NOT NULL,
    confidence_score DECIMAL(5,4),
    liveness_score DECIMAL(5,4),
    threshold_used DECIMAL(5,4) DEFAULT 0.6,
    processing_time_ms INTEGER, -- Processing time in milliseconds
    client_ip INET,
    user_agent TEXT,
    device_info JSONB,
    attempt_location JSONB,
    error_code VARCHAR(50),
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Liveness detection logs
CREATE TABLE IF NOT EXISTS liveness_detection_logs (
    log_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES luno_users(user_id) ON DELETE SET NULL,
    session_id VARCHAR(255),
    liveness_score DECIMAL(5,4) NOT NULL,
    detection_method VARCHAR(50) DEFAULT 'blink_motion', -- blink_motion, texture_analysis, depth_analysis
    is_live BOOLEAN NOT NULL,
    spoof_indicators JSONB, -- Indicators of spoofing attempts
    client_ip INET,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Security events and suspicious activity
CREATE TABLE IF NOT EXISTS security_events (
    event_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES luno_users(user_id) ON DELETE SET NULL,
    event_type VARCHAR(50) NOT NULL, -- spoof_attempt, multiple_faces, low_quality, etc.
    severity VARCHAR(20) DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    description TEXT,
    client_ip INET,
    user_agent TEXT,
    device_info JSONB,
    metadata JSONB,
    resolved BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for optimal performance
CREATE INDEX IF NOT EXISTS idx_user_face_data_user_id ON user_face_data(user_id);
CREATE INDEX IF NOT EXISTS idx_user_face_data_primary ON user_face_data(user_id, is_primary) WHERE is_primary = true;
CREATE INDEX IF NOT EXISTS idx_user_face_data_active ON user_face_data(user_id, is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_face_verification_settings_user_id ON face_verification_settings(user_id);

CREATE INDEX IF NOT EXISTS idx_auth_logs_user_id ON auth_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_logs_created ON auth_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_auth_logs_auth_method ON auth_logs(auth_method);
CREATE INDEX IF NOT EXISTS idx_auth_logs_success ON auth_logs(success);

CREATE INDEX IF NOT EXISTS idx_face_enrollment_sessions_user_id ON face_enrollment_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_face_enrollment_sessions_token ON face_enrollment_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_face_enrollment_sessions_status ON face_enrollment_sessions(status);
CREATE INDEX IF NOT EXISTS idx_face_enrollment_sessions_expires ON face_enrollment_sessions(expires_at);

CREATE INDEX IF NOT EXISTS idx_face_verification_attempts_user_id ON face_verification_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_face_verification_attempts_created ON face_verification_attempts(created_at);
CREATE INDEX IF NOT EXISTS idx_face_verification_attempts_success ON face_verification_attempts(success);

CREATE INDEX IF NOT EXISTS idx_liveness_detection_logs_user_id ON liveness_detection_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_liveness_detection_logs_created ON liveness_detection_logs(created_at);

CREATE INDEX IF NOT EXISTS idx_security_events_user_id ON security_events(user_id);
CREATE INDEX IF NOT EXISTS idx_security_events_type ON security_events(event_type);
CREATE INDEX IF NOT EXISTS idx_security_events_severity ON security_events(severity);
CREATE INDEX IF NOT EXISTS idx_security_events_created ON security_events(created_at);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at columns
CREATE TRIGGER update_user_face_data_updated_at 
    BEFORE UPDATE ON user_face_data 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_face_verification_settings_updated_at 
    BEFORE UPDATE ON face_verification_settings 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create function to ensure only one primary face per user
CREATE OR REPLACE FUNCTION ensure_single_primary_face()
RETURNS TRIGGER AS $$
BEGIN
    -- If setting a face as primary, unset all other primary faces for this user
    IF NEW.is_primary = true THEN
        UPDATE user_face_data 
        SET is_primary = false 
        WHERE user_id = NEW.user_id AND face_id != NEW.face_id;
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to ensure single primary face
CREATE TRIGGER ensure_single_primary_face_trigger
    BEFORE INSERT OR UPDATE ON user_face_data
    FOR EACH ROW EXECUTE FUNCTION ensure_single_primary_face();

-- Create function to clean up expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS void AS $$
BEGIN
    DELETE FROM face_enrollment_sessions 
    WHERE expires_at < CURRENT_TIMESTAMP AND status IN ('pending', 'in_progress');
    
    DELETE FROM face_verification_attempts 
    WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '30 days';
END;
$$ language 'plpgsql';

-- Create a view for user face verification status
CREATE OR REPLACE VIEW user_face_verification_status AS
SELECT 
    u.user_id,
    u.username,
    u.email,
    fvs.face_auth_enabled,
    fvs.confidence_threshold,
    fvs.require_liveness_check,
    COUNT(ufd.face_id) as face_records_count,
    MAX(ufd.created_at) as last_face_enrollment,
    MAX(auth.created_at) as last_face_login,
    CASE 
        WHEN fvs.face_auth_enabled = true AND COUNT(ufd.face_id) > 0 THEN 'enabled'
        WHEN fvs.face_auth_enabled = true AND COUNT(ufd.face_id) = 0 THEN 'pending_enrollment'
        ELSE 'disabled'
    END as verification_status
FROM luno_users u
LEFT JOIN face_verification_settings fvs ON u.user_id = fvs.user_id
LEFT JOIN user_face_data ufd ON u.user_id = ufd.user_id AND ufd.is_active = true
LEFT JOIN auth_logs auth ON u.user_id = auth.user_id AND auth.auth_method = 'face' AND auth.success = true
GROUP BY u.user_id, u.username, u.email, fvs.face_auth_enabled, fvs.confidence_threshold, fvs.require_liveness_check;
