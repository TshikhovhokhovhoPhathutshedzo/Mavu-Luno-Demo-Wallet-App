// import packages
import express from "express";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import session from "express-session";
import passport from "passport";
import flash from "connect-flash";
import path from "path";

// import internal files
import pool from "./auth/db.js";
import homeRoutes from "./routes/homeRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import apiRoutes from "./routes/apiRoutes.js";
import publicApiRoutes from "./routes/publicApiRoutes.js";
import initializePassport from "./auth/passport.js";
import transRoutes from "./routes/transRoutes.js";
import locationRoutes from "./routes/locationRoutes.js";
import biometricRoutes from "./routes/biometricRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import passwordResetRoutes from "./routes/passwordResetRoutes.js";
import deepFaceAuthRoutes from "./routes/deepFaceAuthRoutes.js";
import { faceAuthSessionSecurity } from "./middlewares/faceAuthSecurity.js";
import limitsRoutes from "./routes/limitsRoutes.js";
import billsRoutes from "./routes/billsRoutes.js";
import aiRoutes from "./routes/aiRoutes.js";
import livekitRoutes from "./routes/livekitRoutes.js";
import voiceAiRoutes from "./routes/voiceAiRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import budgetRoutes from "./routes/budgetRoutes.js";
import qrRoutes from "./routes/qrRoutes.js";
import { securityHeaders } from "./middlewares/securityHeaders.js";
import { globalErrorHandler, notFoundHandler, gracefulShutdown } from "./middlewares/errorHandler.js";
import MicroserviceManager from "./services/microserviceManager.js";

// config the environment variables
dotenv.config();

// Validate required environment variables
const requiredEnvVars = [
    'user', 'host', 'database', 'password', 'port_db',
    'SESSION_SECRET', 'EMAIL_USER', 'EMAIL_PASS'
];

const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
    console.error('❌ Missing required environment variables:', missingEnvVars.join(', '));
    console.error('Please check your .env file and ensure all required variables are set.');
    process.exit(1);
}

// constants
const port = process.env.PORT || 3000;
const app = express();

// Initialize microservice manager
const microserviceManager = new MicroserviceManager();

//
app.set("view engine", "ejs");
app.use(express.static(path.join(process.cwd(), "public")));
app.use(bodyParser.urlencoded({ limit: '20mb', extended: true }));
app.use(express.json({ limit: '20mb' }));

// Handle favicon requests
app.get('/favicon.ico', (req, res) => {
    res.status(204).end(); // No content response for favicon
});

// Handle apple-touch-icon requests (iOS devices)
app.get('/apple-touch-icon.png', (req, res) => {
    res.status(204).end(); // No content response for apple touch icon
});

app.get('/apple-touch-icon-precomposed.png', (req, res) => {
    res.status(204).end(); // No content response for apple touch icon
});

app.get('/apple-touch-icon-120x120.png', (req, res) => {
    res.status(204).end(); // No content response for apple touch icon
});

app.get('/apple-touch-icon-120x120-precomposed.png', (req, res) => {
    res.status(204).end(); // No content response for apple touch icon
});

// Security headers
app.use(securityHeaders);

// sessions
app.use(session({
  secret: process.env.SESSION_SECRET || (() => {
    console.warn('⚠️  WARNING: Using fallback session secret. Set SESSION_SECRET in .env for production!');
    return 'fallback-session-secret-change-in-production-' + Date.now();
  })(),
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production', // true in production
    sameSite: "lax",
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));
// built in middlewares
app.use(passport.initialize());
app.use(passport.session());

// passing messages between redirects
app.use(flash());

// Initialize passport
initializePassport(passport);

// Add face authentication session security
app.use(faceAuthSessionSecurity);

// connect database and run migrations
pool.connect().then(async ()=>{
    console.log("database connected successful");
    
    // Run database migrations
    try {
        const client = await pool.connect();
        
        // Add account_number column
        await client.query(`
            ALTER TABLE luno_users 
            ADD COLUMN IF NOT EXISTS account_number VARCHAR(9) UNIQUE
        `);
        console.log("✅ Added account_number column");
        
        // Create payment_history table
        await client.query(`
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
            )
        `);
        console.log("✅ Created payment_history table");

        // Create payment_verification table for email verification codes
        await client.query(`
            CREATE TABLE IF NOT EXISTS payment_verification (
                verification_id SERIAL PRIMARY KEY,
                payment_reference VARCHAR(50) UNIQUE NOT NULL,
                sender_id UUID NOT NULL REFERENCES luno_users(user_id),
                receiver_account_number VARCHAR(9) NOT NULL,
                amount DECIMAL(15,2) NOT NULL,
                description TEXT,
                verification_code VARCHAR(6) NOT NULL,
                expires_at TIMESTAMP NOT NULL,
                verified BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log("✅ Created payment_verification table");
        
        // Generate account numbers for existing users
        await client.query(`
            UPDATE luno_users 
            SET account_number = LPAD(FLOOR(RANDOM() * 1000000000)::TEXT, 9, '0')
            WHERE account_number IS NULL
        `);
        console.log("✅ Generated account numbers for existing users");
        
        // Create bills_history table
        await client.query(`
            CREATE TABLE IF NOT EXISTS bills_history (
                bill_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID NOT NULL REFERENCES luno_users(user_id) ON DELETE CASCADE,
                bill_type VARCHAR(20) NOT NULL CHECK (bill_type IN ('electricity', 'airtime', 'water')),
                amount_paid INTEGER NOT NULL,
                meter_number VARCHAR(20),
                phone_number VARCHAR(20),
                recharge_code VARCHAR(20),
                transaction_id UUID REFERENCES transactions(transaction_id) ON DELETE CASCADE,
                payment_status VARCHAR(20) DEFAULT 'completed' CHECK (payment_status IN ('pending', 'completed', 'failed')),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log("✅ Created bills_history table");
        
        // Create indexes for bills_history
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_bills_history_user_id ON bills_history(user_id);
            CREATE INDEX IF NOT EXISTS idx_bills_history_bill_type ON bills_history(bill_type);
            CREATE INDEX IF NOT EXISTS idx_bills_history_created_at ON bills_history(created_at);
        `);
        console.log("✅ Created bills_history indexes");
        
        // Create function to update the updated_at timestamp
        await client.query(`
            CREATE OR REPLACE FUNCTION update_bills_history_updated_at()
            RETURNS TRIGGER AS $$
            BEGIN
                NEW.updated_at = CURRENT_TIMESTAMP;
                RETURN NEW;
            END;
            $$ language 'plpgsql';
        `);
        console.log("✅ Created update_bills_history_updated_at function");
        
        // Create trigger to automatically update the updated_at column
        await client.query(`
            DROP TRIGGER IF EXISTS update_bills_history_updated_at ON bills_history;
            CREATE TRIGGER update_bills_history_updated_at
                BEFORE UPDATE ON bills_history
                FOR EACH ROW
                EXECUTE FUNCTION update_bills_history_updated_at();
        `);
        console.log("✅ Created bills_history updated_at trigger");
        
        // Setup QR codes system
        console.log("🔗 Setting up QR codes system...");
        
        // Create user_qr_codes table
        await client.query(`
            CREATE TABLE IF NOT EXISTS user_qr_codes (
                qr_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID NOT NULL REFERENCES luno_users(user_id) ON DELETE CASCADE,
                qr_identifier VARCHAR(255) NOT NULL,
                encrypted_data TEXT NOT NULL,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(user_id)
            );
        `);
        console.log("✅ Created user_qr_codes table");
        
        // Create indexes for QR codes
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_user_qr_codes_user_id ON user_qr_codes(user_id);
            CREATE INDEX IF NOT EXISTS idx_user_qr_codes_active ON user_qr_codes(is_active);
            CREATE INDEX IF NOT EXISTS idx_user_qr_codes_identifier ON user_qr_codes(qr_identifier);
        `);
        console.log("✅ Created QR codes indexes");
        
        // Create function to update QR codes updated_at timestamp
        await client.query(`
            CREATE OR REPLACE FUNCTION update_qr_codes_updated_at()
            RETURNS TRIGGER AS $$
            BEGIN
                NEW.updated_at = NOW();
                RETURN NEW;
            END;
            $$ language 'plpgsql';
        `);
        console.log("✅ Created update_qr_codes_updated_at function");
        
        // Create trigger for QR codes updated_at
        await client.query(`
            DROP TRIGGER IF EXISTS qr_codes_updated_at ON user_qr_codes;
            CREATE TRIGGER qr_codes_updated_at
                BEFORE UPDATE ON user_qr_codes
                FOR EACH ROW
                EXECUTE FUNCTION update_qr_codes_updated_at();
        `);
        console.log("✅ Created qr_codes_updated_at trigger");
        
        client.release();
        console.log("✅ Database migrations completed");
        
    } catch (error) {
        console.error("Migration error:", error.message);
    }
    
}).catch((err) => {
    console.error("Error connecting database", err);
    process.exit(1); // Exit if database connection fails
})

app.use("/", passwordResetRoutes);
app.use("/ai", aiRoutes);
app.use("/api/livekit", livekitRoutes);
app.use("/api/voice-ai", voiceAiRoutes);
app.use("/", homeRoutes);
app.use("/authorized", authRoutes);
app.use("/deepface-auth", deepFaceAuthRoutes);
app.use("/api", publicApiRoutes); // Public API routes (no auth required)
app.use("/api", apiRoutes);
app.use("/api", transRoutes);
app.use("/api", locationRoutes);
app.use("/api/biometrics", biometricRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/limits", limitsRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/bills", billsRoutes);
app.use("/budget", budgetRoutes);
app.use("/qr", qrRoutes);

// Microservice status endpoint
app.get("/api/microservice/status", (req, res) => {
    const status = microserviceManager.getStatus();
    res.json({
        success: true,
        microservice: status
    });
});

// 404 handler - must be before error handler
app.use(notFoundHandler);

// Global error handler - must be last
app.use(globalErrorHandler);

// Start server with port conflict handling
const server = app.listen(port, async ()=> {
    console.log(`🚀 Server running on port: ${port}`);
    console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔒 Security headers enabled`);
    console.log(`✅ Input validation enabled`);
    
    // Clean up expired payment verifications on startup
    try {
        const { cleanupExpiredVerifications } = await import('./controllers/paymentController.js');
        const cleanedCount = await cleanupExpiredVerifications();
        if (cleanedCount > 0) {
            console.log(`🧹 Cleaned up ${cleanedCount} expired payment verifications on startup`);
        }
    } catch (error) {
        console.error('❌ Failed to cleanup expired verifications:', error.message);
    }
    
    // Start the face recognition microservice
    try {
        await microserviceManager.startMicroservice();
    } catch (error) {
        console.error('❌ Failed to start microservice:', error.message);
    }
});

// Graceful shutdown
const shutdownHandler = async (signal) => {
    console.log(`\n${signal} received. Shutting down gracefully...`);
    
    // Stop the microservice first
    try {
        await microserviceManager.stopMicroservice();
    } catch (error) {
        console.error('❌ Error stopping microservice:', error.message);
    }
    
    // Then stop the main server
    gracefulShutdown(server)(signal);
};

// Handle server startup errors
server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`❌ Port ${port} is already in use. Please try one of these solutions:`);
        console.error('   1. Kill the process using the port:');
        console.error(`      netstat -ano | findstr :${port}`);
        console.error(`      taskkill /PID <PID> /F`);
        console.error('   2. Use a different port:');
        console.error(`      PORT=3001 npm start`);
        console.error('   3. Wait a few seconds and try again');
        process.exit(1);
    } else {
        console.error('❌ Server startup error:', err.message);
        process.exit(1);
    }
});

process.on('SIGTERM', shutdownHandler);
process.on('SIGINT', shutdownHandler);