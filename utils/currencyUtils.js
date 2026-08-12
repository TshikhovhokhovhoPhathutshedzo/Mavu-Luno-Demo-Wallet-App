/**
 * Currency Utility Functions
 * 
 * Provides consistent currency conversion and formatting functions
 * for handling South African Rand (ZAR) amounts.
 * 
 * Pattern:
 * - User input: Rands with decimal places (e.g., 123.45)
 * - Storage/calculations: Cents as integers (e.g., 12345)
 * - Display: Formatted Rands (e.g., "R 123.45")
 */

/**
 * Convert Rands to cents (integer)
 * @param {number|string} rands - Amount in Rands
 * @returns {number} Amount in cents
 * @throws {Error} If input is invalid
 */
export function randsToCents(rands) {
    const amount = parseFloat(rands);
    if (isNaN(amount) || !isFinite(amount)) {
        throw new Error('Invalid amount: must be a valid number');
    }
    if (amount < 0) {
        throw new Error('Amount cannot be negative');
    }
    return Math.round(amount * 100);
}

/**
 * Convert cents to Rands (formatted string)
 * @param {number|string|BigInt} cents - Amount in cents
 * @returns {string} Formatted amount in Rands (e.g., "123.45")
 */
export function centsToRands(cents) {
    let numericCents;
    
    if (typeof cents === 'bigint') {
        numericCents = Number(cents);
    } else {
        numericCents = parseFloat(cents);
    }
    
    if (isNaN(numericCents) || !isFinite(numericCents)) {
        throw new Error('Invalid cents value');
    }
    
    return (numericCents / 100).toFixed(2);
}

/**
 * Format Rands amount with currency symbol
 * @param {number|string|BigInt} amount - Amount in cents or Rands
 * @param {boolean} isCents - Whether the input is in cents (default: true)
 * @returns {string} Formatted currency string (e.g., "R 123.45")
 */
export function formatRands(amount, isCents = true) {
    let randsAmount;
    
    if (isCents) {
        randsAmount = centsToRands(amount);
    } else {
        const numericAmount = parseFloat(amount);
        if (isNaN(numericAmount) || !isFinite(numericAmount)) {
            throw new Error('Invalid amount');
        }
        randsAmount = numericAmount.toFixed(2);
    }
    
    return `R ${randsAmount}`;
}

/**
 * Validate amount input from user
 * @param {string} amount - User input amount
 * @returns {Object} Validation result { isValid: boolean, message: string, value: number }
 */
export function validateAmount(amount) {
    try {
        const numericAmount = parseFloat(amount);
        
        if (isNaN(numericAmount)) {
            return {
                isValid: false,
                message: 'Please enter a valid number',
                value: null
            };
        }
        
        if (numericAmount <= 0) {
            return {
                isValid: false,
                message: 'Amount must be greater than zero',
                value: null
            };
        }
        
        // Check for reasonable maximum (R 1,000,000)
        if (numericAmount > 1000000) {
            return {
                isValid: false,
                message: 'Amount cannot exceed R 1,000,000',
                value: null
            };
        }
        
        // Check for too many decimal places
        const decimalPlaces = (amount.toString().split('.')[1] || '').length;
        if (decimalPlaces > 2) {
            return {
                isValid: false,
                message: 'Amount can have at most 2 decimal places',
                value: null
            };
        }
        
        return {
            isValid: true,
            message: 'Valid amount',
            value: numericAmount
        };
        
    } catch (error) {
        return {
            isValid: false,
            message: 'Invalid amount format',
            value: null
        };
    }
}

/**
 * Calculate daily withdrawal limit check
 * @param {number} totalTodayCents - Total withdrawn today in cents
 * @param {number} newAmountCents - New withdrawal amount in cents
 * @param {number} dailyLimitRands - Daily limit in Rands (default: 50000)
 * @returns {Object} Result { isValid: boolean, message: string, exceeded: boolean }
 */
export function checkDailyWithdrawalLimit(totalTodayCents, newAmountCents, dailyLimitRands = 50000) {
    const dailyLimitCents = dailyLimitRands * 100;
    const totalAfterWithdrawal = totalTodayCents + newAmountCents;
    
    if (totalAfterWithdrawal > dailyLimitCents) {
        const remainingCents = Math.max(0, dailyLimitCents - totalTodayCents);
        return {
            isValid: false,
            message: `Daily withdrawal limit exceeded. You can withdraw up to R ${centsToRands(remainingCents)} today.`,
            exceeded: true,
            remaining: remainingCents
        };
    }
    
    return {
        isValid: true,
        message: 'Within daily limit',
        exceeded: false,
        remaining: dailyLimitCents - totalAfterWithdrawal
    };
}

/**
 * Format amount for database storage (ensure it's stored as integer cents)
 * @param {*} amount - Amount to format for storage
 * @returns {number} Amount in cents as integer
 */
export function formatForStorage(amount) {
    if (typeof amount === 'number' && Number.isInteger(amount)) {
        return amount; // Already in cents
    }
    return randsToCents(amount);
}

/**
 * Parse amount from database (convert various types to number)
 * @param {*} storedAmount - Amount from database
 * @returns {number} Amount in cents as number
 */
export function parseFromStorage(storedAmount) {
    if (typeof storedAmount === 'bigint') {
        return Number(storedAmount);
    }
    if (typeof storedAmount === 'string') {
        return parseInt(storedAmount, 10);
    }
    return storedAmount;
}
