import fetch from 'node-fetch';

/**
 * Debug script to test the limits API endpoints
 */

const API_BASE = 'http://localhost:3000/api/limits';

async function debugLimitsAPI() {
    console.log('🔍 Debugging Limits API...\n');
    
    try {
        // Test if server is running
        console.log('1️⃣ Testing server connectivity...');
        const testResponse = await fetch('http://localhost:3000');
        console.log('Server status:', testResponse.status);
        console.log('✅ Server is running\n');
        
        // Test limits test endpoint
        console.log('2️⃣ Testing limits test endpoint...');
        try {
            const testLimitsResponse = await fetch(`${API_BASE}/test`);
            console.log('Test endpoint status:', testLimitsResponse.status);
            const testLimitsResult = await testLimitsResponse.text();
            console.log('Test endpoint response:', testLimitsResult);
        } catch (error) {
            console.log('❌ Test endpoint failed:', error.message);
        }
        console.log('');
        
        // Test suggestions endpoint
        console.log('3️⃣ Testing suggestions endpoint...');
        try {
            const suggestionsResponse = await fetch(`${API_BASE}/suggestions`);
            console.log('Suggestions endpoint status:', suggestionsResponse.status);
            const suggestionsResult = await suggestionsResponse.text();
            console.log('Suggestions endpoint response:', suggestionsResult);
        } catch (error) {
            console.log('❌ Suggestions endpoint failed:', error.message);
        }
        console.log('');
        
        // Test a DELETE request (this will fail without auth, but we can see the error)
        console.log('4️⃣ Testing DELETE endpoint (without auth)...');
        try {
            const deleteResponse = await fetch(`${API_BASE}/deposit`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    reason: 'Test disable'
                })
            });
            console.log('DELETE endpoint status:', deleteResponse.status);
            const deleteResult = await deleteResponse.text();
            console.log('DELETE endpoint response:', deleteResult);
        } catch (error) {
            console.log('❌ DELETE endpoint failed:', error.message);
        }
        
    } catch (error) {
        console.error('❌ Debug failed:', error);
    }
}

// Run the debug
debugLimitsAPI();

