// routes/webRoutes.js
const express = require('express');
const authController = require('../controllers/authController'); // Import auth controller
const requireLogin = require('../middleware/requireLogin'); // Import login check middleware

const config = require('../config'); // Import the configuration object
const ApiClient = require('../apiClient')

const router = express.Router();

const apiClient = new ApiClient(config.apiBaseUrl, config.apiKey);

// --- Public Routes ---
router.get('/', (req, res) => {
    // Show home page or redirect based on login status
    if (req.session.user) {
         res.redirect('/dashboard'); // Go to dashboard if logged in
    } else {
         res.render('login', { pageTitle: 'Login', error: null }); // Show login if not logged in
    }
});
router.get('/login', authController.getLoginPage);
router.post('/login', authController.handleLogin);
router.post('/logout', authController.handleLogout);
router.post('/auth/finalize-session', authController.finalizeWebSession);

router.get('/login/pending', (req, res) => {
    // This page might not strictly need requireLogin, but the user shouldn't
    // reach it unless POST /login succeeded. Render it simply.
    // Make sure loginRequestId is passed correctly if rendering from here.
    // It's better rendered directly by the POST /login handler.
    // Let's assume POST /login renders it directly. If accessed directly, maybe redirect?
    res.render('loginPending', {
        pageTitle: 'Approve Login via Discord',
        loginRequestId: req.query.id || 'UNKNOWN', // Get ID if passed via query param
        expiryMinutes: 3 // Example
    });
});

router.get('/available-flights', requireLogin, async (req, res) => {
    try {
        console.log(`[WebRoute] /available-flights accessed by user ${req.session.user.robloxId}`);
        // Fetch flights data using the API client
        const apiResponse = await apiClient.listFlights(/* Add pagination params if needed, e.g. { page: 1, limit: 50 } */);
        const flights = apiResponse.flights || []; // Get flights array from API response

        console.log(`[WebRoute] Found ${flights.length} flights from API.`);

        res.render('available-flights', { // Render the new EJS view
            pageTitle: 'Available Flights',
            flights: flights, // Pass the flight data to the view
            currentUser: req.session.user,
            // Helper function for formatting dates in EJS (optional)
            formatDate: (dateIso, timeZone = 'Australia/Sydney', formatStr = 'Pp') => {
                 try {
                     // 'Pp' is a common format like '02/16/2023, 9:30:55 PM' - adjust as needed
                     // See date-fns format tokens: https://date-fns.org/v2.16.1/docs/format
                      if (!dateIso) return 'N/A';
                      return formatInTimeZone(new Date(dateIso), timeZone, formatStr);
                 } catch (e) {
                      console.error("Date formatting error:", e);
                      return "Invalid Date";
                 }
            }
        });
    } catch (error) {
        console.error("[WebRoute] Error fetching flight list for page:", error);
         res.status(error.status || 500).render('error', {
             pageTitle: 'Error',
             errorStatus: error.status || 500,
             errorMessage: error.message || 'Could not load available flights.',
             errorStack: config.nodeEnv === 'development' ? error.stack : null,
             currentUser: req.session.user
         });
    }
});

router.get('/plan/create', requireLogin, async (req, res, next) => {
    try {
        console.log(`[WebRoute GET /plan/create] Fetching available legs for builder...`);
        // Fetch available flight legs using the secure API client server-side
        const apiResponse = await apiClient.listFlights(); // API now returns { legs: [...] }

        // --- CORRECTED ACCESS ---
        const availableLegs = apiResponse.legs || []; // Access the 'legs' property
        // --- END CORRECTION ---

        console.log(`[WebRoute GET /plan/create] Passing ${availableLegs.length} legs to view.`);

        res.render('plan-create', {
            pageTitle: 'Create Flight Plan',
            currentUser: req.session.user,
            availableLegsJson: JSON.stringify(availableLegs), // Pass legs as JSON string
            pageError: null // Initialize pageError as null
        });
    } catch (error) {
         console.error("[WebRoute GET /plan/create] Error fetching legs for builder:", error);
         res.status(500).render('plan-create', {
             pageTitle: 'Create Flight Plan',
             currentUser: req.session.user,
             availableLegsJson: '[]',
             pageError: `Could not load available flights: ${error.message || 'Server error'}`
         });
    }
});

// --- Handle Flight Plan Creation from Web Route ---
router.post('/plan/create-web', requireLogin, async (req, res, next) => { // Added next
    const { planName, legs } = req.body;
    const robloxId = req.session.user?.robloxId; // Safely access robloxId

    // Validate input received from client-side JS
    if (!robloxId) { // Should not happen if requireLogin works, but check
         return res.status(401).json({ success: false, message: 'User session not found.' });
    }
    if (!planName || !legs || !Array.isArray(legs) || legs.length === 0) {
        return res.status(400).json({ success: false, message: 'Plan Name and at least one flight leg are required.' });
    }

    try {
        console.log(`[WebRoute POST /plan/create-web] User ${robloxId} creating plan '${planName}' with ${legs.length} legs.`);
        // Prepare data for the API Client
        const planData = {
            robloxId: robloxId,
            planName: planName,
            legs: legs.map(leg => ({ // Ensure only required fields are sent to API
                flightReference: leg.flightReference,
                segmentFlightCode: leg.segmentFlightCode,
                departureIata: leg.departureIata,
                arrivalIata: leg.arrivalIata
            }))
            // Let API generate planReference if needed, or generate here
            // planReference: `WEB-${robloxId}-${Date.now()}`
        };

        // Use the apiClient instance defined above
        const result = await apiClient.createFlightPlan(planData);
        console.log('[WebRoute POST /plan/create-web] API Success:', result.message);

        // Send success response back to client-side JS
        res.status(201).json({
             success: true,
             message: result.message || 'Flight plan created successfully!',
             planReference: result.plan?.planReference
             // redirectUrl: '/my-plans' // Optionally tell client where to go
         });

    } catch (error) {
        console.error("[WebRoute POST /plan/create-web] Error:", error.status, error.message, error.details);
        // Pass error to the error handler or send JSON response
        res.status(error.status || 500).json({
            success: false,
            message: error.message || 'Failed to create flight plan.'
        });
        // next(error); // Alternative: use central error handler
    }
});

// --- Protected Routes (Require Login) ---
// Apply requireLogin middleware to all routes defined after this point in this router
// OR apply it individually

router.get('/dashboard', requireLogin, (req, res) => {
    // User is logged in because requireLogin passed
    res.render('dashboard', {
        pageTitle: 'Dashboard',
        user: req.session.user // Pass user info to the view
    });
});

router.get('/search', requireLogin, (req, res) => {
     res.render('search', {
         pageTitle: 'Search Flights',
         user: req.session.user
     });
});

// Placeholder for flight search results route
router.get('/flights/results', requireLogin, async (req, res) => {
    // TODO: Implement flight search logic here
    // 1. Get query params (origin, dest, date)
    // 2. Call API client to search flights
    // 3. Render results view
    res.send(`Flight results page (TODO) - Origin: ${req.query.originIata}, Dest: ${req.query.destinationIata}, Date: ${req.query.departureDate}`);
});

 // Placeholder for create plan route
 router.post('/plans/create-web', requireLogin, async (req, res) => {
     // TODO: Implement plan creation logic here
     // 1. Get selected legs from req.body
     // 2. Get user ID from req.session.user.robloxId
     // 3. Call API client to create plan
     // 4. Redirect
     res.send(`Create plan endpoint (TODO) for user ${req.session.user.robloxId}`);
 });

 router.get('/flight-list', requireLogin, async (req, res, next) => { // Added next for error handling
    try {
        const page = parseInt(req.query.page || '1', 10);
        const limit = 50; // Fetch more legs if listing all on one page initially
        console.log(`[WebRoute GET /flight-list] Fetching page ${page}`);

        // Use the apiClient instance defined above
        const apiResponse = await apiClient.listFlights({ page: page, limit: limit });

        res.render('flight-list', {
            pageTitle: 'Available Flights',
            legs: apiResponse.legs || [],
            // Pass pagination data if API provides it
            currentPage: apiResponse.page || page,
            totalPages: apiResponse.totalPages || 1,
            totalFlights: apiResponse.totalFlights || apiResponse.legs?.length || 0, // Adjust if API sends totalLegs
            currentUser: req.session.user
        });
    } catch (error) {
        console.error("[WebRoute GET /flight-list] Error:", error.status, error.message);
        // Pass error to the main error handler defined in server.js
        next(error);
        // Or render error page directly:
        // res.status(500).render('error', { ... });
    }
});

module.exports = router;