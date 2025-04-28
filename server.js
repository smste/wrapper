// server.js (Exports setupServer - Final Version)
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const http = require('http'); // Require http module
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
const webRoutes = require('./routes/webRoutes');
const attendanceRoutes = require('./routes/attendanceRoutes');

// Controllers needed by setup
const verificationController = require('./controllers/verificationController');
// Import other controllers if needed for setup/DI later

// Export a function that sets up and starts the server
function setupServer(discordClient) {
    console.log('[Server Setup] Setting Discord client for controllers...');
    // Pass client instance to controllers that need it
    verificationController.setDiscordClient(discordClient);
    // Add similar lines here if other controllers need the client

    const app = express();

    // --- Trust Proxy (Important for deployment environments like Railway/Heroku) ---
    app.set('trust proxy', 1);

    // --- Template Engine ---
    app.set('view engine', 'ejs');
    app.set('views', path.join(__dirname, 'views'));

    // --- Static Files ---
    app.use(express.static(path.join(__dirname, 'public')));

    // --- Global Middleware (Order Matters!) ---
    app.use(helmet.contentSecurityPolicy({
    directives: {
        defaultSrc: ["'self'"],
        // Allow styles from self, inline (might be needed), AND the CDN
        styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
        // Allow scripts from self, inline (if needed), AND the CDN
        scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'", "wss:", "ws:"], // Allow self and WebSockets
        // Add other directives as needed
    },
}));
    app.use(express.json()); // Body parsing
    app.use(express.urlencoded({ extended: true })); // Body parsing

    // Session Middleware
    if (!config.sessionSecret || config.sessionSecret === 'please_change_this_in_production') {
        console.warn('⚠️ WARNING: SESSION_SECRET is not set or is using the default!');
    }
    if (!config.userDbUri) {
         console.error('❌ FATAL: USER_DB_URI is required for session storage.');
         process.exit(1);
    }
    app.use(session({
        secret: config.sessionSecret,
        resave: false,
        saveUninitialized: false,
        store: MongoStore.create({
            mongoUrl: config.userDbUri,
            collectionName: 'webSessions',
            ttl: 14 * 24 * 60 * 60 // 14 days
        }),
        cookie: {
            secure: config.nodeEnv === 'production', // Use secure cookies in production (requires HTTPS)
            httpOnly: true,
            maxAge: 14 * 24 * 60 * 60 * 1000, // 14 days in milliseconds
            sameSite: 'lax' // Good default for CSRF protection
        }
    }));

    // Middleware to make user available in views
    app.use((req, res, next) => {
         res.locals.currentUser = req.session.user || null;
         next();
    });

    // Rate Limiting
    const limiter = rateLimit({
        windowMs: config.rateLimitWindowMs,
        max: config.rateLimitMax,
        message: 'Too many requests from this IP, please try again after a minute.',
        standardHeaders: true,
        legacyHeaders: false,
    });
    app.use(limiter); // Apply to all subsequent routes

    // --- Routes ---
    // Mount web routes first (includes /login, /dashboard, etc.)
    app.use('/', webRoutes);

    // Mount API routes with specific authentication middleware
    app.use('/verifications', gameServerAuth, verificationRoutes); // Needs Game Server Key
    app.use('/users', userRoutes);                   // Needs standard API Key
    app.use('/flights', apiKeyAuth, flightRoutes);
    app.use('/plans', apiKeyAuth, flightPlanRoutes);

    app.use('/attendance', gameServerAuth, attendanceRoutes);

    // --- 404 Handler ---
    app.use((req, res, next) => {
        if (req.accepts('html') && !req.originalUrl.startsWith('/api')) { // Crude check for web vs api path
          res.status(404).render('404', { pageTitle: 'Page Not Found'}); // Assumes views/404.ejs
        } else {
          res.status(404).json({ error: 'Not Found' });
        }
    });

    // --- Centralized Error Handler ---
    app.use(errorHandler); // Ensure errorHandler exists and handles errors

    // --- Create HTTP Server ---
    const httpServer = http.createServer(app);

    // --- Start Listening (only ONCE here) ---
    // We move the actual .listen call outside or handle it carefully
    // Let's return the server instance so the caller can start it *after* WebSocket setup

    // --- Graceful Shutdown ---
     process.on('SIGTERM', async () => {
         console.info('SIGTERM signal received: initiating graceful shutdown...');
         httpServer.close(async () => { // Close the HTTP server first
             console.log('HTTP server closed.');
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
             console.log('Shutdown complete. Exiting.');
             process.exit(0);
         });
         // Force exit after a timeout if graceful shutdown hangs
         setTimeout(() => {
              console.error('Graceful shutdown timed out. Forcing exit.');
              process.exit(1);
         }, 10000); // 10 second timeout
     });


    // Return the http server instance so WebSocket server can attach
    return { app, httpServer };
}

module.exports = setupServer;