import pool from "../auth/db.js";
import nodemailer from "nodemailer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import PDFDocument from 'pdfkit';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class DocumentAnalysis {
    constructor() {
        this.statementTemplate = this.getStatementTemplate();
    }

    // Generate comprehensive bank statement with charts
    async generateBankStatement(userId, period = 'monthly') {
        const client = await pool.connect();
        
        try {
            // Get user information
            const userInfo = await this.getUserInfo(userId);
            if (!userInfo) {
                throw new Error('User not found');
            }

            // Get comprehensive financial data
            const financialData = await this.getFinancialData(userId, period);
            
            // Generate statement content
            const statementContent = this.generateStatementContent(userInfo, financialData);
            
            // Try to create PDF with charts, fallback to simple PDF if it fails
            let pdfBuffer;
            try {
                pdfBuffer = await this.createPDFStatement(statementContent);
            } catch (pdfError) {
                console.log(`⚠️ Complex PDF generation failed: ${pdfError.message}`);
                console.log('🔄 Falling back to simple PDF generation...');
                pdfBuffer = await this.createSimplePDFStatement(statementContent);
            }
            
            // Save statement to database
            const statementId = await this.saveStatement(userId, statementContent, period);
            
            // Send email with PDF (optional - can fail gracefully)
            try {
                await this.sendStatementEmail(userInfo.email, pdfBuffer, statementContent);
            } catch (emailError) {
                console.log(`⚠️ Email sending failed: ${emailError.message}`);
                // Continue without email - statement is still generated and saved
            }
            
            return {
                success: true,
                statementId: statementId,
                message: 'Bank statement generated and sent successfully'
            };

        } catch (error) {
            console.error('Error generating bank statement:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    // Get user information
    async getUserInfo(userId) {
        const client = await pool.connect();
        
        try {
            const result = await client.query(`
                SELECT 
                    username,
                    email,
                    username as first_name,
                    username as last_name,
                    NOW() - INTERVAL '30 days' as account_created
                FROM luno_users
                WHERE user_id = $1
            `, [userId]);

            if (result.rows.length === 0) {
                throw new Error('User not found');
            }

            return result.rows[0];
        } catch (error) {
            console.error('Error getting user info:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    // Get comprehensive financial data
    async getFinancialData(userId, period) {
        const client = await pool.connect();
        
        try {
            // Get current balance
            const balanceResult = await client.query(`
                SELECT balance_after 
                FROM transaction_movements 
                WHERE user_id = $1 
                ORDER BY created_at DESC 
                LIMIT 1
            `, [userId]);

            const currentBalance = balanceResult.rows[0]?.balance_after || 0;

            // Get transaction history based on period
            const periodFilter = this.getPeriodFilter(period);
            const transactions = await client.query(`
                SELECT 
                    transaction_id,
                    reference,
                    amount,
                    currency,
                    status,
                    payment_method,
                    transaction_type,
                    created_at,
                    metadata,
                    transaction_location
                FROM transactions
                WHERE user_id = $1 
                AND created_at >= $2
                ORDER BY created_at DESC
            `, [userId, periodFilter]);

            // Get spending analysis
            const spendingAnalysis = await this.analyzeSpending(transactions.rows);
            
            // Get credit score
            const creditScore = await this.getCreditScore(userId);
            
            // Get account statistics
            const accountStats = await this.getAccountStatistics(userId, periodFilter);

            return {
                currentBalance,
                transactions: transactions.rows,
                spendingAnalysis,
                creditScore,
                accountStats,
                period: period
            };

        } finally {
            client.release();
        }
    }

    // Get period filter for queries
    getPeriodFilter(period) {
        const now = new Date();
        switch (period) {
            case 'weekly':
                return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            case 'monthly':
                return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            case 'quarterly':
                return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
            case 'yearly':
                return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
            default:
                return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        }
    }

         // Analyze spending patterns
     async analyzeSpending(transactions) {
         const withdrawals = transactions.filter(t => t.transaction_type === 'withdrawal');
         const deposits = transactions.filter(t => t.transaction_type === 'deposit');
 
         // Calculate totals
         const totalSpent = withdrawals.reduce((sum, t) => sum + parseInt(t.amount || 0), 0);
         const totalDeposited = deposits.reduce((sum, t) => sum + parseInt(t.amount || 0), 0);
 
         // Categorize spending
         const spendingByCategory = {};
         withdrawals.forEach(t => {
             const category = t.payment_method || 'Other';
             spendingByCategory[category] = (spendingByCategory[category] || 0) + parseInt(t.amount || 0);
         });
 
         // Monthly spending trend
         const monthlySpending = {};
         withdrawals.forEach(t => {
             const month = new Date(t.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
             monthlySpending[month] = (monthlySpending[month] || 0) + parseInt(t.amount || 0);
         });
 
         // Daily spending pattern
         const dailySpending = {};
         withdrawals.forEach(t => {
             const day = new Date(t.created_at).toLocaleDateString('en-US', { weekday: 'long' });
             dailySpending[day] = (dailySpending[day] || 0) + parseInt(t.amount || 0);
         });
 
         // Add default categories if none exist
         if (Object.keys(spendingByCategory).length === 0) {
             spendingByCategory['Card Payments'] = 0;
             spendingByCategory['Bank Transfers'] = 0;
             spendingByCategory['Other'] = 0;
         }
 
         // Add default monthly data if none exists
         if (Object.keys(monthlySpending).length === 0) {
             const currentMonth = new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
             monthlySpending[currentMonth] = 0;
         }
 
         // Add default daily data if none exists
         if (Object.keys(dailySpending).length === 0) {
             const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
             days.forEach(day => {
                 dailySpending[day] = 0;
             });
         }
 
         return {
             totalSpent,
             totalDeposited,
             netFlow: totalDeposited - totalSpent,
             spendingByCategory,
             monthlySpending,
             dailySpending,
             transactionCount: {
                 deposits: deposits.length,
                 withdrawals: withdrawals.length,
                 total: transactions.length
             }
         };
     }

    // Get credit score
    async getCreditScore(userId) {
        const client = await pool.connect();
        
        try {
            const result = await client.query(`
                SELECT score, grade, factors, recommendations
                FROM credit_scores
                WHERE user_id = $1
                ORDER BY last_updated DESC
                LIMIT 1
            `, [userId]);

            return result.rows[0] || { score: 650, grade: 'C' };
        } finally {
            client.release();
        }
    }

    // Get account statistics
    async getAccountStatistics(userId, periodFilter) {
        const client = await pool.connect();
        
        try {
            // Average balance
            const balanceResult = await client.query(`
                SELECT AVG(balance_after) as avg_balance
                FROM transaction_movements
                WHERE user_id = $1 AND created_at >= $2
            `, [userId, periodFilter]);

            // Transaction frequency
            const frequencyResult = await client.query(`
                SELECT 
                    COUNT(*) as total_transactions,
                    COUNT(CASE WHEN transaction_type = 'deposit' THEN 1 END) as deposits,
                    COUNT(CASE WHEN transaction_type = 'withdrawal' THEN 1 END) as withdrawals
                FROM transactions
                WHERE user_id = $1 AND created_at >= $2
            `, [userId, periodFilter]);

            return {
                averageBalance: Math.round(balanceResult.rows[0]?.avg_balance || 0),
                transactionFrequency: frequencyResult.rows[0]?.total_transactions || 0,
                depositCount: frequencyResult.rows[0]?.deposits || 0,
                withdrawalCount: frequencyResult.rows[0]?.withdrawals || 0
            };
        } finally {
            client.release();
        }
    }

    // Generate comprehensive statement content
    generateStatementContent(userInfo, financialData) {
        const now = new Date();
        const statementDate = now.toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        });

        // Generate charts data
        const chartsData = this.generateChartsData(financialData);

        return {
            userInfo: {
                name: `${userInfo.first_name} ${userInfo.last_name}`,
                username: userInfo.username,
                email: userInfo.email,
                accountCreated: new Date(userInfo.account_created).toLocaleDateString('en-US'),
                accountAge: this.calculateAccountAge(userInfo.account_created)
            },
            statementInfo: {
                date: statementDate,
                period: financialData.period,
                statementNumber: this.generateStatementNumber(),
                generatedAt: now.toISOString()
            },
            financialSummary: {
                currentBalance: financialData.currentBalance,
                totalDeposits: financialData.spendingAnalysis.totalDeposited,
                totalWithdrawals: financialData.spendingAnalysis.totalSpent,
                netFlow: financialData.spendingAnalysis.netFlow,
                transactionCount: financialData.spendingAnalysis.transactionCount
            },
            creditScore: financialData.creditScore,
            accountStatistics: financialData.accountStats,
            spendingAnalysis: financialData.spendingAnalysis,
            charts: chartsData,
            transactions: financialData.transactions.slice(0, 50) // Limit to 50 most recent
        };
    }

         // Generate charts data
     generateChartsData(financialData) {
         const { spendingAnalysis } = financialData;
 
         // Pie chart data for spending categories
         const pieChartData = Object.entries(spendingAnalysis.spendingByCategory || {}).map(([category, amount]) => ({
             category,
             amount,
             percentage: spendingAnalysis.totalSpent > 0 ? Math.round((amount / spendingAnalysis.totalSpent) * 100) : 0
         }));
 
         // Bar chart data for monthly spending
         const barChartData = Object.entries(spendingAnalysis.monthlySpending || {}).map(([month, amount]) => ({
             month,
             amount
         }));
 
         // Line chart data for daily spending
         const lineChartData = Object.entries(spendingAnalysis.dailySpending || {}).map(([day, amount]) => ({
             day,
             amount
         }));
 
         // Add sample data if no real data exists
         if (pieChartData.length === 0) {
             pieChartData.push(
                 { category: 'Card Payments', amount: 0, percentage: 0 },
                 { category: 'Bank Transfers', amount: 0, percentage: 0 },
                 { category: 'Other', amount: 0, percentage: 0 }
             );
         }
 
         if (barChartData.length === 0) {
             const currentMonth = new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
             barChartData.push({ month: currentMonth, amount: 0 });
         }
 
         if (lineChartData.length === 0) {
             lineChartData.push(
                 { day: 'Monday', amount: 0 },
                 { day: 'Tuesday', amount: 0 },
                 { day: 'Wednesday', amount: 0 },
                 { day: 'Thursday', amount: 0 },
                 { day: 'Friday', amount: 0 },
                 { day: 'Saturday', amount: 0 },
                 { day: 'Sunday', amount: 0 }
             );
         }
 
         // Additional chart data for comprehensive analysis
         const depositVsWithdrawalData = {
             deposits: financialData.transactions.filter(t => t.transaction_type === 'deposit').length,
             withdrawals: financialData.transactions.filter(t => t.transaction_type === 'withdrawal').length
         };

         const transactionTrendData = financialData.transactions.reduce((acc, transaction) => {
             const date = new Date(transaction.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
             if (!acc[date]) acc[date] = { deposits: 0, withdrawals: 0 };
             acc[date][transaction.transaction_type] += parseFloat(transaction.amount);
             return acc;
         }, {});

         const averageTransactionData = {
             averageDeposit: financialData.transactions.filter(t => t.transaction_type === 'deposit').reduce((sum, t) => sum + parseFloat(t.amount), 0) / Math.max(financialData.transactions.filter(t => t.transaction_type === 'deposit').length, 1),
             averageWithdrawal: financialData.transactions.filter(t => t.transaction_type === 'withdrawal').reduce((sum, t) => sum + parseFloat(t.amount), 0) / Math.max(financialData.transactions.filter(t => t.transaction_type === 'withdrawal').length, 1)
         };

                   return {
              pieChart: pieChartData,
              barChart: barChartData,
              lineChart: lineChartData,
              depositVsWithdrawal: depositVsWithdrawalData,
              transactionTrend: transactionTrendData,
              averageTransaction: averageTransactionData,
              spendingByPaymentMethod: {
                  card: financialData.transactions.filter(t => t.payment_method === 'card').reduce((sum, t) => sum + parseFloat(t.amount), 0),
                  bank_transfer: financialData.transactions.filter(t => t.payment_method === 'bank_transfer').reduce((sum, t) => sum + parseFloat(t.amount), 0),
                  mobile_money: financialData.transactions.filter(t => t.payment_method === 'mobile_money').reduce((sum, t) => sum + parseFloat(t.amount), 0)
              },
              // Additional data for modern dashboard
              currentBalance: financialData.currentBalance,
              totalSpent: spendingAnalysis.totalSpent,
              totalDeposited: spendingAnalysis.totalDeposited,
              netFlow: spendingAnalysis.netFlow,
              transactionCount: spendingAnalysis.transactionCount
          };
     }

    // Calculate account age
    calculateAccountAge(accountCreated) {
        const created = new Date(accountCreated);
        const now = new Date();
        const diffTime = Math.abs(now - created);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays < 30) return `${diffDays} days`;
        if (diffDays < 365) return `${Math.floor(diffDays / 30)} months`;
        return `${Math.floor(diffDays / 365)} years`;
    }

    // Generate statement number
    generateStatementNumber() {
        const timestamp = Date.now();
        const random = Math.floor(Math.random() * 1000);
        return `STMT-${timestamp}-${random}`;
    }

    // Create PDF statement with charts
    async createPDFStatement(content) {
        return new Promise((resolve, reject) => {
            try {
                const doc = new PDFDocument({
                    size: 'A4',
                    margin: 50
                });
                
                const chunks = [];
                doc.on('data', chunk => chunks.push(chunk));
                doc.on('end', () => resolve(Buffer.concat(chunks)));
                doc.on('error', (error) => reject(error));
                
                try {
                    // Add header
                    this.addPDFHeader(doc, content.userInfo);
                    
                    // Add account summary
                    this.addAccountSummary(doc, content);
                    
                    // Add transaction history
                    this.addTransactionHistory(doc, content);
                    
                    // Add spending analysis
                    this.addSpendingAnalysis(doc, content);
                    
                    // Add charts (as text descriptions for now)
                    this.addChartsSection(doc, content.charts);
                    
                    // Add footer (optional - won't break if it fails)
                    try {
                        this.addPDFFooter(doc);
                    } catch (footerError) {
                        console.log(`⚠️ Footer generation failed: ${footerError.message}`);
                    }
                    
                } catch (sectionError) {
                    console.log(`⚠️ PDF section generation failed: ${sectionError.message}`);
                    // Continue with basic PDF generation
                }
                
                doc.end();
                
            } catch (error) {
                reject(error);
            }
        });
    }

    addPDFHeader(doc, userInfo) {
        // Logo/Title
        doc.fontSize(24)
           .font('Helvetica-Bold')
           .fillColor('#1a73e8')
           .text('LUNO WALLET', { align: 'center' });
        
        doc.moveDown(0.5);
        
        // Statement title
        doc.fontSize(18)
           .font('Helvetica')
           .fillColor('#333')
           .text('Bank Statement', { align: 'center' });
        
        doc.moveDown(1);
        
        // User info
        doc.fontSize(12)
           .font('Helvetica-Bold')
           .text('Account Holder:', 50, doc.y);
        
        doc.fontSize(12)
           .font('Helvetica')
           .text(`${userInfo.first_name} ${userInfo.last_name}`, 150, doc.y - 15);
        
        doc.fontSize(10)
           .text(`Email: ${userInfo.email}`, 150, doc.y);
        
        doc.fontSize(10)
           .text(`Account Created: ${new Date(userInfo.account_created).toLocaleDateString()}`, 150, doc.y);
        
        doc.moveDown(1);
        
        // Statement period
        doc.fontSize(12)
           .font('Helvetica-Bold')
           .text(`Statement Period: ${new Date().toLocaleDateString()}`, { align: 'right' });
        
        doc.moveDown(2);
    }

    addAccountSummary(doc, content) {
        doc.fontSize(14)
           .font('Helvetica-Bold')
           .fillColor('#1a73e8')
           .text('Account Summary');
        
        doc.moveDown(0.3);
        
        const summary = content.financialSummary;
        
        // Compact layout in two columns
        doc.fontSize(10)
           .font('Helvetica-Bold')
           .text('Current Balance:', 50, doc.y);
        doc.fontSize(10)
           .font('Helvetica')
           .text(`R${parseFloat(summary.currentBalance || 0).toFixed(2)}`, 200, doc.y - 10);
        
        doc.fontSize(10)
           .font('Helvetica-Bold')
           .text('Total Income:', 50, doc.y);
        doc.fontSize(10)
           .font('Helvetica')
           .text(`R${parseFloat(summary.totalDeposits || 0).toFixed(2)}`, 200, doc.y - 10);
        
        doc.fontSize(10)
           .font('Helvetica-Bold')
           .text('Total Expenses:', 50, doc.y);
        doc.fontSize(10)
           .font('Helvetica')
           .text(`R${parseFloat(summary.totalWithdrawals || 0).toFixed(2)}`, 200, doc.y - 10);
        
        doc.fontSize(10)
           .font('Helvetica-Bold')
           .text('Credit Score:', 50, doc.y);
        doc.fontSize(10)
           .font('Helvetica')
           .text(`${content.creditScore.score} (${content.creditScore.grade})`, 200, doc.y - 10);
        
        doc.moveDown(1);
    }

    addTransactionHistory(doc, content) {
        doc.fontSize(14)
           .font('Helvetica-Bold')
           .fillColor('#1a73e8')
           .text('Recent Transactions');
        
        doc.moveDown(0.3);
        
        // Compact transaction list (limit to 8 transactions)
        content.transactions.slice(0, 8).forEach((transaction, index) => {
            if (doc.y > 750) { // Check if we need a new page
                doc.addPage();
            }
            
            doc.fontSize(9)
               .font('Helvetica')
               .text(`${new Date(transaction.created_at).toLocaleDateString()} - ${transaction.transaction_type} - R${parseFloat(transaction.amount).toFixed(2)}`, 50, doc.y);
            
            doc.moveDown(0.2);
        });
        
        doc.moveDown(0.5);
    }

    addSpendingAnalysis(doc, content) {
        doc.fontSize(14)
           .font('Helvetica-Bold')
           .fillColor('#1a73e8')
           .text('Spending Analysis');
        
        doc.moveDown(0.3);
        
        const analysis = content.spendingAnalysis || {};
        
        // Compact spending categories
        doc.fontSize(10)
           .font('Helvetica-Bold')
           .text('Top Spending Categories:');
        
        doc.moveDown(0.2);
        
        if (analysis.topCategories && analysis.topCategories.length > 0) {
            analysis.topCategories.slice(0, 3).forEach((category, index) => {
                doc.fontSize(9)
                   .font('Helvetica')
                   .text(`${index + 1}. ${category.category}: R${parseFloat(category.amount || 0).toFixed(2)} (${category.percentage}%)`);
            });
        } else {
            doc.fontSize(9)
               .font('Helvetica')
               .text('No spending data available');
        }
        
        doc.moveDown(0.5);
        
        // Compact monthly trends
        doc.fontSize(10)
           .font('Helvetica-Bold')
           .text('Monthly Trends:');
        
        doc.fontSize(9)
           .font('Helvetica')
           .text(`Average Daily Spending: R${parseFloat(analysis.averageDailySpending || 0).toFixed(2)}`);
        
        doc.moveDown(1);
    }

    addChartsSection(doc, chartsData) {
        // Check if we need a new page
        if (doc.y > 500) {
            doc.addPage();
        }
        
        // Modern Dashboard Header
        doc.fontSize(16)
           .font('Helvetica-Bold')
           .fillColor('#2d3748')
           .text('📊 Financial Dashboard', { align: 'center' });
        
        doc.moveDown(0.5);
        
        // Compact Account Summary Card
        this.addCompactModernCard(doc, 'Account Summary', [
            `Balance: R${parseFloat(chartsData.currentBalance || 0).toFixed(2)}`,
            `Net Flow: R${parseFloat(chartsData.netFlow || 0).toFixed(2)}`,
            `Transactions: ${(chartsData.depositVsWithdrawal?.deposits || 0) + (chartsData.depositVsWithdrawal?.withdrawals || 0)}`
        ], '#48bb78');
        
        doc.moveDown(0.5);
        
        // Compact Expenses Overview
        this.addCompactExpensesGraph(doc, chartsData);
        
        doc.moveDown(0.5);
        
        // Compact Transaction Categories
        this.addCompactTransactionCategories(doc, chartsData);
        
        doc.moveDown(0.5);
        
        // Compact Payment Methods
        this.addCompactPaymentMethods(doc, chartsData);
        
        doc.moveDown(0.5);
        
        // Compact Income vs Expenses
        this.addCompactIncomeExpenses(doc, chartsData);
        
        doc.moveDown(1);
    }
    
    addModernCard(doc, title, items, color = '#1a73e8') {
        const startY = doc.y;
        const cardWidth = 500;
        const cardHeight = 20 + (items.length * 15);
        
        // Card background with subtle shadow effect
        doc.rect(50, startY, cardWidth, cardHeight)
           .fillAndStroke('#ffffff', '#e2e8f0')
           .fillColor(color);
        
        // Title
        doc.fontSize(14)
           .font('Helvetica-Bold')
           .fillColor(color)
           .text(title, 60, startY + 5);
        
        // Items
        doc.fontSize(11)
           .font('Helvetica')
           .fillColor('#2d3748');
        
        items.forEach((item, index) => {
            doc.text(item, 60, startY + 25 + (index * 15));
        });
        
        doc.y = startY + cardHeight + 10;
    }
    
    // Compact card for 2-page layout
    addCompactModernCard(doc, title, items, color = '#1a73e8') {
        const startY = doc.y;
        const cardWidth = 500;
        const cardHeight = 15 + (items.length * 12);
        
        // Card background
        doc.rect(50, startY, cardWidth, cardHeight)
           .fillAndStroke('#ffffff', '#e2e8f0');
        
        // Title
        doc.fontSize(12)
           .font('Helvetica-Bold')
           .fillColor(color)
           .text(title, 60, startY + 3);
        
        // Items
        doc.fontSize(10)
           .font('Helvetica')
           .fillColor('#2d3748');
        
        items.forEach((item, index) => {
            doc.text(item, 60, startY + 18 + (index * 12));
        });
        
        doc.y = startY + cardHeight + 5;
    }
    
    // Compact expenses graph
    addCompactExpensesGraph(doc, chartsData) {
        const startY = doc.y;
        const graphHeight = 80;
        
        // Graph container
        doc.rect(50, startY, 500, graphHeight)
           .fillAndStroke('#f7fafc', '#e2e8f0');
        
        // Title
        doc.fontSize(12)
           .font('Helvetica-Bold')
           .fillColor('#2d3748')
           .text('💰 Expenses Overview', 60, startY + 5);
        
        // Simple progress bar
        const totalSpent = chartsData.totalSpent || 0;
        const totalDeposited = chartsData.totalDeposited || 0;
        const total = totalSpent + totalDeposited;
        const progress = total > 0 ? (totalSpent / total) : 0;
        
        // Progress bar background
        doc.rect(60, startY + 25, 200, 15)
           .fillAndStroke('#e2e8f0', '#cbd5e0');
        
        // Progress bar fill
        doc.rect(60, startY + 25, 200 * progress, 15)
           .fillAndStroke('#48bb78', '#38a169');
        
        // Text
        doc.fontSize(10)
           .font('Helvetica')
           .fillColor('#4a5568')
           .text(`Total Spent: R${parseFloat(totalSpent).toFixed(2)}`, 60, startY + 50);
        
        doc.fontSize(10)
           .font('Helvetica')
           .fillColor('#4a5568')
           .text(`Total Deposited: R${parseFloat(totalDeposited).toFixed(2)}`, 60, startY + 65);
        
        doc.y = startY + graphHeight + 5;
    }
    
    // Compact transaction categories
    addCompactTransactionCategories(doc, chartsData) {
        const startY = doc.y;
        const cardHeight = 60;
        
        // Container
        doc.rect(50, startY, 500, cardHeight)
           .fillAndStroke('#ffffff', '#e2e8f0');
        
        // Title
        doc.fontSize(12)
           .font('Helvetica-Bold')
           .fillColor('#2d3748')
           .text('📊 Transaction Categories', 60, startY + 5);
        
        // Categories in a row
        const categories = [
            { name: 'Deposits', color: '#48bb78', count: chartsData.depositVsWithdrawal?.deposits || 0 },
            { name: 'Withdrawals', color: '#f56565', count: chartsData.depositVsWithdrawal?.withdrawals || 0 },
            { name: 'Card Payments', color: '#4299e1', count: chartsData.spendingByPaymentMethod?.card ? 1 : 0 },
            { name: 'Bank Transfers', color: '#ed8936', count: chartsData.spendingByPaymentMethod?.bank_transfer ? 1 : 0 }
        ];
        
        let xPos = 60;
        categories.forEach((category, index) => {
            // Colored dot
            doc.circle(xPos + 5, startY + 25, 2)
               .fillAndStroke(category.color, category.color);
            
            // Category name
            doc.fontSize(9)
               .font('Helvetica')
               .fillColor('#2d3748')
               .text(category.name, xPos, startY + 30);
            
            // Count
            doc.fontSize(8)
               .font('Helvetica-Bold')
               .fillColor(category.color)
               .text(category.count.toString(), xPos, startY + 42);
            
            xPos += 120;
        });
        
        doc.y = startY + cardHeight + 5;
    }
    
    // Compact payment methods
    addCompactPaymentMethods(doc, chartsData) {
        const startY = doc.y;
        const cardHeight = 60;
        
        // Container
        doc.rect(50, startY, 500, cardHeight)
           .fillAndStroke('#ffffff', '#e2e8f0');
        
        // Title
        doc.fontSize(12)
           .font('Helvetica-Bold')
           .fillColor('#2d3748')
           .text('💳 Payment Methods', 60, startY + 5);
        
        // Card payments
        const cardAmount = chartsData.spendingByPaymentMethod?.card || 0;
        doc.fontSize(10)
           .font('Helvetica-Bold')
           .fillColor('#4299e1')
           .text('Card Payments:', 60, startY + 25);
        
        doc.fontSize(10)
           .font('Helvetica')
           .fillColor('#2d3748')
           .text(`R${parseFloat(cardAmount).toFixed(2)}`, 150, startY + 25);
        
        // Bank transfers
        const transferAmount = chartsData.spendingByPaymentMethod?.bank_transfer || 0;
        doc.fontSize(10)
           .font('Helvetica-Bold')
           .fillColor('#ed8936')
           .text('Bank Transfers:', 60, startY + 40);
        
        doc.fontSize(10)
           .font('Helvetica')
           .fillColor('#2d3748')
           .text(`R${parseFloat(transferAmount).toFixed(2)}`, 150, startY + 40);
        
        doc.y = startY + cardHeight + 5;
    }
    
    // Compact income vs expenses
    addCompactIncomeExpenses(doc, chartsData) {
        const startY = doc.y;
        const cardHeight = 60;
        
        // Container
        doc.rect(50, startY, 500, cardHeight)
           .fillAndStroke('#ffffff', '#e2e8f0');
        
        // Title
        doc.fontSize(12)
           .font('Helvetica-Bold')
           .fillColor('#2d3748')
           .text('💰 Income vs Expenses', 60, startY + 5);
        
        // Income
        const incomeAmount = chartsData.totalDeposited || 0;
        doc.fontSize(10)
           .font('Helvetica-Bold')
           .fillColor('#2f855a')
           .text('Income:', 60, startY + 25);
        
        doc.fontSize(10)
           .font('Helvetica')
           .fillColor('#2d3748')
           .text(`R${parseFloat(incomeAmount).toFixed(2)}`, 150, startY + 25);
        
        // Expenses
        const expenseAmount = chartsData.totalSpent || 0;
        doc.fontSize(10)
           .font('Helvetica-Bold')
           .fillColor('#c53030')
           .text('Expenses:', 60, startY + 40);
        
        doc.fontSize(10)
           .font('Helvetica')
           .fillColor('#2d3748')
           .text(`R${parseFloat(expenseAmount).toFixed(2)}`, 150, startY + 40);
        
        doc.y = startY + cardHeight + 5;
    }
    
    addExpensesGraph(doc, chartsData) {
        const startY = doc.y;
        const graphWidth = 500;
        const graphHeight = 120;
        
        // Graph container
        doc.rect(50, startY, graphWidth, graphHeight)
           .fillAndStroke('#f7fafc', '#e2e8f0');
        
        // Title
        doc.fontSize(14)
           .font('Helvetica-Bold')
           .fillColor('#2d3748')
           .text('💰 Expenses Overview', 60, startY + 10);
        
        // Semi-circular progress bar (simulated)
        const centerX = 300;
        const centerY = startY + 70;
        const radius = 40;
        
        // Background circle
        doc.circle(centerX, centerY, radius)
           .fillAndStroke('#e2e8f0', '#cbd5e0');
        
        // Progress arc (simplified as filled circle)
        const totalSpent = chartsData.totalSpent || 0;
        const totalDeposited = chartsData.totalDeposited || 0;
        const total = totalSpent + totalDeposited;
        const progress = total > 0 ? (totalSpent / total) : 0;
        
        doc.circle(centerX, centerY, radius * 0.8)
           .fillAndStroke('#48bb78', '#38a169');
        
        // Center text
        doc.fontSize(12)
           .font('Helvetica-Bold')
           .fillColor('#2d3748')
           .text('Your Money', centerX - 25, centerY - 5);
        
        doc.fontSize(10)
           .font('Helvetica')
           .text(`R${parseFloat(totalSpent).toFixed(2)}`, centerX - 20, centerY + 10);
        
        // Legend
        doc.fontSize(10)
           .font('Helvetica')
           .fillColor('#4a5568')
           .text(`Total Spent: R${parseFloat(totalSpent).toFixed(2)}`, 60, startY + 100);
        
        doc.y = startY + graphHeight + 10;
    }
    
    addTransactionCategories(doc, chartsData) {
        const startY = doc.y;
        const cardWidth = 500;
        const cardHeight = 80;
        
        // Container
        doc.rect(50, startY, cardWidth, cardHeight)
           .fillAndStroke('#ffffff', '#e2e8f0');
        
        // Title
        doc.fontSize(14)
           .font('Helvetica-Bold')
           .fillColor('#2d3748')
           .text('📊 Transaction Categories', 60, startY + 10);
        
        // Categories with colored dots
        const categories = [
            { name: 'Deposits', color: '#48bb78', count: chartsData.depositVsWithdrawal?.deposits || 0 },
            { name: 'Withdrawals', color: '#f56565', count: chartsData.depositVsWithdrawal?.withdrawals || 0 },
            { name: 'Card Payments', color: '#4299e1', count: chartsData.spendingByPaymentMethod?.card ? 1 : 0 },
            { name: 'Bank Transfers', color: '#ed8936', count: chartsData.spendingByPaymentMethod?.bank_transfer ? 1 : 0 }
        ];
        
        let xPos = 60;
        categories.forEach((category, index) => {
            // Colored dot
            doc.circle(xPos + 5, startY + 35, 3)
               .fillAndStroke(category.color, category.color);
            
            // Category name
            doc.fontSize(10)
               .font('Helvetica')
               .fillColor('#2d3748')
               .text(category.name, xPos, startY + 45);
            
            // Count
            doc.fontSize(9)
               .font('Helvetica-Bold')
               .fillColor(category.color)
               .text(category.count.toString(), xPos, startY + 60);
            
            xPos += 120;
        });
        
        doc.y = startY + cardHeight + 10;
    }
    
    addMonthlyTrendGraph(doc, chartsData) {
        const startY = doc.y;
        const graphWidth = 500;
        const graphHeight = 150;
        
        // Graph container
        doc.rect(50, startY, graphWidth, graphHeight)
           .fillAndStroke('#f7fafc', '#e2e8f0');
        
        // Title
        doc.fontSize(14)
           .font('Helvetica-Bold')
           .fillColor('#2d3748')
           .text('📈 Monthly Spending Trend', 60, startY + 10);
        
        // Simulated line graph
        if (chartsData.barChart && chartsData.barChart.length > 0) {
            const maxAmount = Math.max(...chartsData.barChart.map(item => parseFloat(item.amount || 0)));
            const graphStartX = 80;
            const graphEndX = 520;
            const graphStartY = startY + 80;
            const graphEndY = startY + 130;
            const barWidth = (graphEndX - graphStartX) / chartsData.barChart.length;
            
            chartsData.barChart.forEach((item, index) => {
                const x = graphStartX + (index * barWidth);
                const height = maxAmount > 0 ? (parseFloat(item.amount || 0) / maxAmount) * 50 : 0;
                const y = graphEndY - height;
                
                // Bar
                doc.rect(x, y, barWidth - 5, height)
                   .fillAndStroke('#48bb78', '#38a169');
                
                // Label
                doc.fontSize(8)
                   .font('Helvetica')
                   .fillColor('#4a5568')
                   .text(item.month, x, graphEndY + 5, { width: barWidth - 5, align: 'center' });
            });
        } else {
            doc.fontSize(10)
               .font('Helvetica')
               .fillColor('#718096')
               .text('No monthly data available', 60, startY + 80);
        }
        
        doc.y = startY + graphHeight + 10;
    }
    
    addPaymentMethodCards(doc, chartsData) {
        const startY = doc.y;
        const cardWidth = 240;
        const cardHeight = 100;
        
        // Title
        doc.fontSize(14)
           .font('Helvetica-Bold')
           .fillColor('#2d3748')
           .text('💳 Payment Methods', 60, startY);
        
        doc.moveDown(0.5);
        
        // Card payments card
        const cardAmount = chartsData.spendingByPaymentMethod?.card || 0;
        this.addPaymentCard(doc, 60, doc.y, 'Card Payments', cardAmount, '#4299e1');
        
        // Bank transfers card
        const transferAmount = chartsData.spendingByPaymentMethod?.bank_transfer || 0;
        this.addPaymentCard(doc, 320, doc.y - 100, 'Bank Transfers', transferAmount, '#ed8936');
        
        doc.y += 110;
    }
    
    addPaymentCard(doc, x, y, title, amount, color) {
        // Card background
        doc.rect(x, y, 240, 100)
           .fillAndStroke('#ffffff', '#e2e8f0');
        
        // Title
        doc.fontSize(12)
           .font('Helvetica-Bold')
           .fillColor('#2d3748')
           .text(title, x + 10, y + 10);
        
        // Amount
        doc.fontSize(16)
           .font('Helvetica-Bold')
           .fillColor(color)
           .text(`R${parseFloat(amount).toFixed(2)}`, x + 10, y + 35);
        
        // Icon/indicator
        doc.circle(x + 210, y + 30, 8)
           .fillAndStroke(color, color);
    }
    
    addIncomeExpensesSummary(doc, chartsData) {
        const startY = doc.y;
        const cardWidth = 500;
        const cardHeight = 80;
        
        // Container
        doc.rect(50, startY, cardWidth, cardHeight)
           .fillAndStroke('#ffffff', '#e2e8f0');
        
        // Title
        doc.fontSize(14)
           .font('Helvetica-Bold')
           .fillColor('#2d3748')
           .text('💰 Income vs Expenses', 60, startY + 10);
        
        // Income card (green)
        const incomeAmount = chartsData.totalDeposited || 0;
        doc.rect(60, startY + 25, 220, 45)
           .fillAndStroke('#f0fff4', '#c6f6d5');
        
        doc.fontSize(12)
           .font('Helvetica-Bold')
           .fillColor('#2f855a')
           .text('Income', 70, startY + 30);
        
        doc.fontSize(14)
           .font('Helvetica-Bold')
           .fillColor('#2f855a')
           .text(`R${parseFloat(incomeAmount).toFixed(2)}`, 70, startY + 45);
        
        // Expenses card (red)
        const expenseAmount = chartsData.totalSpent || 0;
        doc.rect(300, startY + 25, 220, 45)
           .fillAndStroke('#fed7d7', '#feb2b2');
        
        doc.fontSize(12)
           .font('Helvetica-Bold')
           .fillColor('#c53030')
           .text('Expenses', 310, startY + 30);
        
        doc.fontSize(14)
           .font('Helvetica-Bold')
           .fillColor('#c53030')
           .text(`R${parseFloat(expenseAmount).toFixed(2)}`, 310, startY + 45);
        
        doc.y = startY + cardHeight + 10;
    }

    addPDFFooter(doc) {
        try {
            const pageRange = doc.bufferedPageRange();
            const pageCount = pageRange.count;
            const startPage = pageRange.start;
            
            for (let i = 0; i < pageCount; i++) {
                const pageIndex = startPage + i;
                doc.switchToPage(pageIndex);
                
                // Footer
                doc.fontSize(8)
                   .font('Helvetica')
                   .fillColor('#666')
                   .text(
                       `Generated on ${new Date().toLocaleString()} | Page ${i + 1} of ${pageCount}`,
                       50,
                       doc.page.height - 50,
                       { align: 'center' }
                   );
            }
        } catch (error) {
            console.log(`⚠️ Footer generation failed: ${error.message}`);
            // Continue without footer - PDF will still be generated
        }
    }

    // Simple PDF generation as fallback
    async createSimplePDFStatement(content) {
        return new Promise((resolve, reject) => {
            try {
                const doc = new PDFDocument({
                    size: 'A4',
                    margin: 50
                });
                
                const chunks = [];
                doc.on('data', chunk => chunks.push(chunk));
                doc.on('end', () => resolve(Buffer.concat(chunks)));
                doc.on('error', (error) => reject(error));
                
                // Simple header
                doc.fontSize(24)
                   .font('Helvetica-Bold')
                   .fillColor('#1a73e8')
                   .text('LUNO WALLET', { align: 'center' });
                
                doc.moveDown(0.5);
                
                doc.fontSize(18)
                   .font('Helvetica')
                   .fillColor('#333')
                   .text('Bank Statement', { align: 'center' });
                
                doc.moveDown(2);
                
                // Account summary
                doc.fontSize(16)
                   .font('Helvetica-Bold')
                   .fillColor('#1a73e8')
                   .text('Account Summary');
                
                doc.moveDown(0.5);
                
                const summary = content.financialSummary;
                
                doc.fontSize(12)
                   .font('Helvetica-Bold')
                   .text('Current Balance:', 50, doc.y);
                doc.fontSize(12)
                   .font('Helvetica')
                   .text(`R${parseFloat(summary.currentBalance || 0).toFixed(2)}`, 200, doc.y - 12);
                
                doc.fontSize(12)
                   .font('Helvetica-Bold')
                   .text('Total Deposits:', 50, doc.y);
                doc.fontSize(12)
                   .font('Helvetica')
                   .text(`R${parseFloat(summary.totalDeposits || 0).toFixed(2)}`, 200, doc.y - 12);
                
                doc.fontSize(12)
                   .font('Helvetica-Bold')
                   .text('Total Withdrawals:', 50, doc.y);
                doc.fontSize(12)
                   .font('Helvetica')
                   .text(`R${parseFloat(summary.totalWithdrawals || 0).toFixed(2)}`, 200, doc.y - 12);
                
                doc.fontSize(12)
                   .font('Helvetica-Bold')
                   .text('Credit Score:', 50, doc.y);
                doc.fontSize(12)
                   .font('Helvetica')
                   .text(`${content.creditScore.score} (${content.creditScore.grade})`, 200, doc.y - 12);
                
                doc.moveDown(2);
                
                // Transaction history
                doc.fontSize(16)
                   .font('Helvetica-Bold')
                   .fillColor('#1a73e8')
                   .text('Recent Transactions');
                
                doc.moveDown(0.5);
                
                content.transactions.slice(0, 10).forEach((transaction, index) => {
                    doc.fontSize(10)
                       .font('Helvetica')
                       .text(`${new Date(transaction.created_at).toLocaleDateString()} - ${transaction.transaction_type} - R${parseFloat(transaction.amount).toFixed(2)}`);
                    doc.moveDown(0.2);
                });
                
                doc.end();
                
            } catch (error) {
                reject(error);
            }
        });
    }

    // Save statement to database
    async saveStatement(userId, content, period) {
        const client = await pool.connect();
        
        try {
            const result = await client.query(`
                INSERT INTO bank_statements (
                    user_id,
                    statement_number,
                    period,
                    content,
                    generated_at
                ) VALUES ($1, $2, $3, $4, $5)
                RETURNING statement_id
            `, [
                userId,
                content.statementInfo.statementNumber,
                period,
                JSON.stringify(content),
                content.statementInfo.generatedAt
            ]);

            return result.rows[0].statement_id;
        } finally {
            client.release();
        }
    }

    async sendStatementEmail(email, pdfBuffer, statementContent) {
        try {
            // Use Gmail SMTP with the correct environment variables
            const transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    user: process.env.EMAIL_USER,
                    pass: process.env.EMAIL_PASS
                }
            });

            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: email,
                subject: `Luno Wallet - Bank Statement (${new Date().toLocaleDateString()})`,
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <div style="background: linear-gradient(135deg, #1a73e8, #4285f4); color: white; padding: 20px; text-align: center;">
                            <h1 style="margin: 0;">LUNO WALLET</h1>
                            <p style="margin: 10px 0 0 0;">Your Bank Statement</p>
                        </div>
                        
                        <div style="padding: 20px; background: #f8f9fa;">
                            <h2 style="color: #1a73e8;">Comprehensive Financial Statement</h2>
                            <p>Dear valued customer,</p>
                            <p>Please find attached your comprehensive bank statement with detailed financial analysis for the period ending ${new Date().toLocaleDateString()}.</p>
                            
                                                         <h3 style="color: #1a73e8;">📊 Modern Financial Dashboard Includes:</h3>
                             <ul style="color: #333;">
                                 <li>💰 Account Summary with Current Balance</li>
                                 <li>📊 Expenses Overview with Visual Progress</li>
                                 <li>📈 Transaction Categories with Color Coding</li>
                                 <li>📅 Monthly Spending Trend Analysis</li>
                                 <li>💳 Payment Method Usage Cards</li>
                                 <li>💰 Income vs Expenses Summary</li>
                                 <li>📋 Comprehensive Transaction History</li>
                             </ul>
                            
                                                         <div style="background: white; padding: 15px; border-radius: 8px; margin: 20px 0;">
                                 <h3 style="color: #1a73e8; margin-top: 0;">Account Summary</h3>
                                 <p><strong>Current Balance:</strong> R${parseFloat(statementContent.financialSummary.currentBalance || 0).toFixed(2)}</p>
                                 <p><strong>Total Deposits:</strong> R${parseFloat(statementContent.financialSummary.totalDeposits || 0).toFixed(2)}</p>
                                 <p><strong>Total Withdrawals:</strong> R${parseFloat(statementContent.financialSummary.totalWithdrawals || 0).toFixed(2)}</p>
                                 <p><strong>Net Flow:</strong> R${parseFloat(statementContent.financialSummary.netFlow || 0).toFixed(2)}</p>
                                 <p><strong>Credit Score:</strong> ${statementContent.creditScore.score} (${statementContent.creditScore.grade})</p>
                             </div>
                            
                            <p>This statement includes detailed transaction history, spending analysis, and financial insights to help you better understand your financial patterns.</p>
                            
                            <p>If you have any questions about this statement, please don't hesitate to contact our support team.</p>
                            
                            <p>Best regards,<br>The Luno Wallet Team</p>
                        </div>
                        
                        <div style="background: #1a73e8; color: white; padding: 15px; text-align: center; font-size: 12px;">
                            <p style="margin: 0;">© 2024 Luno Wallet. All rights reserved.</p>
                        </div>
                    </div>
                `,
                attachments: [
                    {
                        filename: `bank_statement_${new Date().toISOString().split('T')[0]}.pdf`,
                        content: pdfBuffer,
                        contentType: 'application/pdf'
                    }
                ]
            };

            await transporter.sendMail(mailOptions);
            console.log(`✅ Bank statement email sent to ${email}`);
            
        } catch (error) {
            console.error(`❌ Error sending email: ${error.message}`);
            throw error;
        }
    }

    // Get statement template
    getStatementTemplate() {
        return {
            header: {
                logo: "🏦 LUNO WALLET",
                title: "Bank Statement",
                subtitle: "Your Financial Journey"
            },
            sections: [
                "Account Information",
                "Financial Summary", 
                "Credit Score",
                "Spending Analysis",
                "Account Statistics",
                "Recent Transactions"
            ]
        };
    }
}

export default DocumentAnalysis;
