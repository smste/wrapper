// controllers/authController.js
const axios = require('axios');
const crypto = require('crypto'); // To generate unique login request IDs
const User = require('../models/User'); // Your User model
const WebLoginRequest = require('../models/WebLoginRequest'); // Your pending request model
const { triggerLoginApprovalDm } = require('../bot/botInternalApi'); // Function from bot to send DM

const ROBLOX_USER_API = 'https://users.roblox.com/v1/usernames/users';
const LOGIN_REQUEST_EXPIRY_MINUTES = 3; // How long user has to click button on Discord

/**
 * GET /login
 * Displays the login page. Redirects to dashboard if already logged in.
 */
exports.getLoginPage = (req, res) => {
    if (req.session.user) {
        // User is already logged in, redirect them away from login page
        return res.redirect('/dashboard');
    }
    // Render login page with no error initially
    res.render('login', { pageTitle: 'Login', error: null });
};

/**
 * POST /login
 * Handles username submission, checks link status, initiates Discord verification.
 */
exports.handleLogin = async (req, res) => {
    const { robloxUsername } = req.body;

    // Basic input validation
    if (!robloxUsername || typeof robloxUsername !== 'string' || robloxUsername.trim() === '') {
        return res.status(400).render('login', { pageTitle: 'Login', error: 'Please enter a valid Roblox username.' });
    }
    const trimmedUsername = robloxUsername.trim();

    try {
        // 1. Get Roblox ID from Roblox Username API
        let robloxId = null;
        let exactRobloxUsername = null;
        try {
            console.log(`[Login Attempt] Looking up Roblox username: ${trimmedUsername}`);
            const robloxApiRes = await axios.post(ROBLOX_USER_API, {
                usernames: [trimmedUsername],
                excludeBannedUsers: true
            });

            if (robloxApiRes.data?.data?.length > 0) {
                robloxId = robloxApiRes.data.data[0].id;
                exactRobloxUsername = robloxApiRes.data.data[0].name; // Store the exact case username
                console.log(`[Login Attempt] Found Roblox ID: ${robloxId} for username: ${exactRobloxUsername}`);
            } else {
                console.log(`[Login Attempt] Roblox username not found: ${trimmedUsername}`);
                return res.status(404).render('login', { pageTitle: 'Login', error: `Roblox user '${trimmedUsername}' not found.` });
            }
        } catch (err) {
            // Handle Roblox API errors (e.g., rate limits, downtime)
            console.error("[Login Attempt] Roblox API username lookup failed:", err.response?.status, err.response?.data || err.message);
            return res.status(502).render('login', { pageTitle: 'Login', error: 'Could not verify Roblox username due to an external service error. Please try again later.' }); // 502 Bad Gateway might be appropriate
        }

        // 2. Check Link Status in Your User Database
        console.log(`[Login Attempt] Checking link status for Roblox ID: ${robloxId}`);
        const userAccount = await User.findOne({ robloxId: robloxId }).lean(); // Find by Roblox ID

        if (userAccount && userAccount.discordId) {
            // --- User IS LINKED --- Initiate DM flow ---
            const discordId = userAccount.discordId;
            console.log(`[Login Attempt] User ${robloxId} found and linked to Discord ${discordId}. Initiating DM verification.`);

            // 3. Create Pending Login Request
            const loginRequestId = crypto.randomBytes(16).toString('hex'); // Generate unique ID for this attempt
            const expiresAt = new Date(Date.now() + LOGIN_REQUEST_EXPIRY_MINUTES * 60 * 1000);

            try {
                // Remove any older pending requests for this specific Discord user to avoid confusion
                await WebLoginRequest.deleteMany({ discordId: discordId, status: 'pending' });

                // Create the new pending request document
                await WebLoginRequest.create({
                    loginRequestId,
                    robloxId,
                    discordId,
                    robloxUsername: exactRobloxUsername, // Store exact username
                    status: 'pending',
                    expiresAt,
                });
                 console.log(`[Login Attempt] Created pending WebLoginRequest: ${loginRequestId}`);

            } catch (dbError) {
                 console.error("[Login Attempt] Failed to create WebLoginRequest:", dbError);
                 return res.status(500).render('login', { pageTitle: 'Login', error: 'Failed to initiate login request (database error). Please try again.' });
            }

            // 4. Trigger Bot DM (internal call)
             console.log(`[Login Attempt] Triggering DM for Discord ID ${discordId}, Request ID ${loginRequestId}`);
             const dmSent = await triggerLoginApprovalDm(
                 discordId,
                 exactRobloxUsername,
                 loginRequestId
             );

             if (!dmSent) {
                   console.error(`[Login Attempt] Failed to trigger DM for request ${loginRequestId}. User might have DMs disabled or bot lacks permissions.`);
                    // Inform the user on the webpage that the DM couldn't be sent
                    return res.status(500).render('login', { pageTitle: 'Login', error: 'Could not send confirmation message to your Discord DMs. Please ensure the bot can DM you and try again.' });
             }

            // 5. Show Waiting Page to User
            // Render the page that will establish the WebSocket connection
            console.log(`[Login Attempt] Showing user the 'pending' page for request ${loginRequestId}`);
            return res.render('loginPending', {
                pageTitle: 'Approve Login via Discord',
                loginRequestId: loginRequestId, // Pass ID to the view for WebSocket registration
                expiryMinutes: LOGIN_REQUEST_EXPIRY_MINUTES
            });

        } else {
            // User not found in your DB, OR found but not linked to Discord
            console.log(`[Login Attempt] User ${robloxId} (${exactRobloxUsername}) is not linked via Discord.`);
            return res.status(403).render('login', { // 403 Forbidden might be suitable
                pageTitle: 'Login',
                error: `The Roblox account '${exactRobloxUsername}' is not linked to a Discord account in our system. Please use the /link command in our Discord server and complete the in-game verification first.`
            });
        }

    } catch (error) {
        console.error("[Login Attempt] Unexpected error during login process:", error);
        res.status(500).render('login', { pageTitle: 'Login', error: 'An unexpected server error occurred during login.' });
    }
};

/**
 * POST /auth/finalize-session
 * Handles the request from the browser containing the One-Time Token (OTT)
 * received via WebSocket after Discord approval. Creates the web session.
 */
exports.finalizeWebSession = async (req, res) => {
    const { ott } = req.body; // Get One-Time Token from request body

    if (!ott || typeof ott !== 'string') {
        console.log('[Finalize Session] Received request with missing/invalid OTT.');
        return res.status(400).json({ success: false, message: 'Missing or invalid token.' });
    }

    try {
        // 1. Find the corresponding login request using the OTT
        // Check status is approved and OTT hasn't expired yet
        console.log(`[Finalize Session] Attempting to find approved request with OTT starting: ${ott.substring(0, 6)}...`);
        const loginRequest = await WebLoginRequest.findOne({
            ott: ott,
            status: 'approved', // Must have been approved via Discord button
            ottExpiresAt: { $gt: new Date() } // OTT must still be valid (e.g., within 60s of approval)
        });

        if (!loginRequest) {
            console.warn(`[Finalize Session] Invalid, expired, or already used OTT received.`);
            return res.status(401).json({ success: false, message: 'Invalid, expired, or already used login token.' });
        }

        // --- OTT is valid and matches an approved request ---
        console.log(`[Finalize Session] Valid OTT received for login request ${loginRequest.loginRequestId}, user ${loginRequest.robloxId}.`);

        // 2. Prevent OTT reuse: Mark as consumed or delete immediately
        // Deleting is simpler if history isn't needed for audit
        await WebLoginRequest.deleteOne({ _id: loginRequest._id });
        // Or: loginRequest.status = 'consumed'; await loginRequest.save();
        console.log(`[Finalize Session] Consumed/Deleted login request ${loginRequest.loginRequestId}.`);


        // 3. Regenerate session ID on successful authentication for security
        req.session.regenerate(err => {
             if (err) {
                  console.error("[Finalize Session] Session regeneration error:", err);
                  // Don't reveal internal errors generally
                  return res.status(500).json({ success: false, message: 'Session creation failed (Code: SR_REG).' });
             }

             // 4. Populate session data from the verified login request
             req.session.user = {
                 robloxId: loginRequest.robloxId,
                 discordId: loginRequest.discordId,
                 robloxUsername: loginRequest.robloxUsername
             };

             // 5. Save session before responding
             req.session.save(err => {
                  if(err) {
                       console.error("[Finalize Session] Session save error:", err);
                       return res.status(500).json({ success: false, message: 'Session saving failed (Code: SR_SAVE).' });
                  }
                  console.log(`[Finalize Session] Web session created for user ${loginRequest.robloxId}. Responding success.`);
                  // Respond success - client-side JS will handle redirect based on this
                  res.status(200).json({ success: true, message: 'Login successful.' });
             });
        });

    } catch (error) {
         console.error("[Finalize Session] Error processing OTT:", error);
         res.status(500).json({ success: false, message: 'An internal server error occurred while finalizing login.' });
    }
};


/**
 * POST /logout
 * Destroys the user's session.
 */
exports.handleLogout = (req, res) => {
    const username = req.session.user?.robloxUsername || 'User';
    req.session.destroy(err => {
        if (err) {
             console.error("Logout error:", err);
             // Still try to clear cookie and redirect
        }
        // Ensure the cookie name matches your session config if not 'connect.sid'
        res.clearCookie('connect.sid');
        console.log(`[Logout] Session destroyed for ${username}.`);
        res.redirect('/login'); // Redirect to login page after logout
    });
};