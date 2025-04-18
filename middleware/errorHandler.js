// middleware/errorHandler.js
const config = require('../config');

const errorHandler = (err, req, res, next) => {
    console.error(err); // Log the full error for debugging

    const statusCode = err.statusCode || 500;
    const message = err.message || 'Internal Server Error';

    // Send different error details based on environment
    if (config.nodeEnv === 'production' && statusCode === 500) {
        return res.status(500).json({ error: 'An unexpected error occurred.' });
    }

    // Include stack trace in development only
    const response = {
        error: message,
        ...(config.nodeEnv === 'development' && { stack: err.stack }),
        ...(err.errors && { validationErrors: err.errors }), // For express-validator errors
    };

    res.status(statusCode).json(response);
};

module.exports = errorHandler;