import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🚀 LunoBackend Startup Script');
console.log('=============================\n');

// Check if .env file exists
const envPath = path.join(__dirname, '.env');
if (!fs.existsSync(envPath)) {
    console.log('❌ .env file not found!');
    console.log('📝 Please create a .env file with the following variables:');
    console.log(`
# Database Configuration
user=your_db_user
host=localhost
database=luno_backend
password=your_db_password
port_db=5432

# Server Configuration
PORT=3000
NODE_ENV=development
SESSION_SECRET=your-super-secret-session-key-change-in-production

# Paystack Configuration
PAYSTACK_SECRET_KEY=your_paystack_secret_key
PAYSTACK_PUBLIC_KEY=your_paystack_public_key

# Email Configuration (Gmail)
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_app_password

# Google OAuth Configuration
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Face Recognition Service
FACE_SECRET=supersecretkey1234567890123456
FACE_MICROSERVICE=http://localhost:5001
    `);
    process.exit(1);
}

console.log('✅ .env file found');

// Check if node_modules exists
const nodeModulesPath = path.join(__dirname, 'node_modules');
if (!fs.existsSync(nodeModulesPath)) {
    console.log('📦 Installing dependencies...');
    const { execSync } = await import('child_process');
    try {
        execSync('npm install', { stdio: 'inherit' });
        console.log('✅ Dependencies installed successfully');
    } catch (error) {
        console.log('❌ Failed to install dependencies');
        process.exit(1);
    }
} else {
    console.log('✅ Dependencies already installed');
}

// Check if face_microservice directory exists
const faceMicroservicePath = path.join(__dirname, 'face_microservice');
if (!fs.existsSync(faceMicroservicePath)) {
    console.log('❌ face_microservice directory not found!');
    console.log('Please ensure the face recognition microservice is properly set up.');
    process.exit(1);
}

console.log('✅ Face microservice directory found');

// Check if face_microservice/requirements.txt exists
const requirementsPath = path.join(faceMicroservicePath, 'requirements.txt');
if (!fs.existsSync(requirementsPath)) {
    console.log('❌ face_microservice/requirements.txt not found!');
    process.exit(1);
}

console.log('✅ Face microservice requirements found');

console.log('\n🎯 Setup Steps:');
console.log('1. Ensure PostgreSQL is running');
console.log('2. Create database: luno_backend');
console.log('3. Run: npm run setup (to create database tables)');
console.log('4. Run: npm test (to verify everything is working)');
console.log('5. Run: npm start (to start the application)');
console.log('\n📚 For detailed setup instructions, see README.md');

console.log('\n✅ Startup check completed successfully!');
