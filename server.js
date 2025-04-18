// server.js
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const apiKeyAuth = require('./middleware/apiKeyAuth');
const errorHandler = require('./middleware/errorHandler');
const userRoutes = require('./routes/userRoutes');
const flightRoutes = require('./routes/flightRoutes');
const flightPlanRoutes = require('./routes/flightPlanRoutes'); // Import the new routes
const verificationRoutes = require('./routes/verificationRoutes');
const gameServerAuth = require('./middleware/gameServerAuth');
require('./config/database'); // Initialize database connections

const app = express();

// --- Core Middleware ---
app.use(helmet()); // Set various security HTTP headers
app.use(express.json()); // Parse JSON request bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded request bodies

// --- Rate Limiting ---
const limiter = rateLimit({
	windowMs: config.rateLimitWindowMs,
	max: config.rateLimitMax, // Limit each IP to max requests per windowMs
	standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
	legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    message: 'Too many requests from this IP, please try again after a minute.',
});
app.use(limiter); // Apply the rate limiting middleware to all requests

// --- API Key Authentication (Apply to all routes below) ---
app.use(apiKeyAuth);

// --- Routes ---
app.get('/', (req, res) => {
    res.status(200).send('API is running.'); // Simple health check endpoint
});

app.use('/users', userRoutes);
app.use('/flights', flightRoutes);
app.use('/plans', apiKeyAuth, flightPlanRoutes);
app.use('/verifications', gameServerAuth, verificationRoutes);

// --- 404 Handler (Not Found) ---
// Placed after all routes, catches requests that didnt match any route
app.use((req, res, next) => {
    res.status(404).json({ error: 'Not Found' });
});

// --- Centralized Error Handler ---
// Must be the LAST middleware
app.use(errorHandler);

// --- Start Server ---
const server = app.listen(config.port, () => {
    console.log(`Server listening on port ${config.port} in ${config.nodeEnv} mode.`);
    console.log(`API Base URL for Bot: ${config.apiBaseUrl}`); // Log the URL bot should use
});

// Graceful Shutdown Handling (Optional but Recommended)
process.on('SIGTERM', () => {
  console.info('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    // Close database connections here if needed
    mongoose.disconnect(); // Disconnects default connection, manage specific ones if necessary
    process.exit(0);
  });
});