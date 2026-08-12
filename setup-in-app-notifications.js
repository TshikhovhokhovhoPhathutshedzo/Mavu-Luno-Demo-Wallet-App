#!/usr/bin/env node

import pool from './auth/db.js';

async function setupInAppNotifications() {
  const client = await pool.connect();
  
  try {
    console.log('🔧 Setting up in-app notifications table...');
    
    // Create in_app_notifications table
    await client.query(`
      CREATE TABLE IF NOT EXISTS in_app_notifications (
        id SERIAL PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES luno_users(user_id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        type VARCHAR(50) DEFAULT 'info',
        data JSONB,
        read_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    console.log('✅ in_app_notifications table created/verified');
    
    // Create indexes for better performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_in_app_notifications_user_id 
      ON in_app_notifications(user_id)
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_in_app_notifications_created_at 
      ON in_app_notifications(created_at DESC)
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_in_app_notifications_read_at 
      ON in_app_notifications(read_at)
    `);
    
    console.log('✅ Indexes created');
    
    console.log('🎉 In-app notifications setup completed successfully!');
    
  } catch (error) {
    console.error('❌ Error setting up in-app notifications:', error);
  } finally {
    client.release();
  }
}

setupInAppNotifications();
