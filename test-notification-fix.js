#!/usr/bin/env node

/**
 * Test script to verify notification fixes
 * This script tests that notifications are only sent once per transaction
 */

import pool from './auth/db.js';
import NotificationService from './services/notificationService.js';

async function testNotificationDeduplication() {
  console.log('🧪 Testing notification deduplication...');
  
  const client = await pool.connect();
  
  try {
    // Test user ID (you may need to adjust this)
    const testUserId = 'test-user-id';
    
    // Create a test transaction
    const testTransaction = {
      transaction_id: 'test-tx-' + Date.now(),
      transaction_type: 'credit',
      amount: 10000, // 100.00 in cents
      history_amount: 10000,
      description: 'Test notification',
      payment_channel: 'internal',
      created_date: new Date().toISOString()
    };
    
    console.log('📝 Sending first notification...');
    const result1 = await NotificationService.sendTransactionNotification(testUserId, testTransaction);
    console.log('First notification result:', result1);
    
    console.log('📝 Attempting to send duplicate notification...');
    const result2 = await NotificationService.sendTransactionNotification(testUserId, testTransaction);
    console.log('Duplicate notification result:', result2);
    
    // Check how many notifications were actually created
    const notificationCount = await client.query(`
      SELECT COUNT(*) as count 
      FROM in_app_notifications 
      WHERE user_id = $1 AND data->>'transaction_id' = $2
    `, [testUserId, testTransaction.transaction_id]);
    
    console.log('📊 Total notifications created:', notificationCount.rows[0].count);
    
    if (notificationCount.rows[0].count === '1') {
      console.log('✅ SUCCESS: Duplicate notification was prevented!');
    } else {
      console.log('❌ FAILED: Duplicate notification was not prevented');
    }
    
    // Test unread notifications query
    console.log('📝 Testing unread notifications query...');
    const unreadNotifications = await NotificationService.getUserNotifications(testUserId, 10);
    console.log('Unread notifications count:', unreadNotifications.length);
    
    // Clean up test data
    await client.query(`
      DELETE FROM in_app_notifications 
      WHERE user_id = $1 AND data->>'transaction_id' = $2
    `, [testUserId, testTransaction.transaction_id]);
    
    console.log('🧹 Test data cleaned up');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    client.release();
  }
}

// Run the test
testNotificationDeduplication()
  .then(() => {
    console.log('🏁 Test completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Test failed:', error);
    process.exit(1);
  });
