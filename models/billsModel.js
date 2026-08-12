import pool from '../auth/db.js';
import crypto from 'crypto';

class BillsModel {
    constructor() {
        this.pool = pool;
    }

    // Generate a unique recharge code for airtime
    generateRechargeCode() {
        const timestamp = Date.now().toString().slice(-6);
        const random = crypto.randomBytes(3).toString('hex').toUpperCase();
        return `RCH${timestamp}${random}`;
    }

    // Validate South African phone number
    validatePhoneNumber(phoneNumber) {
        // Remove all non-digit characters
        const cleaned = phoneNumber.replace(/\D/g, '');
        
        // South African phone number patterns:
        // 0XX XXX XXXX (10 digits starting with 0)
        // 27XX XXX XXXX (12 digits starting with 27)
        // +27XX XXX XXXX (13 characters starting with +27)
        
        if (cleaned.length === 10 && cleaned.startsWith('0')) {
            return cleaned;
        } else if (cleaned.length === 12 && cleaned.startsWith('27')) {
            return '0' + cleaned.slice(2);
        } else if (cleaned.length === 13 && cleaned.startsWith('27')) {
            return '0' + cleaned.slice(2);
        }
        
        return null;
    }

    // Validate meter number for electricity (10 digits)
    validateElectricityMeter(meterNumber) {
        const cleaned = meterNumber.replace(/\D/g, '');
        return cleaned.length === 10 ? cleaned : null;
    }

    // Validate meter number for water (5 digits)
    validateWaterMeter(meterNumber) {
        const cleaned = meterNumber.replace(/\D/g, '');
        return cleaned.length === 5 ? cleaned : null;
    }

    // Create a new bill payment record
    async createBillPayment(billData) {
        const client = await this.pool.connect();
        
        try {
            await client.query('BEGIN');

            // Get user's account
            const accountResult = await client.query(`
                SELECT account_id FROM accounts 
                WHERE user_id = $1 AND is_active = true 
                LIMIT 1
            `, [billData.user_id]);
            
            if (accountResult.rows.length === 0) {
                throw new Error('User account not found');
            }
            
            const accountId = accountResult.rows[0].account_id;
            
            // Get bills payment category
            const categoryResult = await client.query(`
                SELECT category_id FROM transaction_categories 
                WHERE category_name = 'bills_payment'
            `);
            
            if (categoryResult.rows.length === 0) {
                throw new Error('Bills payment category not found');
            }
            
            const categoryId = categoryResult.rows[0].category_id;

            // Insert into transactions table
            const transactionResult = await client.query(`
                INSERT INTO transactions 
                (user_id, account_id, category_id, reference, amount, transaction_type, status, payment_method, description, metadata)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                RETURNING transaction_id
            `, [
                billData.user_id,
                accountId,
                categoryId,
                `BILL-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                billData.amount, // Positive amount, type will be 'debit'
                'debit',
                'completed',
                'internal',
                `${billData.bill_type} payment`,
                JSON.stringify({
                    bill_type: billData.bill_type,
                    meter_number: billData.meter_number,
                    phone_number: billData.phone_number,
                    recharge_code: billData.recharge_code
                })
            ]);

            const transactionId = transactionResult.rows[0].transaction_id;

            // Insert into bills table
            const billResult = await client.query(`
                INSERT INTO bills 
                (user_id, transaction_id, bill_type, amount, meter_number, phone_number, recharge_code, status, provider)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                RETURNING bill_id
            `, [
                billData.user_id,
                transactionId,
                billData.bill_type,
                billData.amount,
                billData.meter_number,
                billData.phone_number,
                billData.recharge_code,
                'completed',
                'Luno'
            ]);

            // Update user balance in accounts table
            const balanceResult = await client.query(`
                SELECT balance FROM accounts 
                WHERE user_id = $1 AND is_active = true 
                LIMIT 1
            `, [billData.user_id]);

            const currentBalance = balanceResult.rows.length > 0 ? 
                BigInt(balanceResult.rows[0].balance) : BigInt(0);
            const newBalance = currentBalance - BigInt(billData.amount);

            // Update account balance
            await client.query(`
                UPDATE accounts 
                SET balance = $1 
                WHERE user_id = $2 AND is_active = true
            `, [newBalance.toString(), billData.user_id]);

            // Insert into transaction_movements
            await client.query(`
                INSERT INTO transaction_movements
                (transaction_id, user_id, account_id, movement_type, amount, balance_before, balance_after, description)
                VALUES ($1, $2, $3, 'debit', $4, $5, $6, $7)
            `, [
                transactionId,
                billData.user_id,
                accountId,
                billData.amount,
                currentBalance.toString(),
                newBalance.toString(),
                `${billData.bill_type.charAt(0).toUpperCase() + billData.bill_type.slice(1)} Bill Payment`
            ]);

            await client.query('COMMIT');

            return {
                bill_id: billResult.rows[0].bill_id,
                transaction_id: transactionId,
                recharge_code: billData.recharge_code
            };

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    // Get bills history for a user
    async getBillsHistory(userId, limit = 50) {
        const client = await this.pool.connect();
        
        try {
            console.log('💳 BILLS MODEL - Fetching bills for user:', userId, 'with limit:', limit);
            
            const result = await client.query(`
                SELECT 
                    t.transaction_id as bill_id,
                    t.metadata->>'bill_type' as bill_type,
                    t.amount as amount_paid,
                    t.metadata->>'meter_number' as meter_number,
                    t.metadata->>'phone_number' as phone_number,
                    t.metadata->>'recharge_code' as recharge_code,
                    CASE 
                        WHEN t.status = 'completed' THEN 'paid'
                        ELSE 'pending'
                    END as payment_status,
                    t.created_at,
                    t.reference
                FROM transactions t
                WHERE t.user_id = $1
                    AND t.metadata->>'bill_type' IS NOT NULL
                    AND t.transaction_type = 'debit'
                ORDER BY t.created_at DESC
                LIMIT $2
            `, [userId, limit]);

            console.log('💳 BILLS MODEL - Bills query result:', result.rows.length, 'bills found');
            console.log('💳 BILLS MODEL - Sample bill data:', result.rows[0] || 'No bills found');
            console.log('💳 BILLS MODEL - All raw bill data:', JSON.stringify(result.rows, null, 2));

            return result.rows.map(bill => ({
                ...bill,
                amount_display: (bill.amount_paid / 100).toFixed(2)
            }));

        } catch (error) {
            console.error('Error in getBillsHistory:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    // Get bill statistics for a user
    async getBillStats(userId) {
        const client = await this.pool.connect();
        
        try {
            const result = await client.query(`
                SELECT 
                    t.metadata->>'bill_type' as bill_type,
                    COUNT(*) as count,
                    SUM(t.amount) as total_amount
                FROM transactions t
                WHERE t.user_id = $1
                    AND t.metadata->>'bill_type' IS NOT NULL
                    AND t.transaction_type = 'debit'
                    AND t.status = 'completed'
                GROUP BY t.metadata->>'bill_type'
            `, [userId]);

            return result.rows.map(stat => ({
                bill_type: stat.bill_type,
                count: parseInt(stat.count),
                total_amount: parseInt(stat.total_amount),
                total_amount_display: (stat.total_amount / 100).toFixed(2)
            }));

        } catch (error) {
            throw error;
        } finally {
            client.release();
        }
    }

    // Check if user has sufficient balance
    async checkBalance(userId, amount) {
        const client = await this.pool.connect();
        
        try {
            const result = await client.query(`
                SELECT balance FROM accounts 
                WHERE user_id = $1 AND is_active = true
                LIMIT 1
            `, [userId]);

            const currentBalance = result.rows.length > 0 ? 
                BigInt(result.rows[0].balance) : BigInt(0);
            
            return {
                current_balance: currentBalance,
                sufficient: currentBalance >= BigInt(amount),
                balance_display: (Number(currentBalance) / 100).toFixed(2)
            };

        } catch (error) {
            throw error;
        } finally {
            client.release();
        }
    }
}

export default new BillsModel();
