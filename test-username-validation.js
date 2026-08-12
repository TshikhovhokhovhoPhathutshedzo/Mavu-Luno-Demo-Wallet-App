#!/usr/bin/env node

import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3000';

async function testUsernameValidation() {
  console.log('🧪 Testing Username Validation');
  console.log('==============================');
  console.log('');

  try {
    // Test 1: Check if server is running
    console.log('1. Testing server connection...');
    const healthResponse = await fetch(`${BASE_URL}/api/test`);
    if (healthResponse.ok) {
      console.log('✅ Server is running');
    } else {
      console.log('❌ Server is not responding');
      return;
    }

    // Test 2: Test username validation endpoint (without auth - should fail)
    console.log('\n2. Testing username validation endpoint...');
    try {
      const usernameResponse = await fetch(`${BASE_URL}/api/check-username?username=testuser`);
      const usernameData = await usernameResponse.json();
      console.log('Username check response:', usernameData);
    } catch (error) {
      console.log('❌ Username validation failed:', error.message);
    }

    // Test 3: Test with a sample username
    console.log('\n3. Testing with sample username...');
    const testUsername = 'testuser123';
    try {
      const response = await fetch(`${BASE_URL}/api/check-username?username=${encodeURIComponent(testUsername)}`);
      const data = await response.json();
      console.log(`Username "${testUsername}" check result:`, data);
    } catch (error) {
      console.log('❌ Username check failed:', error.message);
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
testUsernameValidation();
