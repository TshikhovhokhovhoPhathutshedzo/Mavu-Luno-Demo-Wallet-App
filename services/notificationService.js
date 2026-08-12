import pool from '../auth/db.js';

class NotificationService {
  // Get user's notification preferences
  static async getUserNotificationSettings(userId) {
    const client = await pool.connect();
    try {
      const result = await client.query(`
        SELECT push_enabled, inapp_enabled, email_enabled, sms_enabled
        FROM notification_settings 
        WHERE user_id = $1
      `, [userId]);
      
      if (result.rows.length === 0) {
        // Return default settings if none exist
        return {
          push_enabled: true,
          inapp_enabled: true,
          email_enabled: true,
          sms_enabled: false
        };
      }
      
      return result.rows[0];
    } catch (error) {
      console.error('Error getting user notification settings:', error);
      return {
        push_enabled: true,
        inapp_enabled: true,
        email_enabled: true,
        sms_enabled: false
      };
    } finally {
      client.release();
    }
  }

  // Send in-app notification
  static async sendInAppNotification(userId, notification) {
    const client = await pool.connect();
    try {
      const settings = await this.getUserNotificationSettings(userId);
      
      if (!settings.inapp_enabled) {
        console.log('In-app notifications disabled for user:', userId);
        return false;
      }

      // Store notification in database
      await client.query(`
        INSERT INTO in_app_notifications (user_id, title, message, type, data, created_at)
        VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
      `, [
        userId,
        notification.title,
        notification.message,
        notification.type || 'info',
        JSON.stringify(notification.data || {})
      ]);

      console.log('✅ In-app notification sent to user:', userId);
      return true;
    } catch (error) {
      console.error('Error sending in-app notification:', error);
      return false;
    } finally {
      client.release();
    }
  }

  // Send transaction notification
  static async sendTransactionNotification(userId, transaction) {
    const client = await pool.connect();
    try {
      const settings = await this.getUserNotificationSettings(userId);
      
      if (!settings.inapp_enabled) {
        return false;
      }

      // Check if notification already exists for this transaction
      const existingNotification = await client.query(`
        SELECT id FROM in_app_notifications 
        WHERE user_id = $1 AND data->>'transaction_id' = $2
      `, [userId, transaction.transaction_id.toString()]);

      if (existingNotification.rows.length > 0) {
        console.log('⚠️ Notification already exists for transaction:', transaction.transaction_id, 'for user:', userId);
        return false; // Don't send duplicate notification
      }

      const isCredit = transaction.transaction_type === 'credit';
      const amount = parseFloat(transaction.amount || transaction.history_amount || 0) / 100; // Convert from cents
      const formattedAmount = `R${amount.toFixed(2)}`;
      
      // Extract username from description for cleaner display
      let username = 'Unknown';
      if (transaction.description) {
        if (transaction.description.includes('Payment to ')) {
          username = transaction.description.replace('Payment to ', '');
        } else if (transaction.description.includes('Payment from ')) {
          username = transaction.description.replace('Payment from ', '');
        } else {
          username = transaction.description;
        }
      }

      const notification = {
        title: isCredit ? '💰 Money Received' : '💸 Money Sent',
        message: isCredit 
          ? `You received ${formattedAmount} from ${username}`
          : `You sent ${formattedAmount} to ${username}`,
        type: isCredit ? 'success' : 'info',
        data: {
          transaction_id: transaction.transaction_id,
          amount: formattedAmount,
          type: transaction.transaction_type,
          channel: transaction.payment_channel,
          timestamp: transaction.created_date || new Date().toISOString()
        }
      };

      // Additional check: prevent duplicate notifications for the same transaction
      const duplicateCheck = await client.query(`
        SELECT id FROM in_app_notifications 
        WHERE user_id = $1 
        AND data->>'transaction_id' = $2
        AND created_at > NOW() - INTERVAL '1 hour'
      `, [userId, transaction.transaction_id]);

      if (duplicateCheck.rows.length > 0) {
        console.log('⚠️ Duplicate notification prevented for transaction:', transaction.transaction_id);
        return false; // Don't send duplicate notification
      }

      // Store notification in database with transaction_id check
      await client.query(`
        INSERT INTO in_app_notifications (user_id, title, message, type, data, created_at)
        VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
      `, [
        userId,
        notification.title,
        notification.message,
        notification.type || 'info',
        JSON.stringify(notification.data || {})
      ]);

      console.log('✅ Transaction notification sent to user:', userId, 'for transaction:', transaction.transaction_id);
      return true;
    } catch (error) {
      console.error('Error sending transaction notification:', error);
      return false;
    } finally {
      client.release();
    }
  }

  // Get user's unread notifications
  static async getUserNotifications(userId, limit = 10) {
    const client = await pool.connect();
    try {
      const result = await client.query(`
        SELECT id, title, message, type, data, created_at, read_at
        FROM in_app_notifications 
        WHERE user_id = $1 AND read_at IS NULL
        ORDER BY created_at DESC 
        LIMIT $2
      `, [userId, limit]);
      
      return result.rows;
    } catch (error) {
      console.error('Error getting user notifications:', error);
      return [];
    } finally {
      client.release();
    }
  }

  // Mark notification as read
  static async markNotificationAsRead(userId, notificationId) {
    const client = await pool.connect();
    try {
      await client.query(`
        UPDATE in_app_notifications 
        SET read_at = CURRENT_TIMESTAMP 
        WHERE id = $1 AND user_id = $2
      `, [notificationId, userId]);
      
      return true;
    } catch (error) {
      console.error('Error marking notification as read:', error);
      return false;
    } finally {
      client.release();
    }
  }

  // Get unread notification count
  static async getUnreadCount(userId) {
    const client = await pool.connect();
    try {
      const result = await client.query(`
        SELECT COUNT(*) as count
        FROM in_app_notifications 
        WHERE user_id = $1 AND read_at IS NULL
      `, [userId]);
      
      return parseInt(result.rows[0].count);
    } catch (error) {
      console.error('Error getting unread count:', error);
      return 0;
    } finally {
      client.release();
    }
  }

  // Get all notifications (including read ones) for history
  static async getAllUserNotifications(userId, limit = 20) {
    const client = await pool.connect();
    try {
      const result = await client.query(`
        SELECT id, title, message, type, data, created_at, read_at
        FROM in_app_notifications 
        WHERE user_id = $1 
        ORDER BY created_at DESC 
        LIMIT $2
      `, [userId, limit]);
      
      return result.rows;
    } catch (error) {
      console.error('Error getting all user notifications:', error);
      return [];
    } finally {
      client.release();
    }
  }
}

export default NotificationService;
