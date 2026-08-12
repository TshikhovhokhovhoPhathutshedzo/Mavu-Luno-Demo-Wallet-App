// Global Error Handling Middleware
import pool from "../auth/db.js";

// Custom error class
export class AppError extends Error {
    constructor(message, statusCode = 500, isOperational = true) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = isOperational;
        this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
        
        Error.captureStackTrace(this, this.constructor);
    }
}

// Async error wrapper
export const asyncHandler = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};

// Database error handler
export const handleDatabaseError = (error) => {
    if (error.code === '23505') { // Unique violation
        return new AppError('Duplicate entry found', 400);
    }
    if (error.code === '23503') { // Foreign key violation
        return new AppError('Referenced record not found', 400);
    }
    if (error.code === '42P01') { // Undefined table
        return new AppError('Database table not found', 500);
    }
    if (error.code === '28P01') { // Authentication failed
        return new AppError('Database authentication failed', 500);
    }
    return new AppError('Database operation failed', 500);
};

// Global error handler middleware
export const globalErrorHandler = (err, req, res, next) => {
    let error = { ...err };
    error.message = err.message;

    // Log error for debugging
    console.error('Error:', {
        message: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent')
    });

    // Handle specific error types
    if (err.name === 'CastError') {
        const message = 'Invalid resource ID';
        error = new AppError(message, 400);
    }

    if (err.code === 11000) {
        const message = 'Duplicate field value entered';
        error = new AppError(message, 400);
    }

    if (err.name === 'ValidationError') {
        const message = Object.values(err.errors).map(val => val.message).join(', ');
        error = new AppError(message, 400);
    }

    if (err.name === 'JsonWebTokenError') {
        const message = 'Invalid token';
        error = new AppError(message, 401);
    }

    if (err.name === 'TokenExpiredError') {
        const message = 'Token expired';
        error = new AppError(message, 401);
    }

    // Database errors
    if (err.code && err.code.startsWith('23')) {
        error = handleDatabaseError(err);
    }

    // Default error response
    const statusCode = error.statusCode || 500;
    const message = error.message || 'Internal Server Error';

    // Development error response
    if (process.env.NODE_ENV === 'development') {
        res.status(statusCode).json({
            success: false,
            error: message,
            stack: err.stack,
            status: statusCode
        });
    } else {
        // Production error response (no stack trace)
        res.status(statusCode).json({
            success: false,
            error: message,
            status: statusCode
        });
    }
};

// 404 handler
export const notFoundHandler = (req, res, next) => {
    res.status(404).json({
        success: false,
        error: `Route ${req.originalUrl} not found`,
        status: 404
    });
};

// Graceful shutdown handler
export const gracefulShutdown = (server) => {
    return (signal) => {
        console.log(`\n${signal} received. Shutting down gracefully...`);
        
        server.close(() => {
            console.log('HTTP server closed');
            
            // Close database connections
            pool.end(() => {
                console.log('Database connections closed');
                process.exit(0);
            });
        });
    };
};
