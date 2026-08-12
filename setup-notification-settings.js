#!/usr/bin/env node

import pool from './auth/db.js';

async function setupNotificationSettings() {
  const client = await pool.connect();
  
  try {
    console.log('🔧 Setting up notification settings table...');
    
    // Create notification_settings table
    await client.query(`
      CREATE TABLE IF NOT EXISTS notification_settings (
        id SERIAL PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES luno_users(user_id) ON DELETE CASCADE,
        push_enabled BOOLEAN DEFAULT true,
        inapp_enabled BOOLEAN DEFAULT true,
        email_enabled BOOLEAN DEFAULT true,
        sms_enabled BOOLEAN DEFAULT false,
        transaction_notifications BOOLEAN DEFAULT true,
        security_notifications BOOLEAN DEFAULT true,
        marketing_notifications BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id)
      )
    `);
    
    console.log('✅ notification_settings table created/verified');
    
    // Create indexes for better performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_notification_settings_user_id 
      ON notification_settings(user_id)
    `);
    
    console.log('✅ Indexes created');
    
    // Insert default settings for existing users who don't have settings
    const result = await client.query(`
      INSERT INTO notification_settings (user_id, push_enabled, inapp_enabled, email_enabled, sms_enabled)
      SELECT 
        u.user_id,
        true as push_enabled,
        true as inapp_enabled,
        true as email_enabled,
        false as sms_enabled
      FROM luno_users u
      LEFT JOIN notification_settings ns ON u.user_id = ns.user_id
      WHERE ns.user_id IS NULL
    `);
    
    console.log(`✅ Default settings created for ${result.rowCount} users`);
    
    // Create trigger to update updated_at timestamp
    await client.query(`
      CREATE OR REPLACE FUNCTION update_notification_settings_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    
    await client.query(`
      DROP TRIGGER IF EXISTS trigger_update_notification_settings_updated_at ON notification_settings;
      CREATE TRIGGER trigger_update_notification_settings_updated_at
        BEFORE UPDATE ON notification_settings
        FOR EACH ROW
        EXECUTE FUNCTION update_notification_settings_updated_at()
    `);
    
    console.log('✅ Triggers created');
    
    console.log('🎉 Notification settings setup completed successfully!');
    
  } catch (error) {
    console.error('❌ Error setting up notification settings:', error);
  } finally {
    client.release();
  }
}

setupNotificationSettings();
