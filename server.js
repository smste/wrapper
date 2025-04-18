// server.js (Exports setupServer)
require('dotenv').config(); // Load .env file first (can be redundant if also in bot.js, but safe)
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const config = require('./config');
const database = require('./config/database'); // Import DB connections for shutdown

// Middleware
const apiKeyAuth = require('./middleware/apiKeyAuth');
const gameServerAuth = require('./middleware/gameServerAuth'); // Ensure this path is correct
const errorHandler = require('./middleware/errorHandler');

// Routes
const userRoutes = require('./routes/userRoutes');
const flightRoutes = require('./routes/flightRoutes');
const flightPlanRoutes = require('./routes/flightPlanRoutes');
const verificationRoutes = require('./routes/verificationRoutes');

// Require the controller that needs the client instance
const verificationController = require('./controllers/verificationController');

// Export a function that sets up and starts the server
function setupServer(discordClient) { // Accept the Discord client instance
    console.log('[Server Setup] Setting Discord client for controllers...');
    // Pass the client to the controller(s) that need it
    verificationController.setDiscordClient(discordClient);

    const app = express();

    // --- Global Middleware ---
    app.use(helmet.contentSecurityPolicy({ directives: { /* ... your CSP config ... */ } }));
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    const limiter = rateLimit({
        windowMs: config.rateLimitWindowMs,
        max: config.rateLimitMax,
        message: 'Too many requests from this IP, please try again after a minute.',
        standardHeaders: true,
        legacyHeaders: false,
    });
    app.use(limiter);

    // --- Static Files / Template Engine (Optional) ---
    // app.use(express.static(path.join(__dirname, 'public')));
    // app.set('view engine', 'ejs');
    // app.set('views', path.join(__dirname, 'views'));

    // --- Routes ---
    // Public health check
    app.get('/', (req, res) => res.status(200).send('API is running.'));

    // Verification routes - Authenticated ONLY by Game Server Key
    app.use('/verifications', gameServerAuth, verificationRoutes);

    // General API Routes - Authenticated by User API Key
    app.use('/users', apiKeyAuth, userRoutes);
    app.use('/flights', apiKeyAuth, flightRoutes);
    app.use('/plans', apiKeyAuth, flightPlanRoutes);

    // --- 404 Handler ---
    app.use((req, res, next) => {
        res.status(404).json({ error: 'Not Found' });
    });

    // --- Centralized Error Handler ---
    app.use(errorHandler);

    // --- Start Listening ---
    const server = app.listen(config.port, () => {
        console.log(`✅ API Server listening on port ${config.port} in ${config.nodeEnv} mode.`);
    });

    // --- Graceful Shutdown ---
    process.on('SIGTERM', async () => {
        console.info('SIGTERM signal received: closing HTTP server');
        server.close(async () => {
            console.log('HTTP server closed');
            try {
                console.log('Closing MongoDB connections...');
                await Promise.all([
                    database.userDB.close(false),
                    database.flightDB.close(false),
                    database.flightPlanDB.close(false)
                ]);
                console.log('MongoDB connections closed.');
            } catch (err) {
                console.error('Error closing MongoDB connections:', err);
            }
            process.exit(0);
        });
    });

    return { app, server }; // Return app/server if needed
}

module.exports = setupServer; // Export the setup function