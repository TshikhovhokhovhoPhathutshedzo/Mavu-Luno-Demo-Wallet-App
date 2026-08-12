export const CurrencyService = (() => {
  // Multiple API endpoints for fallback
  const APIS = [
    'https://api.exchangerate.host/latest',
    'https://api.fxratesapi.com/latest',
    'https://api.currencyapi.com/v3/latest'
  ];
  
  const KEY = 'fx_default_currency';
  const APP_CURRENCY_KEY = 'app_currency';
  let cache = null; 
  let cacheAt = 0;

  // Currency information with flags and names
  const CURRENCY_INFO = {
    'ZAR': { flag: '🇿🇦', name: 'South African Rand' },
    'USD': { flag: '🇺🇸', name: 'US Dollar' },
    'EUR': { flag: '🇪🇺', name: 'Euro' },
    'GBP': { flag: '🇬🇧', name: 'British Pound' },
    'NGN': { flag: '🇳🇬', name: 'Nigerian Naira' },
    'KES': { flag: '🇰🇪', name: 'Kenyan Shilling' },
    'CAD': { flag: '🇨🇦', name: 'Canadian Dollar' },
    'AUD': { flag: '🇦🇺', name: 'Australian Dollar' },
    'JPY': { flag: '🇯🇵', name: 'Japanese Yen' },
    'CHF': { flag: '🇨🇭', name: 'Swiss Franc' },
    'CNY': { flag: '🇨🇳', name: 'Chinese Yuan' },
    'INR': { flag: '🇮🇳', name: 'Indian Rupee' },
    'BRL': { flag: '🇧🇷', name: 'Brazilian Real' },
    'MXN': { flag: '🇲🇽', name: 'Mexican Peso' },
    'RUB': { flag: '🇷🇺', name: 'Russian Ruble' }
  };

  // Major currencies for the special section
  const MAJOR_CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CHF'];

  async function getRates(base = 'ZAR') {
    const now = Date.now();
    if (cache && now - cacheAt < 5 * 60 * 1000 && cache.base === base) return cache;
    
    // Try each API endpoint
    for (let i = 0; i < APIS.length; i++) {
      try {
        console.log(`Trying API ${i + 1}: ${APIS[i]}`);
        const url = `${APIS[i]}?base=${encodeURIComponent(base)}`;
        const res = await fetch(url, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
          },
          mode: 'cors'
        });
        
        if (!res.ok) {
          console.warn(`API ${i + 1} returned status: ${res.status}`);
          continue;
        }
        
        const data = await res.json();
        console.log('API Response:', data);
        
        // Handle different API response formats
        let processedData;
        if (data.success !== false && data.rates) {
          // exchangerate.host format
          processedData = data;
        } else if (data.data && data.data.rates) {
          // currencyapi.com format
          processedData = {
            base: data.data.base,
            rates: data.data.rates,
            success: true
          };
        } else if (data.rates) {
          // fxratesapi.com format
          processedData = {
            base: data.base || base,
            rates: data.rates,
            success: true
          };
        } else {
          console.warn(`API ${i + 1} returned unexpected format:`, data);
          continue;
        }
        
        cache = processedData; 
        cacheAt = now; 
        console.log('Successfully fetched rates from API', i + 1);
        return processedData;
        
      } catch (error) {
        console.warn(`API ${i + 1} failed:`, error.message);
        if (i === APIS.length - 1) {
          // All APIs failed, return mock data for demo
          console.log('All APIs failed, returning mock data');
          return getMockRates(base);
        }
      }
    }
  }

  // Mock rates for demo purposes when APIs fail
  function getMockRates(base = 'ZAR') {
    const mockRates = {
      'ZAR': {
        'USD': 0.055,
        'EUR': 0.050,
        'GBP': 0.043,
        'NGN': 85.0,
        'KES': 7.2,
        'CAD': 0.075,
        'AUD': 0.082,
        'JPY': 8.1,
        'CHF': 0.048,
        'CNY': 0.39,
        'INR': 4.6,
        'BRL': 0.28,
        'MXN': 0.92,
        'RUB': 5.1
      },
      'USD': {
        'ZAR': 18.2,
        'EUR': 0.91,
        'GBP': 0.78,
        'NGN': 1545.0,
        'KES': 131.0,
        'CAD': 1.36,
        'AUD': 1.49,
        'JPY': 147.0,
        'CHF': 0.87,
        'CNY': 7.1,
        'INR': 83.2,
        'BRL': 5.1,
        'MXN': 16.7,
        'RUB': 92.7
      },
      'EUR': {
        'ZAR': 20.0,
        'USD': 1.10,
        'GBP': 0.86,
        'NGN': 1700.0,
        'KES': 144.0,
        'CAD': 1.50,
        'AUD': 1.64,
        'JPY': 162.0,
        'CHF': 0.96,
        'CNY': 7.8,
        'INR': 91.5,
        'BRL': 5.6,
        'MXN': 18.4,
        'RUB': 102.0
      }
    };

    return {
      base: base,
      rates: mockRates[base] || mockRates['ZAR'],
      success: true,
      mock: true
    };
  }

  function getDefaultCurrency() {
    try { return localStorage.getItem(KEY) || 'ZAR'; } catch { return 'ZAR'; }
  }

  function setDefaultCurrency(code) {
    try { 
      localStorage.setItem(KEY, code);
      // Also set as app currency
      localStorage.setItem(APP_CURRENCY_KEY, code);
      // Update app-wide currency
      updateAppCurrency(code);
    } catch (error) {
      console.error('Error saving currency:', error);
    }
  }

  function getAppCurrency() {
    try { return localStorage.getItem(APP_CURRENCY_KEY) || 'ZAR'; } catch { return 'ZAR'; }
  }

  function updateAppCurrency(code) {
    // Update currency display throughout the app
    document.documentElement.setAttribute('data-app-currency', code);
    
    // Dispatch custom event for other components to listen
    window.dispatchEvent(new CustomEvent('currencyChanged', { 
      detail: { currency: code, info: CURRENCY_INFO[code] } 
    }));
  }

  async function convert(amount, from, to) {
    if (from === to) return amount;
    
    try {
      const rates = await getRates(from);
      const rate = rates.rates?.[to];
      return rate ? amount * rate : amount;
    } catch (error) {
      console.error('Error converting currency:', error);
      throw error;
    }
  }

  function getCurrencyInfo(code) {
    return CURRENCY_INFO[code] || { flag: '🌍', name: code };
  }

  function getMajorCurrencies() {
    return MAJOR_CURRENCIES;
  }

  function getAllCurrencies() {
    return Object.keys(CURRENCY_INFO);
  }

  function formatCurrency(amount, currency = 'ZAR') {
    const info = getCurrencyInfo(currency);
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  }

  function formatRate(rate, decimals = 4) {
    return parseFloat(rate).toFixed(decimals);
  }

  // Initialize app currency on load
  function init() {
    const appCurrency = getAppCurrency();
    updateAppCurrency(appCurrency);
  }

  return { 
    getRates, 
    convert, 
    getDefaultCurrency, 
    setDefaultCurrency,
    getAppCurrency,
    getCurrencyInfo,
    getMajorCurrencies,
    getAllCurrencies,
    formatCurrency,
    formatRate,
    init
  };
})();



