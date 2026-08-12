export const PredictionService = (() => {
  // Simple linear regression using least squares: y = a + b*x
  function linearRegression(xs, ys) {
    const n = xs.length;
    const sumX = xs.reduce((a,b)=>a+b,0);
    const sumY = ys.reduce((a,b)=>a+b,0);
    const sumXY = xs.reduce((a,b,i)=>a + b*ys[i], 0);
    const sumXX = xs.reduce((a,b)=>a + b*b, 0);
    const b = (n*sumXY - sumX*sumY) / Math.max(1e-6, (n*sumXX - sumX*sumX));
    const a = (sumY - b*sumX)/n;
    return { a, b };
  }

  // Exponential smoothing
  function exponentialSmoothing(values, alpha = 0.3) {
    if (values.length === 0) return 0;
    if (values.length === 1) return values[0];
    
    let smoothed = values[0];
    for (let i = 1; i < values.length; i++) {
      smoothed = alpha * values[i] + (1 - alpha) * smoothed;
    }
    return smoothed;
  }

  // Moving average
  function movingAverage(values, window = 3) {
    if (values.length < window) return values[values.length - 1] || 0;
    
    const recent = values.slice(-window);
    return recent.reduce((a, b) => a + b, 0) / window;
  }

  // Seasonal decomposition (simplified)
  function seasonalDecomposition(values) {
    if (values.length < 7) return movingAverage(values);
    
    // Simple seasonal pattern detection
    const weeklyPattern = [];
    for (let i = 0; i < 7; i++) {
      const dayValues = values.filter((_, index) => index % 7 === i);
      weeklyPattern[i] = dayValues.reduce((a, b) => a + b, 0) / dayValues.length;
    }
    
    const nextDay = values.length % 7;
    return weeklyPattern[nextDay] || movingAverage(values);
  }

  // Neural network simulation (simplified)
  function neuralNetwork(values) {
    if (values.length < 3) return movingAverage(values);
    
    // Simple weighted average with trend
    const weights = [0.5, 0.3, 0.2]; // Recent values get higher weights
    const recent = values.slice(-3);
    
    let weightedSum = 0;
    for (let i = 0; i < recent.length; i++) {
      weightedSum += recent[i] * weights[i];
    }
    
    // Add trend component
    const trend = (values[values.length - 1] - values[0]) / values.length;
    return weightedSum + trend;
  }

  // Main prediction function
  function predictNext(values, algorithm = 'linear', horizon = 1) {
    if (!values || values.length === 0) return 0;
    
    let prediction = 0;
    
    switch (algorithm) {
      case 'linear':
        const xs = values.map((_,i)=>i+1);
        const { a, b } = linearRegression(xs, values);
        prediction = a + b * (xs.length + horizon);
        break;
      case 'exponential':
        prediction = exponentialSmoothing(values);
        break;
      case 'seasonal':
        prediction = seasonalDecomposition(values);
        break;
      case 'neural':
        prediction = neuralNetwork(values);
        break;
      default:
        prediction = movingAverage(values);
    }
    
    return Math.max(0, prediction);
  }

  // Load data from database (simulated)
  async function loadFromDatabase(type = 'expenses', days = 30) {
    try {
      // Simulate API call to get user's transaction data
      const response = await fetch(`/api/predictions/data?type=${type}&days=${days}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to load data from database');
      }
      
      const data = await response.json();
      return data.values || [];
    } catch (error) {
      console.error('Error loading data from database:', error);
      // Return sample data if database fails
      return generateSampleData(type, days);
    }
  }

  // Generate sample data for demonstration
  function generateSampleData(type, days) {
    const baseAmount = type === 'expenses' ? 150 : type === 'income' ? 5000 : 100;
    const variation = baseAmount * 0.3;
    
    const data = [];
    for (let i = 0; i < days; i++) {
      const randomVariation = (Math.random() - 0.5) * variation;
      const seasonalFactor = Math.sin(i * 2 * Math.PI / 7) * 0.1; // Weekly pattern
      const value = baseAmount + randomVariation + (baseAmount * seasonalFactor);
      data.push(Math.max(0, value));
    }
    
    return data;
  }

  // Generate insights based on data
  function generateInsights(values, prediction, type) {
    const insights = [];
    
    if (values.length < 3) {
      insights.push({
        type: 'info',
        title: 'Insufficient Data',
        message: 'More historical data is needed for accurate predictions.'
      });
      return insights;
    }
    
    // Trend analysis
    const recent = values.slice(-7);
    const older = values.slice(-14, -7);
    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const olderAvg = older.length > 0 ? older.reduce((a, b) => a + b, 0) / older.length : recentAvg;
    const trend = ((recentAvg - olderAvg) / olderAvg) * 100;
    
    if (Math.abs(trend) > 10) {
      insights.push({
        type: trend > 0 ? 'warning' : 'success',
        title: trend > 0 ? 'Increasing Trend' : 'Decreasing Trend',
        message: `${type} have ${trend > 0 ? 'increased' : 'decreased'} by ${Math.abs(trend).toFixed(1)}% recently.`
      });
    }
    
    // Variability analysis
    const variance = values.reduce((acc, val) => acc + Math.pow(val - recentAvg, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);
    const coefficient = (stdDev / recentAvg) * 100;
    
    if (coefficient > 30) {
      insights.push({
        type: 'warning',
        title: 'High Variability',
        message: `Your ${type} show high variability (${coefficient.toFixed(1)}%). Consider budgeting more carefully.`
      });
    }
    
    // Prediction confidence
    const confidence = Math.max(0, Math.min(100, 100 - coefficient));
    insights.push({
      type: 'info',
      title: 'Prediction Confidence',
      message: `This prediction has ${confidence.toFixed(0)}% confidence based on your spending patterns.`
    });
    
    return insights;
  }

  return { 
    linearRegression, 
    predictNext, 
    loadFromDatabase,
    generateSampleData,
    generateInsights,
    exponentialSmoothing,
    movingAverage,
    seasonalDecomposition,
    neuralNetwork
  };
})();



