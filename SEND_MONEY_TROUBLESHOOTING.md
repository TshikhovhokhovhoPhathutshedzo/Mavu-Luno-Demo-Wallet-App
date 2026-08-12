# Send Money Troubleshooting Guide

## Quick Debug Steps

### 1. Check Browser Console
1. Open your browser's Developer Tools (F12)
2. Go to the Console tab
3. Try to send money and look for any error messages
4. The debug script will automatically run and show you what's working/not working

### 2. Test Payment System
Visit this URL while logged in to test the payment system:
```
http://localhost:3000/api/payments/test
```

This will show you:
- If you're properly authenticated
- Your user information
- Your current balance
- If email is configured
- If database tables exist

### 3. Common Issues and Solutions

#### Issue: "User not authenticated" error
**Solution:**
- Make sure you're logged in
- Check if your session is still valid
- Try logging out and logging back in

#### Issue: "Failed to send verification email"
**Solution:**
- Check if EMAIL_USER and EMAIL_PASS are set in your .env file
- For development, the verification code will be shown in the server console
- Check the server console for the verification code

#### Issue: "Insufficient balance"
**Solution:**
- Make sure you have money in your account
- Check your current balance on the dashboard

#### Issue: "Receiver account number not found"
**Solution:**
- Make sure you're using a valid 9-digit account number
- The account number must belong to another user in the system

#### Issue: JavaScript errors in console
**Solution:**
- Check the browser console for specific error messages
- The debug script will help identify missing elements

### 4. Email Configuration

If you want to receive verification emails, add these to your `.env` file:

```env
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_app_password
```

**Note:** For Gmail, you need to use an "App Password" not your regular password.

### 5. Development Mode

In development mode:
- If email is not configured, verification codes will be shown in the server console
- Check the server console for codes like:
  ```
  📧 Verification Code: 123456
  📧 Payment Reference: PAY-123456789
  ```

### 6. Testing the Flow

1. **Login** to your account
2. **Click "Send Money"** button
3. **Enter a valid account number** (9 digits)
4. **Enter an amount** (less than your balance)
5. **Click "Send Verification Code"**
6. **Check server console** for verification code (if email not configured)
7. **Enter the verification code** in the form
8. **Click "Complete Payment"**

### 7. Server Console Monitoring

Watch the server console for these messages:
- ✅ Verification email sent successfully
- ⚠️ Email credentials not configured
- 📧 Verification Code: [code]
- 📧 Payment Reference: [reference]

### 8. Still Having Issues?

If you're still experiencing problems:

1. **Check the server logs** for any error messages
2. **Run the test script**: `node test-send-money.js`
3. **Check the debug endpoint**: Visit `/api/payments/test`
4. **Look at browser console** for JavaScript errors
5. **Verify you're logged in** and have sufficient balance

### 9. Database Tables Required

The following tables must exist:
- `payment_verification` - stores verification codes
- `payment_history` - stores payment records
- `transaction_movements` - stores balance changes
- `luno_users` - stores user information

Run `node test-send-money.js` to verify all tables exist.

### 10. Quick Fix Commands

```bash
# Test database setup
node test-send-money.js

# Check payment system (while logged in)
curl http://localhost:3000/api/payments/test

# Restart server
npm start
```

## Need More Help?

If you're still having issues, please provide:
1. The exact error message you're seeing
2. Screenshots of the browser console
3. The server console output
4. The result of `/api/payments/test` endpoint

