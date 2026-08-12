/**
 * Create proper .env file with correct formatting
 */

import fs from 'fs';

const envContent = `PORT=3000
user="postgres"
host="localhost"
database="LunoWallet"
password="23PrimesFam"
port_db=5432

# Google Auth
GOOGLE_CLIENT_ID=545235311326-4sdvrp0afnl5i04l9degiflg5u5rmq9s.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=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

# PayStack
PAYSTACK_SECRET_KEY=sk_test_482317de7b4f507d3575b38a32e4adffb5b542b3

# nodemailer
EMAIL_USER="prime.lanto@gmail.com"
EMAIL_PASS="neht ggdd mesz xldz"

# Face Recognition Service
FACE_SECRET=supersecretkey1234567890123456
FACE_MICROSERVICE=http://localhost:5001

# Session Configuration
SESSION_SECRET=luno_session_secret_2024_development
`;

try {
    fs.writeFileSync('.env', envContent);
    console.log('✅ .env file created successfully with proper formatting!');
    console.log('🚀 Google OAuth is ready to test!');
} catch (error) {
    console.error('❌ Error creating .env file:', error.message);
}
