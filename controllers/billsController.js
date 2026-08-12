import pool from '../auth/db.js';
import billsModel from '../models/billsModel.js';
import nodemailer from 'nodemailer';

// Email configuration
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Bills page
export const billsPage = async (req, res) => {
    if (!req.user) {
        return res.redirect('/authorized/login');
    }

    try {
        const client = await pool.connect();
        const user_id = req.user.user_id;

        // Get current balance from accounts table
        const accountRes = await client.query(`
            SELECT balance FROM accounts 
            WHERE user_id = $1 AND is_active = true 
            LIMIT 1
        `, [user_id]);

        const currentBalance = accountRes.rows.length > 0 ? 
            BigInt(accountRes.rows[0].balance) : BigInt(0);
        const displayBalance = (Number(currentBalance) / 100).toFixed(2);

        // Get recent bills
        let recentBills = [];
        let billStats = [];
        
        console.log('🏠 BILLS PAGE - Starting to fetch bills for user:', user_id);
        
        try {
            recentBills = await billsModel.getBillsHistory(user_id, 5);
            billStats = await billsModel.getBillStats(user_id);
            console.log('🏠 BILLS PAGE - Recent bills fetched:', recentBills.length, 'bills');
            console.log('🏠 BILLS PAGE - Bill stats fetched:', billStats.length, 'statistics');
            console.log('🏠 BILLS PAGE - First bill data:', recentBills[0] || 'No bills found');
            console.log('🏠 BILLS PAGE - All bills data:', JSON.stringify(recentBills, null, 2));
        } catch (billsError) {
            console.error('🏠 BILLS PAGE - Error fetching bills data:', billsError);
            // Continue with empty arrays if bills data fails
        }

        client.release();

        res.render('bills', {
            user: req.user,
            balance: displayBalance,
            recentBills: recentBills || [],
            billStats: billStats || [],
            active: 'bills'
        });

    } catch (error) {
        console.error('Bills page error:', error);
        res.status(500).send('Server error');
    }
};

// Process bill payment
export const processBillPayment = async (req, res) => {
    const { bill_type, amount, meter_number, phone_number } = req.body;
    const user_id = req.user?.user_id || req.user?.id;

    if (!user_id) {
        return res.status(401).json({ 
            success: false, 
            message: 'User not authenticated.' 
        });
    }

    if (!bill_type || !amount) {
        return res.status(400).json({ 
            success: false, 
            message: 'Bill type and amount are required.' 
        });
    }

    const paymentAmount = parseFloat(amount);
    if (isNaN(paymentAmount) || paymentAmount <= 0) {
        return res.status(400).json({ 
            success: false, 
            message: 'Invalid amount.' 
        });
    }

    const amountInCents = Math.round(paymentAmount * 100);

    try {
        // Check if user has sufficient balance
        const balanceCheck = await billsModel.checkBalance(user_id, amountInCents);
        if (!balanceCheck.sufficient) {
            return res.status(400).json({
                success: false,
                message: `Insufficient balance. Current balance: R${balanceCheck.balance_display}`
            });
        }

        // Validate inputs based on bill type
        let validatedInput = null;
        let rechargeCode = null;

        switch (bill_type) {
            case 'electricity':
                if (!meter_number) {
                    return res.status(400).json({
                        success: false,
                        message: 'Meter number is required for electricity bills.'
                    });
                }
                validatedInput = billsModel.validateElectricityMeter(meter_number);
                if (!validatedInput) {
                    return res.status(400).json({
                        success: false,
                        message: 'Invalid meter number. Must be exactly 10 digits.'
                    });
                }
                break;

            case 'water':
                if (!meter_number) {
                    return res.status(400).json({
                        success: false,
                        message: 'Meter number is required for water bills.'
                    });
                }
                validatedInput = billsModel.validateWaterMeter(meter_number);
                if (!validatedInput) {
                    return res.status(400).json({
                        success: false,
                        message: 'Invalid meter number. Must be exactly 5 digits.'
                    });
                }
                break;

            case 'airtime':
                if (!phone_number) {
                    return res.status(400).json({
                        success: false,
                        message: 'Phone number is required for airtime recharge.'
                    });
                }
                validatedInput = billsModel.validatePhoneNumber(phone_number);
                if (!validatedInput) {
                    return res.status(400).json({
                        success: false,
                        message: 'Invalid phone number. Please enter a valid South African phone number.'
                    });
                }
                rechargeCode = billsModel.generateRechargeCode();
                break;

            default:
                return res.status(400).json({
                    success: false,
                    message: 'Invalid bill type.'
                });
        }

        // Prepare bill data
        const billData = {
            user_id: user_id,
            bill_type: bill_type,
            amount: amountInCents,
            meter_number: bill_type === 'airtime' ? null : validatedInput,
            phone_number: bill_type === 'airtime' ? validatedInput : null,
            recharge_code: rechargeCode
        };

        // Process the payment
        const result = await billsModel.createBillPayment(billData);

        // Send email with recharge code for airtime
        if (bill_type === 'airtime' && rechargeCode) {
            try {
                await sendRechargeCodeEmail(req.user.email, validatedInput, rechargeCode, paymentAmount);
            } catch (emailError) {
                console.error('Error sending recharge code email:', emailError);
                // Don't fail the transaction for email errors
            }
        }

        // Add header to indicate limits should be refreshed
        res.set('X-Refresh-Limits', 'true');
        
        res.json({
            success: true,
            message: `${bill_type.charAt(0).toUpperCase() + bill_type.slice(1)} bill payment successful!`,
            data: {
                bill_id: result.bill_id,
                transaction_id: result.transaction_id,
                recharge_code: result.recharge_code,
                amount_paid: paymentAmount.toFixed(2)
            }
        });

    } catch (error) {
        console.error('Bill payment error:', error);
        res.status(500).json({
            success: false,
            message: 'Payment processing failed. Please try again.'
        });
    }
};

// Get bills history
export const getBillsHistory = async (req, res) => {
    const user_id = req.user?.user_id || req.user?.id;
    const limit = parseInt(req.query.limit) || 50;

    if (!user_id) {
        return res.status(401).json({ 
            success: false, 
            message: 'User not authenticated.' 
        });
    }

    try {
        const bills = await billsModel.getBillsHistory(user_id, limit);
        
        res.json({
            success: true,
            data: bills
        });

    } catch (error) {
        console.error('Get bills history error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve bills history.'
        });
    }
};

// Send recharge code email
async function sendRechargeCodeEmail(userEmail, phoneNumber, rechargeCode, amount) {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        console.log('Email service not configured, skipping recharge code email');
        return;
    }

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: userEmail,
        subject: 'Airtime Recharge Code - Luno',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #2c3e50;">Airtime Recharge Successful!</h2>
                
                <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <h3 style="color: #27ae60; margin-top: 0;">Recharge Details</h3>
                    <p><strong>Phone Number:</strong> ${phoneNumber}</p>
                    <p><strong>Amount:</strong> R${amount.toFixed(2)}</p>
                    <p><strong>Recharge Code:</strong> <span style="font-size: 18px; font-weight: bold; color: #e74c3c;">${rechargeCode}</span></p>
                </div>
                
                <div style="background-color: #fff3cd; padding: 15px; border-radius: 5px; border-left: 4px solid #ffc107;">
                    <p style="margin: 0;"><strong>Important:</strong> Use this recharge code to complete your airtime purchase. The code is valid for 24 hours.</p>
                </div>
                
                <p style="color: #7f8c8d; font-size: 14px; margin-top: 30px;">
                    Thank you for using Luno for your airtime recharge!
                </p>
            </div>
        `
    };

    await transporter.sendMail(mailOptions);
    console.log(`Recharge code email sent to ${userEmail} for phone ${phoneNumber}`);
}

// Get bill statistics
export const getBillStats = async (req, res) => {
    const user_id = req.user?.user_id || req.user?.id;

    if (!user_id) {
        return res.status(401).json({ 
            success: false, 
            message: 'User not authenticated.' 
        });
    }

    try {
        const stats = await billsModel.getBillStats(user_id);
        
        res.json({
            success: true,
            data: stats
        });

    } catch (error) {
        console.error('Get bill stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve bill statistics.'
        });
    }
};
