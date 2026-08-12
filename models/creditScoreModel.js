import pool from "../auth/db.js";

class CreditScoreModel {
    constructor() {
        this.factors = {
            paymentHistory: 0.35,      // 35% weight
            creditUtilization: 0.30,   // 30% weight
            creditHistoryLength: 0.15,  // 15% weight
            creditMix: 0.10,           // 10% weight
            newCredit: 0.10            // 10% weight
        };
        this.baseScore = 300;
        this.maxScore = 850;
    }

    // Calculate credit score based on user's financial behavior
    async calculateCreditScore(userId) {
        const client = await pool.connect();
        
        try {
            // Get user's financial data
            const financialData = await this.getFinancialData(userId);
            
            if (!financialData) {
                return {
                    score: 650, // Default score for new users
                    factors: this.getDefaultFactors(),
                    grade: 'C',
                    recommendations: this.getDefaultRecommendations()
                };
            }

            // Calculate individual factor scores
            const paymentScore = this.calculatePaymentHistory(financialData);
            const utilizationScore = this.calculateCreditUtilization(financialData);
            const historyScore = this.calculateCreditHistoryLength(financialData);
            const mixScore = this.calculateCreditMix(financialData);
            const newCreditScore = this.calculateNewCredit(financialData);

            // Calculate weighted credit score
            const weightedScore = Math.round(
                (paymentScore * this.factors.paymentHistory) +
                (utilizationScore * this.factors.creditUtilization) +
                (historyScore * this.factors.creditHistoryLength) +
                (mixScore * this.factors.creditMix) +
                (newCreditScore * this.factors.newCredit)
            );

            const finalScore = Math.max(this.baseScore, Math.min(this.maxScore, weightedScore));
            const grade = this.getCreditGrade(finalScore);

            return {
                score: finalScore,
                factors: {
                    paymentHistory: paymentScore,
                    creditUtilization: utilizationScore,
                    creditHistoryLength: historyScore,
                    creditMix: mixScore,
                    newCredit: newCreditScore
                },
                grade: grade,
                recommendations: this.getRecommendations(finalScore, financialData),
                lastUpdated: new Date().toISOString()
            };

        } catch (error) {
            console.error('Error calculating credit score:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    // Get user's financial data for analysis
    async getFinancialData(userId) {
        const client = await pool.connect();
        
        try {
            // Get transaction history
            const transactions = await client.query(`
                SELECT 
                    transaction_type,
                    amount,
                    created_at,
                    payment_method,
                    status
                FROM transactions
                WHERE user_id = $1
                ORDER BY created_at DESC
            `, [userId]);

            // Get account age (using a default date since we don't have account creation date)
            const userInfo = await client.query(`
                SELECT NOW() - INTERVAL '30 days' as account_created
                FROM luno_users
                WHERE user_id = $1
            `, [userId]);

            // Get balance movements
            const movements = await client.query(`
                SELECT 
                    balance_after,
                    created_at
                FROM transaction_movements
                WHERE user_id = $1
                ORDER BY created_at DESC
            `, [userId]);

            return {
                transactions: transactions.rows,
                accountAge: userInfo.rows[0]?.account_created,
                movements: movements.rows
            };

        } catch (error) {
            console.error('Error getting financial data:', error);
            // Return default data instead of null to prevent crashes
            return {
                transactions: [],
                accountAge: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
                movements: []
            };
        } finally {
            client.release();
        }
    }

    // Calculate payment history score (35% weight)
    calculatePaymentHistory(data) {
        const transactions = data.transactions;
        if (transactions.length === 0) return 700; // Default for new users

        const successfulTransactions = transactions.filter(t => 
            t.status === 'success' || t.status === 'completed'
        ).length;

        const totalTransactions = transactions.length;
        const paymentRate = successfulTransactions / totalTransactions;

        // Score based on payment success rate
        if (paymentRate >= 0.95) return 850;
        if (paymentRate >= 0.90) return 800;
        if (paymentRate >= 0.85) return 750;
        if (paymentRate >= 0.80) return 700;
        if (paymentRate >= 0.75) return 650;
        if (paymentRate >= 0.70) return 600;
        return 550;
    }

    // Calculate credit utilization score (30% weight)
    calculateCreditUtilization(data) {
        const movements = data.movements;
        if (movements.length === 0) return 700;

        // Calculate average balance and spending patterns
        const balances = movements.map(m => parseInt(m.balance_after));
        const avgBalance = balances.reduce((a, b) => a + b, 0) / balances.length;
        
        const transactions = data.transactions;
        const withdrawals = transactions.filter(t => t.transaction_type === 'withdrawal');
        const totalSpent = withdrawals.reduce((sum, t) => sum + parseInt(t.amount), 0);
        
        // Utilization rate (spending vs available balance)
        const utilizationRate = totalSpent / (avgBalance + totalSpent);
        
        // Score based on utilization rate
        if (utilizationRate <= 0.10) return 850; // Excellent
        if (utilizationRate <= 0.20) return 800; // Very Good
        if (utilizationRate <= 0.30) return 750; // Good
        if (utilizationRate <= 0.40) return 700; // Fair
        if (utilizationRate <= 0.50) return 650; // Poor
        return 600; // Very Poor
    }

    // Calculate credit history length score (15% weight)
    calculateCreditHistoryLength(data) {
        if (!data.accountAge) return 650;

        const accountAge = new Date() - new Date(data.accountAge);
        const monthsActive = accountAge / (1000 * 60 * 60 * 24 * 30);

        // Score based on account age
        if (monthsActive >= 60) return 850; // 5+ years
        if (monthsActive >= 36) return 800; // 3+ years
        if (monthsActive >= 24) return 750; // 2+ years
        if (monthsActive >= 12) return 700; // 1+ years
        if (monthsActive >= 6) return 650;  // 6+ months
        return 600; // Less than 6 months
    }

    // Calculate credit mix score (10% weight)
    calculateCreditMix(data) {
        const transactions = data.transactions;
        if (transactions.length === 0) return 650;

        // Analyze different payment methods used
        const paymentMethods = new Set(transactions.map(t => t.payment_method));
        const uniqueMethods = paymentMethods.size;

        // Score based on variety of payment methods
        if (uniqueMethods >= 5) return 850; // Excellent variety
        if (uniqueMethods >= 4) return 800; // Very good variety
        if (uniqueMethods >= 3) return 750; // Good variety
        if (uniqueMethods >= 2) return 700; // Fair variety
        return 650; // Limited variety
    }

    // Calculate new credit score (10% weight)
    calculateNewCredit(data) {
        const transactions = data.transactions;
        if (transactions.length === 0) return 700;

        // Analyze recent account activity
        const recentTransactions = transactions.filter(t => {
            const transactionDate = new Date(t.created_at);
            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            return transactionDate > thirtyDaysAgo;
        });

        const recentActivity = recentTransactions.length;
        
        // Score based on recent activity (not too much, not too little)
        if (recentActivity >= 5 && recentActivity <= 15) return 800; // Optimal activity
        if (recentActivity >= 3 && recentActivity <= 20) return 750; // Good activity
        if (recentActivity >= 1 && recentActivity <= 25) return 700; // Acceptable activity
        if (recentActivity === 0) return 650; // No recent activity
        return 600; // Too much activity
    }

    // Get credit grade based on score
    getCreditGrade(score) {
        if (score >= 800) return 'A+';
        if (score >= 750) return 'A';
        if (score >= 700) return 'B+';
        if (score >= 650) return 'B';
        if (score >= 600) return 'C+';
        if (score >= 550) return 'C';
        if (score >= 500) return 'D';
        return 'F';
    }

    // Get personalized recommendations
    getRecommendations(score, data) {
        const recommendations = [];

        if (score < 700) {
            recommendations.push({
                priority: 'high',
                category: 'payment_history',
                title: 'Improve Payment History',
                description: 'Ensure all transactions are completed successfully. Avoid failed payments.',
                action: 'Monitor your transaction status and contact support for any issues.'
            });
        }

        if (score < 750) {
            recommendations.push({
                priority: 'medium',
                category: 'credit_utilization',
                title: 'Optimize Spending Patterns',
                description: 'Maintain a healthy balance between spending and available funds.',
                action: 'Try to keep your spending below 30% of your available balance.'
            });
        }

        if (data.accountAge) {
            const accountAge = new Date() - new Date(data.accountAge);
            const monthsActive = accountAge / (1000 * 60 * 60 * 24 * 30);
            
            if (monthsActive < 12) {
                recommendations.push({
                    priority: 'low',
                    category: 'credit_history',
                    title: 'Build Credit History',
                    description: 'Your account is relatively new. Continue using the wallet regularly.',
                    action: 'Make regular transactions to build a positive payment history.'
                });
            }
        }

        // Add general recommendations
        recommendations.push({
            priority: 'medium',
            category: 'general',
            title: 'Diversify Payment Methods',
            description: 'Using different payment methods can improve your credit mix.',
            action: 'Try using different payment channels like cards, bank transfers, and mobile money.'
        });

        return recommendations;
    }

    // Get default factors for new users
    getDefaultFactors() {
        return {
            paymentHistory: 700,
            creditUtilization: 700,
            creditHistoryLength: 650,
            creditMix: 650,
            newCredit: 700
        };
    }

    // Get default recommendations for new users
    getDefaultRecommendations() {
        return [
            {
                priority: 'high',
                category: 'getting_started',
                title: 'Start Building Credit',
                description: 'Begin using your wallet regularly to establish a credit history.',
                action: 'Make your first transaction and maintain regular activity.'
            },
            {
                priority: 'medium',
                category: 'education',
                title: 'Learn About Credit',
                description: 'Understanding credit factors will help you improve your score.',
                action: 'Read our credit education resources and follow best practices.'
            }
        ];
    }

    // Save credit score to database
    async saveCreditScore(userId, creditData) {
        const client = await pool.connect();
        
        try {
            await client.query(`
                INSERT INTO credit_scores (
                    user_id, 
                    score, 
                    grade, 
                    factors, 
                    recommendations, 
                    last_updated
                ) VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (user_id) 
                DO UPDATE SET 
                    score = EXCLUDED.score,
                    grade = EXCLUDED.grade,
                    factors = EXCLUDED.factors,
                    recommendations = EXCLUDED.recommendations,
                    last_updated = EXCLUDED.last_updated
            `, [
                userId,
                creditData.score,
                creditData.grade,
                JSON.stringify(creditData.factors),
                JSON.stringify(creditData.recommendations),
                creditData.lastUpdated
            ]);

            console.log(`✅ Credit score saved for user ${userId}: ${creditData.score} (${creditData.grade})`);
            
        } catch (error) {
            console.error('Error saving credit score:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    // Get credit score history
    async getCreditScoreHistory(userId) {
        const client = await pool.connect();
        
        try {
            const result = await client.query(`
                SELECT 
                    score,
                    grade,
                    factors,
                    recommendations,
                    last_updated
                FROM credit_scores
                WHERE user_id = $1
                ORDER BY last_updated DESC
                LIMIT 10
            `, [userId]);

            return result.rows;
            
        } catch (error) {
            console.error('Error getting credit score history:', error);
            return [];
        } finally {
            client.release();
        }
    }
}

export default CreditScoreModel;
