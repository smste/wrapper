// server.js (Updated and Corrected)
require('dotenv').config(); // Ensure .env is loaded first!
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path'); // Often needed for views/static
const config = require('./config');
const database = require('./config/database'); // Import DB connections for shutdown

// --- Middleware ---
const apiKeyAuth = require('./middleware/apiKeyAuth'); // Checks X-API-Key
const gameServerAuth = require('./middleware/gameServerAuth'); // Checks X-GameServer-Key
const errorHandler = require('./middleware/errorHandler');

// --- Routes ---
const userRoutes = require('./routes/userRoutes');
const flightRoutes = require('./routes/flightRoutes');
const flightPlanRoutes = require('./routes/flightPlanRoutes');
const verificationRoutes = require('./routes/verificationRoutes');

// Initialize DB Connections (runs when database.js is required)
// Ensure database.js handles connection logic upon import

const app = express();

// --- Global Middleware (Apply to all requests BEFORE routing) ---
// Basic Security Headers (Adjust CSP as needed for your frontend/CSS)
app.use(helmet.contentSecurityPolicy({
    directives: {
         defaultSrc: ["'self'"],
         scriptSrc: ["'self'"],
         styleSrc: ["'self'", "'unsafe-inline'"], // Example, adjust as needed
        // Add other directives as needed
    },
}));
app.use(express.json()); // Parse JSON request bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded request bodies

// Rate Limiting (Apply globally)
const limiter = rateLimit({
    windowMs: config.rateLimitWindowMs,
    max: config.rateLimitMax,
    message: 'Too many requests from this IP, please try again after a minute.',
    standardHeaders: true,
    legacyHeaders: false,
});
app.use(limiter);

// --- Static Files (If serving CSS/JS/Images for website) ---
// app.use(express.static(path.join(__dirname, 'public'))); // Uncomment if needed

// --- Template Engine (If serving website pages) ---
// app.set('view engine', 'ejs');
// app.set('views', path.join(__dirname, 'views'));


// --- Public Routes / Health Check (NO AUTH) ---
app.get('/', (req, res) => {
    res.status(200).send('API is running.'); // Simple health check endpoint
});
// Add any website page routes here if applicable (before auth middleware)
// app.get('/web/somepage', ...);


// --- Specific Auth Routes ---

// Verification routes - Authenticated ONLY by Game Server Key
// The 'gameServerAuth' middleware runs ONLY for requests starting with '/verifications'
app.use('/verifications', gameServerAuth, verificationRoutes);

// --- General API Routes (Authenticated by User API Key) ---
// The 'apiKeyAuth' middleware runs ONLY for requests starting with these paths
app.use('/users', apiKeyAuth, userRoutes);
app.use('/flights', apiKeyAuth, flightRoutes);
app.use('/plans', apiKeyAuth, flightPlanRoutes);

// --- REMOVED global `app.use(apiKeyAuth);` from here ---


// --- 404 Handler (Catch-all for routes not matched above) ---
app.use((req, res, next) => {
    // Respond with JSON for API-like paths, maybe HTML for others if needed
    res.status(404).json({ error: 'Not Found' });
});

// --- Centralized Error Handler (Must be the LAST middleware) ---
app.use(errorHandler);

// --- Start Server ---
const server = app.listen(config.port, () => {
    console.log(`Server listening on port ${config.port} in ${config.nodeEnv} mode.`);
    // Avoid logging base URL here if it comes from client config anyway
    // console.log(`API Base URL for Bot/Clients: ${config.apiBaseUrl}`);
});

// --- Graceful Shutdown Handling ---
process.on('SIGTERM', async () => { // Make the handler async
  console.info('SIGTERM signal received: closing HTTP server');
  server.close(async () => { // Add async here too
    console.log('HTTP server closed');
    // --- Close specific Mongoose connections ---
    try {
        console.log('Closing MongoDB connections...');
        // Use Promise.all to close connections concurrently
        await Promise.all([
            database.userDB.close(false), // Pass false to prevent forceful close immediately
            database.flightDB.close(false),
            database.flightPlanDB.close(false)
        ]);
        console.log('MongoDB connections closed.');
    } catch (err) {
        console.error('Error closing MongoDB connections:', err);
    }
    process.exit(0); // Exit process once connections are closed
  });
});