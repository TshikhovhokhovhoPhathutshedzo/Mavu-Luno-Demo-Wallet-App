/**
 * Daily Limits Manager
 * 
 * This service manages daily limits caching, refreshing, and real-time updates
 * to ensure the frontend always has the latest limit information.
 */

class LimitManager {
    constructor() {
        this.limits = {
            deposit: null,
            withdrawal: null,
            lastUpdated: null
        };
        this.refreshInterval = 0; // DISABLED - was 30 seconds
        this.isRefreshing = false;
        this.intervalId = null; // Track interval ID
        
        // Initialize on load
        this.init();
    }

    /**
     * Initialize the limit manager
     */
    async init() {
        console.log('🔄 Initializing Daily Limits Manager...');
        
        // Check if user is authenticated before starting - DISABLED
        console.log('🔐 LimitManager initialization disabled to stop API calls');
        return;
        
        // Load initial limits
        await this.refreshLimits();
        
        // Set up periodic refresh
        // this.startPeriodicRefresh(); // DISABLED TO STOP LOOP
        
        // Listen for limit updates from other tabs/windows
        this.setupStorageListener();
        
        console.log('✅ Daily Limits Manager initialized');
    }

    /**
     * Get current limits (from cache or fetch if needed)
     */
    async getLimits() {
        // If limits are stale (older than 1 minute), refresh them
        const now = Date.now();
        const oneMinute = 60 * 1000;
        
        if (!this.limits.lastUpdated || (now - this.limits.lastUpdated) > oneMinute) {
            console.log('🔄 Limits are stale, refreshing...');
            await this.refreshLimits();
        }
        
        return this.limits;
    }

    /**
     * Refresh limits from the backend
     */
    async refreshLimits() {
        if (this.isRefreshing) {
            console.log('⏳ Limits refresh already in progress...');
            return;
        }

        this.isRefreshing = true;
        console.log('🔄 Refreshing daily limits...');

        console.log('🔄 Limits refresh completely disabled to stop API loop');
        this.isRefreshing = false;
        return;
    }

    /**
     * Check if a transaction would exceed daily limits
     */
    async checkTransactionLimit(transactionType, amount) {
        try {
            const limits = await this.getLimits();
            
            if (!limits[transactionType]) {
                console.log(`ℹ️ No ${transactionType} limit set`);
                return { allowed: true, reason: 'No limit set' };
            }

            const limit = limits[transactionType];
            const currentUsage = limit.currentUsage || 0;
            const dailyLimit = limit.amountRands || 0;
            const remaining = dailyLimit - currentUsage;

            console.log(`🔍 Checking ${transactionType} limit:`, {
                amount,
                currentUsage,
                dailyLimit,
                remaining
            });

            if (amount > remaining) {
                return {
                    allowed: false,
                    reason: `This ${transactionType} would exceed your daily limit`,
                    details: {
                        currentUsage,
                        dailyLimit,
                        remaining,
                        transactionType
                    }
                };
            }

            return { allowed: true, reason: 'Within limits' };
        } catch (error) {
            console.error('❌ Error checking transaction limit:', error);
            // If there's an error checking limits, allow the transaction but log the error
            return { allowed: true, reason: 'Unable to check limits, allowing transaction' };
        }
    }

    /**
     * Force refresh limits (useful after limit updates)
     */
    async forceRefresh() {
        console.log('🔄 Force refreshing daily limits...');
        this.limits.lastUpdated = 0; // Force refresh
        await this.refreshLimits();
    }

    /**
     * Start periodic refresh of limits
     */
    startPeriodicRefresh() {
        // Clear existing interval if any
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }
        
        // Start new interval
        this.intervalId = setInterval(() => {
            this.refreshLimits();
        }, this.refreshInterval);
        
        console.log('🔄 Periodic refresh started (30s interval)');
    }

    /**
     * Stop periodic refresh
     */
    stopPeriodicRefresh() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            console.log('⏹️ Periodic refresh stopped');
        }
    }

    /**
     * Store limits in localStorage for cross-tab synchronization
     */
    storeLimitsInStorage() {
        try {
            localStorage.setItem('dailyLimits', JSON.stringify({
                limits: this.limits,
                timestamp: Date.now()
            }));
        } catch (error) {
            console.error('❌ Error storing limits in localStorage:', error);
        }
    }

    /**
     * Load limits from localStorage
     */
    loadLimitsFromStorage() {
        try {
            const stored = localStorage.getItem('dailyLimits');
            if (stored) {
                const data = JSON.parse(stored);
                const now = Date.now();
                const fiveMinutes = 5 * 60 * 1000;
                
                // Only use stored data if it's less than 5 minutes old
                if (now - data.timestamp < fiveMinutes) {
                    this.limits = data.limits;
                    console.log('📱 Loaded limits from localStorage:', this.limits);
                    return true;
                }
            }
        } catch (error) {
            console.error('❌ Error loading limits from localStorage:', error);
        }
        return false;
    }

    /**
     * Setup listener for cross-tab limit updates
     */
    setupStorageListener() {
        window.addEventListener('storage', (e) => {
            if (e.key === 'dailyLimits') {
                console.log('📱 Limits updated in another tab, refreshing...');
                this.refreshLimits();
            }
        });
    }

    /**
     * Notify other components that limits have been updated
     */
    notifyLimitUpdate() {
        // Dispatch custom event
        const event = new CustomEvent('limitsUpdated', {
            detail: { limits: this.limits }
        });
        window.dispatchEvent(event);
    }

    /**
     * Get limit status for display
     */
    getLimitStatus(transactionType) {
        const limit = this.limits[transactionType];
        if (!limit) {
            return { hasLimit: false, message: 'No limit set' };
        }

        const currentUsage = limit.currentUsage || 0;
        const dailyLimit = limit.amountRands || 0;
        const remaining = dailyLimit - currentUsage;
        const percentage = (currentUsage / dailyLimit) * 100;

        return {
            hasLimit: true,
            currentUsage,
            dailyLimit,
            remaining,
            percentage: Math.round(percentage),
            message: `Used R${currentUsage.toFixed(2)} of R${dailyLimit.toFixed(2)} (${Math.round(percentage)}%)`
        };
    }

    /**
     * Cleanup method to stop intervals and clear resources
     */
    cleanup() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            console.log('🧹 Limit Manager cleaned up');
        }
    }
}

// Create global instance only if it doesn't exist
if (!window.limitManager) {
    window.limitManager = new LimitManager();
} else {
    console.log('🔄 Limit Manager already exists, skipping initialization');
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LimitManager;
}
