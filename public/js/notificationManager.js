// Notification Manager for Push Notifications
class NotificationManager {
  constructor() {
    this.notifications = [];
    this.container = null;
    this.init();
  }

  init() {
    // Create notification container
    this.createContainer();
    
    // Load existing notifications
    this.loadNotifications();
    
    // Set up periodic refresh - reduced frequency to prevent spam
    setInterval(() => this.loadNotifications(), 60000); // Refresh every 60 seconds
  }

  createContainer() {
    // Remove existing container if any
    const existing = document.getElementById('notification-container');
    if (existing) {
      existing.remove();
    }

    // Create notification container
    this.container = document.createElement('div');
    this.container.id = 'notification-container';
    this.container.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 10000;
      max-width: 400px;
      pointer-events: none;
    `;

    document.body.appendChild(this.container);
  }

  async loadNotifications() {
    try {
      const response = await fetch('/api/notifications');
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          this.updateNotifications(data.notifications);
        }
      }
    } catch (error) {
      console.error('Error loading notifications:', error);
    }
  }

  updateNotifications(notifications) {
    // Only show new notifications that aren't already displayed
    const existingIds = new Set();
    const existingElements = this.container.querySelectorAll('.push-notification');
    existingElements.forEach(el => {
      const id = el.getAttribute('data-notification-id');
      if (id) existingIds.add(id);
    });
    
    // Add only new notifications
    notifications.forEach(notification => {
      if (!existingIds.has(notification.id.toString())) {
        this.addNotification(notification);
      }
    });
  }

  addNotification(notification) {
    const notificationEl = document.createElement('div');
    notificationEl.className = 'push-notification';
    notificationEl.setAttribute('data-notification-id', notification.id);
    notificationEl.style.cssText = `
      background: ${this.getNotificationColor(notification.type)};
      color: white;
      padding: 16px 20px;
      margin-bottom: 10px;
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.15);
      transform: translateX(100%);
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      pointer-events: auto;
      cursor: pointer;
      position: relative;
      overflow: hidden;
    `;

    // Add close button
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '×';
    closeBtn.style.cssText = `
      position: absolute;
      top: 8px;
      right: 12px;
      background: none;
      border: none;
      color: white;
      font-size: 20px;
      cursor: pointer;
      opacity: 0.7;
      transition: opacity 0.2s;
    `;
    closeBtn.onmouseover = () => closeBtn.style.opacity = '1';
    closeBtn.onmouseout = () => closeBtn.style.opacity = '0.7';
    closeBtn.onclick = (e) => {
      e.stopPropagation();
      this.removeNotification(notificationEl);
      this.markAsRead(notification.id);
    };

    // Add content
    const content = document.createElement('div');
    content.innerHTML = `
      <div style="font-weight: 600; font-size: 14px; margin-bottom: 4px;">
        ${notification.title}
      </div>
      <div style="font-size: 13px; opacity: 0.9; line-height: 1.4;">
        ${notification.message}
      </div>
      <div style="font-size: 11px; opacity: 0.7; margin-top: 8px;">
        ${this.formatTime(notification.created_at)}
      </div>
    `;

    notificationEl.appendChild(closeBtn);
    notificationEl.appendChild(content);

    // Add click handler to mark as read
    notificationEl.onclick = () => {
      this.removeNotification(notificationEl);
      this.markAsRead(notification.id);
    };

    this.container.appendChild(notificationEl);

    // Animate in
    setTimeout(() => {
      notificationEl.style.transform = 'translateX(0)';
    }, 100);

    // Auto remove after 5 seconds
    setTimeout(() => {
      this.removeNotification(notificationEl);
    }, 5000);
  }

  removeNotification(element) {
    element.style.transform = 'translateX(100%)';
    setTimeout(() => {
      if (element.parentNode) {
        element.parentNode.removeChild(element);
      }
    }, 300);
  }

  getNotificationColor(type) {
    const colors = {
      success: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
      error: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
      warning: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
      info: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
      default: 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)'
    };
    return colors[type] || colors.default;
  }

  formatTime(timestamp) {
    const now = new Date();
    const time = new Date(timestamp);
    const diff = now - time;
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return time.toLocaleDateString();
  }

  async markAsRead(notificationId) {
    try {
      await fetch(`/api/notifications/${notificationId}/read`, {
        method: 'POST'
      });
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  }

  // Method to manually add a notification (for testing)
  showNotification(title, message, type = 'info') {
    const notification = {
      id: Date.now(),
      title,
      message,
      type,
      created_at: new Date().toISOString()
    };
    this.addNotification(notification);
  }
}

// Initialize notification manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.notificationManager = new NotificationManager();
});

// Export for use in other scripts
window.NotificationManager = NotificationManager;
