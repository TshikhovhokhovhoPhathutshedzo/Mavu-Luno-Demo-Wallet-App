# Google OAuth Setup Guide

## 🚀 Complete Google OAuth Implementation

The Google OAuth login is already implemented in the codebase! You just need to set up the Google OAuth credentials.

### 📋 What's Already Implemented

✅ **Passport.js Google Strategy** - Configured in `auth/passport.js`
✅ **Google OAuth Routes** - `/authorized/google` and `/authorized/google/callback`
✅ **User Registration** - Automatically creates accounts for new Google users
✅ **Account Number Generation** - Generates unique 9-digit account numbers
✅ **Session Management** - Proper login/logout handling
✅ **Database Integration** - Stores Google users in the database

### 🔧 Setup Steps

#### 1. Create Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable the Google+ API
4. Go to "Credentials" → "Create Credentials" → "OAuth 2.0 Client IDs"
5. Set up OAuth consent screen
6. Create credentials with these settings:
   - **Application type**: Web application
   - **Authorized redirect URIs**: `http://localhost:3000/authorized/google/callback`

#### 2. Set Up Environment Variables

Create a `.env` file in the root directory with:

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=luno_backend
DB_USER=your_db_user
DB_PASSWORD=your_db_password

# Session Configuration
SESSION_SECRET=your_session_secret_here

# Google OAuth Configuration
GOOGLE_CLIENT_ID=your_google_client_id_from_console
GOOGLE_CLIENT_SECRET=your_google_client_secret_from_console

# Face Recognition (Optional)
FACE_SECRET=your_face_secret_here

# Email Configuration (Optional)
EMAIL_USER=your_email@example.com
EMAIL_PASS=your_email_password

# Server Configuration
PORT=3000
NODE_ENV=development
```

#### 3. Install Dependencies (Already Done)

The required packages are already installed:
- `passport`
- `passport-google-oauth2`
- `passport-local`

### 🎯 How It Works

1. **User clicks "Sign in with Google"** on login page
2. **Redirects to Google OAuth** (`/authorized/google`)
3. **User authorizes the app** on Google's page
4. **Google redirects back** to `/authorized/google/callback`
5. **App checks if user exists** in database
6. **If new user**: Creates account with Google profile data
7. **If existing user**: Logs them in
8. **Redirects to dashboard** (`/`)

### 🔍 Code Locations

- **Routes**: `routes/authRoutes.js` (lines 26-27)
- **Controller**: `controllers/authControllers.js` (lines 104-112)
- **Passport Config**: `auth/passport.js` (lines 63-128)
- **Login Page**: `views/login.ejs` (lines 36-41)

### 🚀 Testing

1. **Start the server**: `npm start`
2. **Go to**: `http://localhost:3000/authorized/login`
3. **Click**: "Sign in with Google" button
4. **Complete**: Google OAuth flow
5. **Should redirect**: To dashboard after successful login

### 🎨 UI Features

- **Modern Google button** with Bootstrap icon
- **Responsive design** that works on all devices
- **Error handling** for failed authentication
- **Automatic account creation** for new users
- **Seamless integration** with existing login system

### 🔒 Security Features

- **OAuth 2.0** secure authentication
- **Session management** with Passport.js
- **Database validation** for existing users
- **Account number generation** for new users
- **Error handling** for edge cases

### 🎉 Result

Once set up, users can:
- ✅ **Sign in with Google** seamlessly
- ✅ **Create accounts automatically** if new
- ✅ **Access all app features** after login
- ✅ **Use existing account** if already registered
- ✅ **Get unique account numbers** for transactions

The Google OAuth is **fully functional** and ready to use! 🚀
