// Security Headers Middleware
export const securityHeaders = (req, res, next) => {
    // Content Security Policy - Allow existing functionality
    res.setHeader('Content-Security-Policy', 
        "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.paystack.co https://checkout.paystack.com; " +
        "style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data: blob: https://public-files-paystack-prod.s3.eu-west-1.amazonaws.com https://*.paystack.com; " +
        "font-src 'self'; " +
        "connect-src 'self' https://api.paystack.co https://js.paystack.co https://public-files-paystack-prod.s3.eu-west-1.amazonaws.com; " +
        "frame-src https://checkout.paystack.com; " +
        "frame-ancestors 'none';"
    );
    
    // Prevent clickjacking - Allow Paystack iframes but prevent embedding our site
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    
    // Prevent MIME type sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');
    
    // XSS Protection
    res.setHeader('X-XSS-Protection', '1; mode=block');
    
    // Referrer Policy
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    // HSTS (only in production)
    if (process.env.NODE_ENV === 'production') {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    
    next();
};
