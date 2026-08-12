-- Advanced Models Database Schema
-- Credit Score, Document Analysis, and Behavioral Biometrics

-- Credit Scores Table
CREATE TABLE IF NOT EXISTS credit_scores (
    score_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    score INTEGER NOT NULL CHECK (score >= 300 AND score <= 850),
    grade VARCHAR(2) NOT NULL CHECK (grade IN ('A+', 'A', 'B+', 'B', 'C+', 'C', 'D', 'F')),
    factors JSONB NOT NULL, -- Store individual factor scores
    recommendations JSONB NOT NULL, -- Store personalized recommendations
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES luno_users(user_id) ON DELETE CASCADE,
    UNIQUE(user_id)
);

-- Bank Statements Table
CREATE TABLE IF NOT EXISTS bank_statements (
    statement_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    statement_number VARCHAR(50) UNIQUE NOT NULL,
    period VARCHAR(20) NOT NULL CHECK (period IN ('weekly', 'monthly', 'quarterly', 'yearly')),
    content JSONB NOT NULL, -- Store complete statement data
    generated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES luno_users(user_id) ON DELETE CASCADE
);

-- Behavioral Patterns Table
CREATE TABLE IF NOT EXISTS behavioral_patterns (
    pattern_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    pattern_type VARCHAR(20) NOT NULL CHECK (pattern_type IN ('swipe', 'tap', 'draw', 'gesture', 'typing')),
    pattern_data JSONB NOT NULL, -- Store pattern coordinates and metadata
    pattern_hash VARCHAR(64) NOT NULL, -- SHA256 hash of pattern data
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES luno_users(user_id) ON DELETE CASCADE,
    UNIQUE(user_id, pattern_type)
);

-- Biometric Verification Logs Table
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

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_credit_scores_user_id ON credit_scores(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_scores_last_updated ON credit_scores(last_updated);

CREATE INDEX IF NOT EXISTS idx_bank_statements_user_id ON bank_statements(user_id);
CREATE INDEX IF NOT EXISTS idx_bank_statements_generated_at ON bank_statements(generated_at);
CREATE INDEX IF NOT EXISTS idx_bank_statements_period ON bank_statements(period);

CREATE INDEX IF NOT EXISTS idx_behavioral_patterns_user_id ON behavioral_patterns(user_id);
CREATE INDEX IF NOT EXISTS idx_behavioral_patterns_type ON behavioral_patterns(pattern_type);
CREATE INDEX IF NOT EXISTS idx_behavioral_patterns_active ON behavioral_patterns(is_active);

CREATE INDEX IF NOT EXISTS idx_biometric_logs_user_id ON biometric_verification_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_biometric_logs_pattern_type ON biometric_verification_logs(pattern_type);
CREATE INDEX IF NOT EXISTS idx_biometric_logs_attempted_at ON biometric_verification_logs(attempted_at);
CREATE INDEX IF NOT EXISTS idx_biometric_logs_verified ON biometric_verification_logs(verified);

-- Add comments for documentation
COMMENT ON TABLE credit_scores IS 'Stores user credit scores and financial health metrics';
COMMENT ON TABLE bank_statements IS 'Stores generated bank statements with charts and analysis';
COMMENT ON TABLE behavioral_patterns IS 'Stores user behavioral biometric patterns for authentication';
COMMENT ON TABLE biometric_verification_logs IS 'Logs all biometric verification attempts for security and analytics';

COMMENT ON COLUMN credit_scores.factors IS 'JSON object containing individual factor scores (payment_history, credit_utilization, etc.)';
COMMENT ON COLUMN credit_scores.recommendations IS 'JSON array of personalized recommendations for improving credit score';

COMMENT ON COLUMN bank_statements.content IS 'Complete statement data including charts, transactions, and analysis';
COMMENT ON COLUMN bank_statements.statement_number IS 'Unique identifier for each statement (format: STMT-timestamp-random)';

COMMENT ON COLUMN behavioral_patterns.pattern_data IS 'JSON object containing pattern coordinates, timing, and metadata';
COMMENT ON COLUMN behavioral_patterns.pattern_hash IS 'SHA256 hash of pattern data for security';

COMMENT ON COLUMN biometric_verification_logs.similarity_score IS 'Similarity score between stored and input patterns (0.0 to 1.0)';
COMMENT ON COLUMN biometric_verification_logs.verified IS 'Whether the verification attempt was successful';
