// Input Validation and Sanitization Middleware
import { escape } from 'html-escaper';

// Sanitize HTML content
export const sanitizeHtml = (str) => {
    if (typeof str !== 'string') return str;
    return escape(str);
};

// Validate email format
export const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
};

// Validate amount (positive number)
export const validateAmount = (amount) => {
    const num = parseFloat(amount);
    return !isNaN(num) && num > 0 && num <= 1000000; // Max 1M
};

// Sanitize user input middleware
export const sanitizeUserInput = (req, res, next) => {
    // Sanitize body parameters
    if (req.body) {
        Object.keys(req.body).forEach(key => {
            if (typeof req.body[key] === 'string') {
                req.body[key] = sanitizeHtml(req.body[key]);
            }
        });
    }
    
    // Sanitize query parameters
    if (req.query) {
        Object.keys(req.query).forEach(key => {
            if (typeof req.query[key] === 'string') {
                req.query[key] = sanitizeHtml(req.query[key]);
            }
        });
    }
    
    next();
};

// Validate registration data
export const validateRegistration = (req, res, next) => {
    const { email, username, password } = req.body;
    
    if (!email || !username || !password) {
        return res.status(400).json({ 
            error: 'All fields are required' 
        });
    }
    
    if (!validateEmail(email)) {
        return res.status(400).json({ 
            error: 'Invalid email format' 
        });
    }
    
    if (username.length < 3 || username.length > 50) {
        return res.status(400).json({ 
            error: 'Username must be between 3 and 50 characters' 
        });
    }
    
    if (password.length < 8) {
        return res.status(400).json({ 
            error: 'Password must be at least 8 characters long' 
        });
    }
    
    next();
};

// Validate transaction data
export const validateTransaction = (req, res, next) => {
    const { amount } = req.body;
    
    if (!amount) {
        return res.status(400).json({ 
            error: 'Amount is required' 
        });
    }
    
    if (!validateAmount(amount)) {
        return res.status(400).json({ 
            error: 'Invalid amount. Must be a positive number less than 1,000,000' 
        });
    }
    
    next();
};
