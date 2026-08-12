import pool from '../auth/db.js';

export const analyticsPage = async (req, res) => {
  const client = await pool.connect();
  const user_id = req.user.user_id;

  try {
    console.log('📊 Analytics page requested for user:', user_id);
    console.log('User object:', req.user);

    // Get current balance from accounts table
    const balanceRes = await client.query(`
      SELECT balance FROM accounts 
      WHERE user_id = $1 AND is_active = true
      LIMIT 1
    `, [user_id]);

    const currentBalance = balanceRes.rowCount > 0 ? 
      Number(balanceRes.rows[0].balance) / 100 : 0;

    // Get transaction data for the last 6 months
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    // Get comprehensive monthly data with proper transaction types
    const monthlyData = await client.query(`
      SELECT 
        TO_CHAR(created_at, 'YYYY-MM') as month,
        transaction_type,
        SUM(amount) as total_amount,
        COUNT(*) as transaction_count
      FROM transactions
      WHERE user_id = $1 
        AND created_at >= $2
        AND status = 'completed'
      GROUP BY TO_CHAR(created_at, 'YYYY-MM'), transaction_type
      ORDER BY month DESC
    `, [user_id, sixMonthsAgo]);

    // Get spending by category with proper categorization
    const categoryData = await client.query(`
      SELECT 
        CASE 
          WHEN metadata->>'bill_type' IS NOT NULL THEN 
            CASE metadata->>'bill_type'
              WHEN 'electricity' THEN 'Electricity Bills'
              WHEN 'water' THEN 'Water Bills'
              WHEN 'airtime' THEN 'Airtime'
              ELSE 'Other Bills'
            END
          WHEN payment_method = 'card' THEN 'Card Payments'
          WHEN payment_method = 'internal' THEN 'Internal Transfers'
          WHEN payment_method = 'bank_transfer' THEN 'Bank Transfers'
          ELSE COALESCE(payment_method, 'Other')
        END as category,
        SUM(amount) as total_amount,
        COUNT(*) as transaction_count
      FROM transactions
      WHERE user_id = $1 
        AND created_at >= $2
        AND transaction_type = 'debit'
        AND status = 'completed'
      GROUP BY 
        CASE 
          WHEN metadata->>'bill_type' IS NOT NULL THEN 
            CASE metadata->>'bill_type'
              WHEN 'electricity' THEN 'Electricity Bills'
              WHEN 'water' THEN 'Water Bills'
              WHEN 'airtime' THEN 'Airtime'
              ELSE 'Other Bills'
            END
          WHEN payment_method = 'card' THEN 'Card Payments'
          WHEN payment_method = 'internal' THEN 'Internal Transfers'
          WHEN payment_method = 'bank_transfer' THEN 'Bank Transfers'
          ELSE COALESCE(payment_method, 'Other')
        END
      ORDER BY total_amount DESC
    `, [user_id, sixMonthsAgo]);

    // Get weekly spending for prediction with proper transaction types
    const weeklyData = await client.query(`
      SELECT 
        DATE_TRUNC('week', created_at) as week,
        SUM(CASE WHEN transaction_type = 'debit' THEN amount ELSE 0 END) as expenses,
        SUM(CASE WHEN transaction_type = 'credit' THEN amount ELSE 0 END) as income
      FROM transactions
      WHERE user_id = $1 
        AND created_at >= NOW() - INTERVAL '8 weeks'
        AND status = 'completed'
      GROUP BY DATE_TRUNC('week', created_at)
      ORDER BY week DESC
    `, [user_id]);

    // Get recent transactions for insights with full details
    const recentTransactions = await client.query(`
      SELECT 
        t.transaction_id,
        t.reference,
        t.transaction_type,
        t.amount,
        t.payment_method,
        t.metadata,
        t.created_at,
        tc.category_name,
        tc.category_type
      FROM transactions t
      LEFT JOIN transaction_categories tc ON t.category_id = tc.category_id
      WHERE t.user_id = $1
        AND t.created_at >= NOW() - INTERVAL '30 days'
        AND t.status = 'completed'
      ORDER BY t.created_at DESC
      LIMIT 20
    `, [user_id]);

    // Get bills analysis
    const billsData = await client.query(`
      SELECT 
        bill_type,
        COUNT(*) as bill_count,
        SUM(amount_paid) as total_amount,
        AVG(amount_paid) as avg_amount
      FROM bills_history
      WHERE user_id = $1 
        AND created_at >= $2
      GROUP BY bill_type
      ORDER BY total_amount DESC
    `, [user_id, sixMonthsAgo]);

    // Get daily spending patterns
    const dailyPatterns = await client.query(`
      SELECT 
        EXTRACT(DOW FROM created_at) as day_of_week,
        EXTRACT(HOUR FROM created_at) as hour_of_day,
        SUM(amount) as total_amount,
        COUNT(*) as transaction_count
      FROM transactions
      WHERE user_id = $1 
        AND created_at >= NOW() - INTERVAL '30 days'
        AND transaction_type = 'debit'
        AND status = 'completed'
      GROUP BY EXTRACT(DOW FROM created_at), EXTRACT(HOUR FROM created_at)
      ORDER BY day_of_week, hour_of_day
    `, [user_id]);

    // Get spending trends (month-over-month)
    const spendingTrends = await client.query(`
      SELECT 
        TO_CHAR(created_at, 'YYYY-MM') as month,
        SUM(CASE WHEN transaction_type = 'debit' THEN amount ELSE 0 END) as expenses,
        SUM(CASE WHEN transaction_type = 'credit' THEN amount ELSE 0 END) as income,
        COUNT(CASE WHEN transaction_type = 'debit' THEN 1 END) as expense_count,
        COUNT(CASE WHEN transaction_type = 'credit' THEN 1 END) as income_count
      FROM transactions
      WHERE user_id = $1 
        AND created_at >= NOW() - INTERVAL '12 months'
        AND status = 'completed'
      GROUP BY TO_CHAR(created_at, 'YYYY-MM')
      ORDER BY month DESC
    `, [user_id]);

    // Process all data for comprehensive analytics
    const monthlyChartData = processMonthlyData(monthlyData.rows);
    const categoryChartData = processCategoryData(categoryData.rows);
    const billsAnalysis = processBillsData(billsData.rows);
    const dailyPatternsData = processDailyPatterns(dailyPatterns.rows);
    const spendingTrendsData = processSpendingTrends(spendingTrends.rows);
    const spendingPrediction = calculateSpendingPrediction(weeklyData.rows);
    const insights = calculateFinancialInsights(monthlyData.rows, currentBalance, billsAnalysis);
    const financialHealth = calculateFinancialHealth(currentBalance, monthlyData.rows, billsAnalysis);

    // Convert amounts from cents to rands for display
    const formatAmount = (amount) => (Number(amount) / 100).toFixed(2);

    // Ensure all variables are defined with fallback values
    const safeCurrentBalance = currentBalance || 0;
    const safeSpendingPrediction = spendingPrediction || 0;
    const safeInsights = insights || {
      currentMonthExpenses: "0.00",
      lastMonthExpenses: "0.00", 
      spendingChange: "0.0",
      currentBalance: safeCurrentBalance.toFixed(2),
      topSpendingCategory: "None",
      averageTransactionSize: "0.00"
    };

    const renderData = {
      user: req.user,
      active: "analytics",
      currentBalance: safeCurrentBalance.toFixed(2),
      monthlyData: monthlyChartData || { labels: [], income: [], expenses: [] },
      categoryData: categoryChartData || [],
      billsData: billsAnalysis || [],
      dailyPatterns: dailyPatternsData || { days: [], hours: [] },
      spendingTrends: spendingTrendsData || { months: [], expenses: [], income: [] },
      spendingPrediction: formatAmount(safeSpendingPrediction),
      insights: safeInsights,
      financialHealth: financialHealth || { score: 0, level: 'Unknown', recommendations: [] },
      recentTransactions: (recentTransactions?.rows || []).map(t => ({
        ...t,
        amount: formatAmount(t.amount),
        formatted_date: new Date(t.created_at).toLocaleDateString('en-ZA'),
        formatted_time: new Date(t.created_at).toLocaleTimeString('en-ZA'),
        metadata: t.metadata ? (typeof t.metadata === 'string' ? JSON.parse(t.metadata) : t.metadata) : {}
      }))
    };

    console.log('📊 Rendering analytics with comprehensive data:');
    console.log('- Current Balance:', renderData.currentBalance);
    console.log('- Monthly Data Points:', monthlyChartData.labels.length);
    console.log('- Category Data Points:', categoryChartData.length);
    console.log('- Bills Analysis:', billsAnalysis.length);
    console.log('- Recent Transactions:', renderData.recentTransactions.length);
    console.log('- Financial Health Score:', financialHealth.score);

    res.render("analytics", renderData);

  } catch (error) {
    console.error('Analytics page error:', error);
    res.status(500).send("Server error");
  } finally {
    client.release();
  }
};

// Helper function to process monthly data for charts
function processMonthlyData(monthlyRows) {
  const monthlyMap = new Map();
  
  monthlyRows.forEach(row => {
    const month = row.month;
    if (!monthlyMap.has(month)) {
      monthlyMap.set(month, { income: 0, expenses: 0, transactionCount: 0 });
    }
    
    const amount = Number(row.total_amount) / 100; // Convert from cents
    if (row.transaction_type === 'credit') {
      monthlyMap.get(month).income += amount;
    } else if (row.transaction_type === 'debit') {
      monthlyMap.get(month).expenses += amount;
    }
    monthlyMap.get(month).transactionCount += Number(row.transaction_count);
  });

  const sortedMonths = Array.from(monthlyMap.keys()).sort();
  const incomeData = sortedMonths.map(month => monthlyMap.get(month).income);
  const expenseData = sortedMonths.map(month => monthlyMap.get(month).expenses);
  const transactionCounts = sortedMonths.map(month => monthlyMap.get(month).transactionCount);
  const monthLabels = sortedMonths.map(month => {
    const date = new Date(month + '-01');
    return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  });

  return {
    labels: monthLabels,
    income: incomeData,
    expenses: expenseData,
    transactionCounts: transactionCounts
  };
}

// Helper function to process category data for pie chart
function processCategoryData(categoryRows) {
  const totalAmount = categoryRows.reduce((sum, row) => sum + Number(row.total_amount), 0);
  
  return categoryRows.map(row => ({
    label: row.category || 'Other',
    amount: Number(row.total_amount) / 100, // Convert from cents
    percentage: ((Number(row.total_amount) / totalAmount) * 100).toFixed(1),
    count: row.transaction_count
  }));
}

// Helper function to calculate spending prediction
function calculateSpendingPrediction(weeklyRows) {
  if (weeklyRows.length === 0) return 0;
  
  // Calculate average weekly spending
  const totalSpending = weeklyRows.reduce((sum, row) => sum + Number(row.expenses), 0);
  const averageWeeklySpending = totalSpending / weeklyRows.length;
  
  // Convert from cents to rands
  return averageWeeklySpending / 100;
}

// Helper function to calculate financial insights
function calculateFinancialInsights(monthlyRows, currentBalance) {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const lastMonth = new Date();
  lastMonth.setMonth(lastMonth.getMonth() - 1);
  const lastMonthStr = lastMonth.toISOString().slice(0, 7);

  // Get current month data
  const currentMonthData = monthlyRows.filter(row => row.month === currentMonth);
  const lastMonthData = monthlyRows.filter(row => row.month === lastMonthStr);

  const currentMonthExpenses = currentMonthData
    .filter(row => row.transaction_type === 'debit')
    .reduce((sum, row) => sum + Number(row.total_amount), 0) / 100;

  const lastMonthExpenses = lastMonthData
    .filter(row => row.transaction_type === 'debit')
    .reduce((sum, row) => sum + Number(row.total_amount), 0) / 100;

  const spendingChange = lastMonthExpenses > 0 ? 
    ((currentMonthExpenses - lastMonthExpenses) / lastMonthExpenses * 100) : 0;

  return {
    currentMonthExpenses: currentMonthExpenses.toFixed(2),
    lastMonthExpenses: lastMonthExpenses.toFixed(2),
    spendingChange: spendingChange.toFixed(1),
    currentBalance: Number(currentBalance).toFixed(2)
  };
}

// Helper function to process bills data
function processBillsData(billsRows) {
  return billsRows.map(row => ({
    billType: row.bill_type,
    count: Number(row.bill_count),
    totalAmount: (Number(row.total_amount) / 100).toFixed(2),
    averageAmount: (Number(row.avg_amount) / 100).toFixed(2)
  }));
}

// Helper function to process daily patterns
function processDailyPatterns(dailyRows) {
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayData = new Array(7).fill(0);
  const hourData = new Array(24).fill(0);

  dailyRows.forEach(row => {
    const dayOfWeek = Number(row.day_of_week);
    const hourOfDay = Number(row.hour_of_day);
    const amount = Number(row.total_amount) / 100;
    
    dayData[dayOfWeek] += amount;
    hourData[hourOfDay] += amount;
  });

  return {
    days: dayData.map((amount, index) => ({
      day: dayNames[index],
      amount: amount.toFixed(2)
    })),
    hours: hourData.map((amount, hour) => ({
      hour: hour,
      amount: amount.toFixed(2)
    }))
  };
}

// Helper function to process spending trends
function processSpendingTrends(trendsRows) {
  const sortedRows = trendsRows.sort((a, b) => a.month.localeCompare(b.month));
  
  return {
    months: sortedRows.map(row => {
      const date = new Date(row.month + '-01');
      return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    }),
    expenses: sortedRows.map(row => (Number(row.expenses) / 100).toFixed(2)),
    income: sortedRows.map(row => (Number(row.income) / 100).toFixed(2)),
    expenseCounts: sortedRows.map(row => Number(row.expense_count)),
    incomeCounts: sortedRows.map(row => Number(row.income_count))
  };
}

// Helper function to calculate financial health score
function calculateFinancialHealth(currentBalance, monthlyRows, billsData) {
  let score = 0;
  const recommendations = [];

  // Balance health (0-30 points)
  if (currentBalance > 1000) {
    score += 30;
  } else if (currentBalance > 500) {
    score += 20;
  } else if (currentBalance > 100) {
    score += 10;
  } else {
    recommendations.push("Consider building an emergency fund");
  }

  // Spending consistency (0-25 points)
  const recentMonths = monthlyRows.slice(0, 3);
  if (recentMonths.length >= 2) {
    const expenses = recentMonths.map(row => 
      row.transaction_type === 'debit' ? Number(row.total_amount) / 100 : 0
    ).reduce((sum, exp) => sum + exp, 0);
    const avgMonthlyExpense = expenses / recentMonths.length;
    
    if (avgMonthlyExpense < currentBalance * 0.5) {
      score += 25;
    } else if (avgMonthlyExpense < currentBalance) {
      score += 15;
    } else {
      score += 5;
      recommendations.push("Your spending is high relative to your balance");
    }
  }

  // Bill payment consistency (0-20 points)
  const totalBills = billsData.reduce((sum, bill) => sum + Number(bill.totalAmount), 0);
  if (totalBills > 0) {
    score += 20;
  } else {
    score += 10;
  }

  // Income stability (0-25 points)
  const incomeMonths = monthlyRows.filter(row => row.transaction_type === 'credit');
  if (incomeMonths.length >= 2) {
    score += 25;
  } else if (incomeMonths.length >= 1) {
    score += 15;
  } else {
    recommendations.push("Consider setting up regular income sources");
  }

  // Determine health level
  let level = 'Poor';
  if (score >= 80) level = 'Excellent';
  else if (score >= 60) level = 'Good';
  else if (score >= 40) level = 'Fair';

  return {
    score: Math.min(score, 100),
    level: level,
    recommendations: recommendations
  };
}
