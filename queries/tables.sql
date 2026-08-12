CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE luno_users (
    user_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username  VARCHAR(150) NOT NULL,
    email  VARCHAR(255) UNIQUE NOT NULL,
    user_password TEXT NOT NULL,
    UNIQUE(username, email),
    user_location TEXT
);

-- Add updated_at column to luno_users if not present
ALTER TABLE luno_users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
-- Ensure unique index on username
CREATE UNIQUE INDEX IF NOT EXISTS idx_luno_users_username ON luno_users(username);
-- Ensure unique index on email
CREATE UNIQUE INDEX IF NOT EXISTS idx_luno_users_email ON luno_users(email);

CREATE TABLE plastic_card (
    wallet_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    card_number VARCHAR(16) UNIQUE NOT NULL,
    expiry_date DATE NOT NULL,
    cvv VARCHAR(4) NOT NULL,
    user_id UUID UNIQUE, -- Ensure one to one relationship
    FOREIGN KEY (user_id) REFERENCES luno_users(user_id) ON DELETE CASCADE
);

CREATE TABLE transaction_history (
    transaction_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reference VARCHAR(255) UNIQUE NOT NULL, -- From Paystack
    user_id UUID NOT NULL,
    amount BIGINT NOT NULL, -- Store in Kobo (smallest currency unit)
    currency VARCHAR(10) DEFAULT 'ZAR', -- South african rands default
    transaction_status VARCHAR(50) NOT NULL, -- success, failed, pending, etc.
    payment_channel VARCHAR(50), -- card, bank
    transaction_type VARCHAR(50) NOT NULL CHECK (transaction_type IN ('deposit', 'withdrawal', 'internal')),
    metadata JSONB,
    transaction_location JSONB, -- Store location data for transactions
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,   
    FOREIGN KEY (user_id) REFERENCES luno_users(user_id) ON DELETE CASCADE
);

CREATE TABLE transaction_movements (
    movement_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id UUID NOT NULL, -- From transaction_history
    user_id UUID NOT NULL, -- Who the movement belongs to
    movement_type VARCHAR(50) NOT NULL CHECK (movement_type IN ('credit', 'debit')),
    amount BIGINT NOT NULL, -- Always positive
    balance_after BIGINT NOT NULL, -- User balance after this movement
    description TEXT, -- Optional (e.g., "Deposit via Paystack", "Internal transfer to User X")
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (transaction_id) REFERENCES transaction_history(transaction_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES luno_users(user_id) ON DELETE CASCADE
);

-- Security Questions Table
CREATE TABLE security_questions (
    question_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    question_text VARCHAR(255) NOT NULL,
    answer_hash TEXT NOT NULL, -- Hashed answer for security
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES luno_users(user_id) ON DELETE CASCADE
);

-- User Locations Table for Anomaly Detection
CREATE TABLE user_locations (
    location_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    ip_address VARCHAR(45), -- IPv4 or IPv6
    country VARCHAR(100),
    city VARCHAR(100),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    timezone VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES luno_users(user_id) ON DELETE CASCADE
);

-- Anomaly Detection Table
CREATE TABLE anomaly_detections (
    anomaly_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    transaction_id UUID,
    anomaly_type VARCHAR(50) NOT NULL CHECK (anomaly_type IN ('large_amount', 'rapid_transactions', 'location_change')),
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    description TEXT NOT NULL,
    detected_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'authorized', 'rejected', 'expired')),
    metadata JSONB, -- Additional data about the anomaly
    FOREIGN KEY (user_id) REFERENCES luno_users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (transaction_id) REFERENCES transaction_history(transaction_id) ON DELETE SET NULL
);

-- In-App Notifications Table
CREATE TABLE user_notifications (
    notification_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    notification_type VARCHAR(50) NOT NULL CHECK (notification_type IN ('anomaly', 'security', 'transaction', 'system')),
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    read_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB,
    FOREIGN KEY (user_id) REFERENCES luno_users(user_id) ON DELETE CASCADE
);

-- Email Alerts Table
CREATE TABLE email_alerts (
    alert_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    email VARCHAR(255) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    alert_type VARCHAR(50) NOT NULL CHECK (alert_type IN ('anomaly', 'security', 'transaction')),
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'failed')),
    metadata JSONB,
    FOREIGN KEY (user_id) REFERENCES luno_users(user_id) ON DELETE CASCADE
);

-- User Notification Settings Table
CREATE TABLE IF NOT EXISTS user_notification_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE NOT NULL,
    push_enabled BOOLEAN DEFAULT TRUE,
    inapp_enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES luno_users(user_id) ON DELETE CASCADE
);

-- Table for storing user face embeddings (encrypted)
CREATE TABLE IF NOT EXISTS user_face_embeddings (
    user_id UUID PRIMARY KEY REFERENCES luno_users(user_id) ON DELETE CASCADE,
    face_embeddings TEXT NOT NULL, -- AES-256 encrypted, base64 or hex
    last_trained TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    facial_login_enabled BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Audit log for face login attempts
CREATE TABLE IF NOT EXISTS face_login_audit (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES luno_users(user_id) ON DELETE CASCADE,
    attempt_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    success BOOLEAN,
    client_ip VARCHAR(64),
    user_agent TEXT,
    similarity_score FLOAT,
    notes TEXT
);
