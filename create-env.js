/**
 * Create .env file with Google OAuth placeholders
 */

import fs from 'fs';

const envContent = `# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=luno_backend
DB_USER=postgres
DB_PASSWORD=password

# Session Configuration
SESSION_SECRET=luno_session_secret_2024_development

# Google OAuth Configuration
# Get these from: https://console.cloud.google.com/
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here

# Face Recognition (Optional)
FACE_SECRET=luno_face_secret_2024

# Email Configuration (Optional)
EMAIL_USER=your_email@example.com
EMAIL_PASS=your_email_password

# Server Configuration
PORT=3000
NODE_ENV=development
`;

try {
    fs.writeFileSync('.env', envContent);
    console.log('✅ .env file created successfully!');
    console.log('📝 Please update the Google OAuth credentials:');
    console.log('   1. Go to: https://console.cloud.google.com/');
    console.log('   2. Create OAuth 2.0 credentials');
    console.log('   3. Update GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env');
    console.log('   4. Set redirect URI to: http://localhost:3000/authorized/google/callback');
} catch (error) {
    console.error('❌ Error creating .env file:', error.message);
}
