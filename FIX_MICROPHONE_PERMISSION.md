# 🔒 Fix "not-allowed" Error - Microphone Permission Guide

## 🚨 **The "not-allowed" Error Explained**

The "not-allowed" error occurs when your browser blocks microphone access for speech recognition. This is a security feature to protect your privacy.

## 🛠️ **Quick Fix Steps**

### **Step 1: Check Browser Address Bar**
1. Look for a microphone icon (🎤) in your browser's address bar
2. Click on it
3. Select "Allow" or "Always allow"
4. Refresh the page

### **Step 2: Browser-Specific Instructions**

#### **Chrome:**
1. Click the lock icon (🔒) in the address bar
2. Find "Microphone" in the permissions list
3. Change from "Block" to "Allow"
4. Refresh the page

#### **Firefox:**
1. Click the shield icon in the address bar
2. Click "Permissions"
3. Find "Use the Microphone"
4. Change to "Allow"
5. Refresh the page

#### **Safari:**
1. Go to Safari > Preferences > Websites
2. Find "Microphone" in the left sidebar
3. Set your site to "Allow"
4. Refresh the page

#### **Edge:**
1. Click the lock icon in the address bar
2. Find "Microphone" permissions
3. Change to "Allow"
4. Refresh the page

### **Step 3: System-Level Permissions**

#### **Windows:**
1. Go to Settings > Privacy > Microphone
2. Make sure "Allow apps to access your microphone" is ON
3. Check that your browser is allowed

#### **Mac:**
1. Go to System Preferences > Security & Privacy > Privacy
2. Select "Microphone" from the left sidebar
3. Check the box next to your browser

#### **Linux:**
1. Check your browser's microphone permissions
2. Ensure your user is in the audio group: `sudo usermod -a -G audio $USER`

## 🔧 **Advanced Troubleshooting**

### **If Still Not Working:**

#### **1. Try HTTPS**
- Speech recognition requires HTTPS or localhost
- Make sure you're accessing via `http://localhost:3000` or `https://yourdomain.com`

#### **2. Check Browser Version**
- Ensure you're using a modern browser (Chrome 25+, Firefox 44+, Safari 14.1+)
- Update your browser if needed

#### **3. Clear Browser Data**
- Clear cookies and site data for your localhost
- Try incognito/private mode

#### **4. Check Microphone Hardware**
- Test your microphone in other applications
- Make sure it's not being used by another app

#### **5. Browser Flags (Chrome)**
- Go to `chrome://flags/`
- Search for "Web Speech API"
- Make sure it's enabled

## 🎯 **Test Your Fix**

After following the steps above:

1. **Refresh the page** completely (Ctrl+F5 or Cmd+Shift+R)
2. **Click "Listen"** button
3. **Look for the microphone permission prompt**
4. **Click "Allow"** when prompted
5. **Try speaking** a command like "What's my balance?"

## 🚨 **Common Issues & Solutions**

### **Issue: No microphone icon appears**
**Solution:** 
- Refresh the page
- Try a different browser
- Check if you're on HTTPS or localhost

### **Issue: Permission granted but still not working**
**Solution:**
- Check if another app is using the microphone
- Restart your browser
- Try incognito mode

### **Issue: "Microphone not found" error**
**Solution:**
- Check microphone hardware
- Test in other applications
- Update audio drivers

### **Issue: Works in one browser but not another**
**Solution:**
- Different browsers have different permission systems
- Use the browser that works
- Or configure permissions for each browser

## 🎤 **Alternative Testing Method**

If microphone permissions are still problematic, you can test the voice assistant using the standalone HTML file:

1. Open `test-voice-button.html` in your browser
2. This bypasses some permission restrictions
3. Use it to test the voice functionality

## ✅ **Success Indicators**

You'll know the fix worked when:
- ✅ No "not-allowed" error appears
- ✅ Status shows "Listening..." when you click Listen
- ✅ Button changes to "Stop Listening" when active
- ✅ You can speak and get responses

## 🆘 **Still Having Issues?**

If you're still getting the "not-allowed" error:

1. **Check the browser console** (F12) for detailed error messages
2. **Try a different browser** to isolate the issue
3. **Test on a different device** to see if it's device-specific
4. **Check your antivirus software** - some block microphone access

## 🎉 **Once Fixed**

After successfully granting microphone permission:
- The voice assistant will work perfectly
- You can use all voice commands
- The system will remember your permission choice
- You won't need to grant permission again (unless you clear browser data)

**Your voice assistant should now work without the "not-allowed" error! 🎤✨**
