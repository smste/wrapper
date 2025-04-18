// server.js (Modified structure)
// Remove require('dotenv').config() if it's now only at the top of bot.js
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const config = require('./config');
const database = require('./config/database');

// Middleware
const apiKeyAuth = require('./middleware/apiKeyAuth');
const gameServerAuth = require('./middleware/gameServerAuth');
const errorHandler = require('./middleware/errorHandler');

// Routes
const userRoutes = require('./routes/userRoutes');
const flightRoutes = require('./routes/flightRoutes');
const flightPlanRoutes = require('./routes/flightPlanRoutes');
const verificationRoutes = require('./routes/verificationRoutes');

// Require the controller (to pass the client to it later)
const verificationController = require('./controllers/verificationController');

// Export a function that sets up and starts the server
function setupServer(discordClient) { // Accept the Discord client instance
    // --- Pass the client to the controller ---
    // (We'll add a function in the controller to accept it)
    verificationController.setDiscordClient(discordClient);
    // --- End Pass client ---

    const app = express();

    // --- Global Middleware ---
    // ... (helmet, json, urlencoded, limiter setup) ...
     app.use(helmet.contentSecurityPolicy({ directives: { /* ... */ } }));
     app.use(express.json());
     app.use(express.urlencoded({ extended: true }));
     app.use(limiter); // Ensure limiter is defined above

    // --- Static Files / Template Engine (Optional) ---
    // ... (app.use(express.static...), app.set('view engine'...) if needed )

    // --- Routes ---
    app.get('/', (req, res) => res.status(200).send('API is running.')); // Health check

    // Specific Auth Routes
    app.use('/verifications', gameServerAuth, verificationRoutes);

    // General API Routes
    app.use('/users', apiKeyAuth, userRoutes);
    app.use('/flights', apiKeyAuth, flightRoutes);
    app.use('/plans', apiKeyAuth, flightPlanRoutes);

    // --- 404 Handler ---
    app.use((req, res, next) => { res.status(404).json({ error: 'Not Found' }); });

    // --- Centralized Error Handler ---
    app.use(errorHandler);

    // --- Start Listening ---
    const server = app.listen(config.port, () => {
        console.log(`API Server listening on port ${config.port} in ${config.nodeEnv} mode.`);
    });

    // --- Graceful Shutdown ---
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

    return { app, server }; // Return app/server if needed elsewhere
}

module.exports = setupServer;