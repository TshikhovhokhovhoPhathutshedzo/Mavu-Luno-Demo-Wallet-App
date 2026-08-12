// Debug script for send money functionality
console.log('🔍 Debugging Send Money Issues');
console.log('================================\n');

// Check if user is logged in
function checkAuthentication() {
    console.log('1. Checking authentication...');
    
    // Check if user data is available
    const userData = document.querySelector('[data-user-id]');
    if (userData) {
        console.log('✅ User appears to be logged in');
        console.log('   User ID:', userData.dataset.userId);
    } else {
        console.log('❌ User data not found - might not be logged in');
    }
}

// Check form elements
function checkFormElements() {
    console.log('\n2. Checking form elements...');
    
    const sendMoneyForm = document.getElementById('send-money-form');
    const receiverAccount = document.getElementById('receiver-account');
    const sendAmount = document.getElementById('send-amount');
    const sendMoneyModal = document.getElementById('sendMoneyModal');
    const openSendMoneyBtn = document.getElementById('open-send-money');
    
    if (sendMoneyForm) console.log('✅ Send money form found');
    else console.log('❌ Send money form not found');
    
    if (receiverAccount) console.log('✅ Receiver account input found');
    else console.log('❌ Receiver account input not found');
    
    if (sendAmount) console.log('✅ Send amount input found');
    else console.log('❌ Send amount input not found');
    
    if (sendMoneyModal) console.log('✅ Send money modal found');
    else console.log('❌ Send money modal not found');
    
    if (openSendMoneyBtn) console.log('✅ Open send money button found');
    else console.log('❌ Open send money button not found');
}

// Check for JavaScript errors
function checkForErrors() {
    console.log('\n3. Checking for JavaScript errors...');
    
    // Listen for any unhandled errors
    window.addEventListener('error', function(e) {
        console.log('❌ JavaScript Error:', e.message);
        console.log('   File:', e.filename);
        console.log('   Line:', e.lineno);
    });
    
    // Listen for unhandled promise rejections
    window.addEventListener('unhandledrejection', function(e) {
        console.log('❌ Unhandled Promise Rejection:', e.reason);
    });
}

// Test form submission
function testFormSubmission() {
    console.log('\n4. Testing form submission...');
    
    const sendMoneyForm = document.getElementById('send-money-form');
    if (!sendMoneyForm) {
        console.log('❌ Cannot test - form not found');
        return;
    }
    
    // Add test event listener
    sendMoneyForm.addEventListener('submit', function(e) {
        console.log('✅ Form submission event triggered');
        console.log('   Form data:', new FormData(sendMoneyForm));
    });
    
    console.log('✅ Form submission listener added');
}

// Check network requests
function checkNetworkRequests() {
    console.log('\n5. Monitoring network requests...');
    
    // Override fetch to log requests
    const originalFetch = window.fetch;
    window.fetch = function(...args) {
        console.log('🌐 Fetch request:', args[0]);
        console.log('   Method:', args[1]?.method || 'GET');
        console.log('   Body:', args[1]?.body);
        
        return originalFetch.apply(this, args).then(response => {
            console.log('✅ Response status:', response.status);
            return response;
        }).catch(error => {
            console.log('❌ Fetch error:', error);
            throw error;
        });
    };
    
    console.log('✅ Network monitoring enabled');
}

// Run all checks
function runDebugChecks() {
    console.log('🚀 Starting debug checks...\n');
    
    checkAuthentication();
    checkFormElements();
    checkForErrors();
    testFormSubmission();
    checkNetworkRequests();
    
    console.log('\n📋 Debug Summary:');
    console.log('==================');
    console.log('1. Check the console for any ❌ errors above');
    console.log('2. Try clicking the "Send Money" button');
    console.log('3. Watch for network requests in the console');
    console.log('4. Check if any error messages appear');
    console.log('\n💡 Common Issues:');
    console.log('- User not logged in (check authentication)');
    console.log('- Email not configured (check EMAIL_USER/EMAIL_PASS)');
    console.log('- JavaScript errors (check console)');
    console.log('- Network errors (check fetch requests)');
}

// Auto-run when page loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runDebugChecks);
} else {
    runDebugChecks();
}

// Make function globally available
window.debugSendMoney = runDebugChecks;

