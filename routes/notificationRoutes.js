import express from "express";
import { ensureAuth } from "../middlewares/ensureAuth.js";
import NotificationService from "../services/notificationService.js";
import pool from "../auth/db.js";

const notificationRouter = express.Router();

// Get user's notifications
notificationRouter.get("/", ensureAuth, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const notifications = await NotificationService.getUserNotifications(userId, 20);
    const unreadCount = await NotificationService.getUnreadCount(userId);
    
    res.json({
      success: true,
      notifications,
      unreadCount
    });
  } catch (error) {
    console.error('Error getting notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting notifications'
    });
  }
});

// Mark notification as read
notificationRouter.post("/:id/read", ensureAuth, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const notificationId = req.params.id;
    
    const success = await NotificationService.markNotificationAsRead(userId, notificationId);
    
    if (success) {
      res.json({
        success: true,
        message: 'Notification marked as read'
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({
      success: false,
      message: 'Error marking notification as read'
    });
  }
});

// Mark all notifications as read
notificationRouter.post("/read-all", ensureAuth, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const client = await pool.connect();
    
    try {
      await client.query(`
        UPDATE in_app_notifications 
        SET read_at = CURRENT_TIMESTAMP 
        WHERE user_id = $1 AND read_at IS NULL
      `, [userId]);
      
      res.json({
        success: true,
        message: 'All notifications marked as read'
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({
      success: false,
      message: 'Error marking all notifications as read'
    });
  }
});

// Get unread count
notificationRouter.get("/unread-count", ensureAuth, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const count = await NotificationService.getUnreadCount(userId);
    
    res.json({
      success: true,
      count
    });
  } catch (error) {
    console.error('Error getting unread count:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting unread count'
    });
  }
});

export default notificationRouter;
