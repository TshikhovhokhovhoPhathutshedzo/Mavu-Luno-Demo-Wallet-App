import pool from '../auth/db.js';

export const statementPage = async (req, res) => {
  const client = await pool.connect();
  const user_id = req.user.user_id;

  try {
    console.log('Bank statement page requested for user:', user_id);

    // Get current balance
    const balanceRes = await client.query(`
      SELECT balance_after FROM transaction_movements 
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `, [user_id]);

    const currentBalance = balanceRes.rowCount > 0 ? 
      Number(balanceRes.rows[0].balance_after) / 100 : 0;

    // Get user account information
    const userRes = await client.query(`
      SELECT username, email, account_number, updated_at
      FROM luno_users 
      WHERE user_id = $1
    `, [user_id]);

    const user = userRes.rows[0];
    
    if (!user) {
      throw new Error('User not found');
    }

    // Get transaction history for the last 6 months
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const transactionsRes = await client.query(`
      SELECT 
        transaction_id,
        reference,
        amount,
        currency,
        transaction_type,
        status,
        payment_method,
        metadata,
        TO_CHAR(created_at, 'YYYY-MM-DD') as transaction_date,
        TO_CHAR(created_at, 'HH24:MI:SS') as transaction_time,
        created_at
      FROM transactions
      WHERE user_id = $1 
        AND created_at >= $2
        AND status = 'completed'
      ORDER BY created_at DESC
    `, [user_id, sixMonthsAgo]);

    // Get monthly summary
    const monthlySummary = await client.query(`
      SELECT 
        TO_CHAR(created_at, 'YYYY-MM') as month,
        SUM(CASE WHEN transaction_type = 'deposit' THEN amount ELSE 0 END) as total_income,
        SUM(CASE WHEN transaction_type = 'withdrawal' THEN amount ELSE 0 END) as total_expenses,
        COUNT(*) as transaction_count
      FROM transactions
      WHERE user_id = $1 
        AND created_at >= $2
        AND status = 'completed'
      GROUP BY TO_CHAR(created_at, 'YYYY-MM')
      ORDER BY month DESC
    `, [user_id, sixMonthsAgo]);

    // Process transactions for display
    const transactions = (transactionsRes.rows || []).map(transaction => {
      // Parse metadata if it's a string, otherwise use as-is
      let metadata = {};
      try {
        if (transaction.metadata) {
          if (typeof transaction.metadata === 'string') {
            metadata = JSON.parse(transaction.metadata);
          } else if (typeof transaction.metadata === 'object') {
            metadata = transaction.metadata;
          }
        }
      } catch (e) {
        console.log('Error parsing metadata in statement:', e);
        metadata = {};
      }

      return {
        ...transaction,
        amount: (Number(transaction.amount) / 100).toFixed(2), // Convert from cents to rands
        formatted_date: new Date(transaction.created_at).toLocaleDateString('en-ZA', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        }),
        metadata: metadata // Ensure metadata is properly parsed
      };
    });

    // Process monthly summary
    const monthlyData = (monthlySummary.rows || []).map(month => ({
      ...month,
      total_income: (Number(month.total_income) / 100).toFixed(2),
      total_expenses: (Number(month.total_expenses) / 100).toFixed(2)
    }));

    // Calculate totals
    const totalIncome = (transactionsRes.rows || [])
      .filter(t => t.transaction_type === 'deposit')
      .reduce((sum, t) => sum + Number(t.amount), 0) / 100;

    const totalExpenses = (transactionsRes.rows || [])
      .filter(t => t.transaction_type === 'withdrawal')
      .reduce((sum, t) => sum + Number(t.amount), 0) / 100;

    const netAmount = totalIncome - totalExpenses;

    res.render("statement", {
      user: req.user,
      active: "statement",
      currentBalance: currentBalance.toFixed(2),
      accountInfo: user,
      transactions: transactions,
      monthlyData: monthlyData,
      summary: {
        totalIncome: totalIncome.toFixed(2),
        totalExpenses: totalExpenses.toFixed(2),
        netAmount: netAmount.toFixed(2),
        transactionCount: transactions.length
      },
      statementPeriod: {
        from: sixMonthsAgo.toLocaleDateString('en-ZA'),
        to: new Date().toLocaleDateString('en-ZA')
      }
    });

  } catch (error) {
    console.error('Statement page error:', error);
    res.status(500).send("Server error");
  } finally {
    client.release();
  }
};

export const generateStatementPDF = async (req, res) => {
  const client = await pool.connect();
  const user_id = req.user.user_id;
  const { period = '6months' } = req.body;

  try {
    console.log('PDF statement generation requested for user:', user_id, 'period:', period);
    
    // Import DocumentAnalysis dynamically to avoid circular dependencies
    const { default: DocumentAnalysis } = await import('../models/documentAnalysis.js');
    const documentAnalysis = new DocumentAnalysis();
    
    // Generate bank statement
    const result = await documentAnalysis.generateBankStatement(user_id, period);
    
    if (result.success) {
      res.json({
        success: true,
        message: 'Statement sent successfully! Check your email for the PDF.',
        statementId: result.statementId
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to generate bank statement. Please try again.'
      });
    }
    
  } catch (error) {
    console.error('PDF statement generation error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating bank statement. Please try again later.'
    });
  } finally {
    client.release();
  }
};
