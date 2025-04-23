// middleware/requireLogin.js

// Middleware to check if a user is logged in via session
const requireLogin = (req, res, next) => {
    if (!req.session.user || !req.session.user.robloxId) {
        // Store the URL they were trying to access (optional)
        // req.session.returnTo = req.originalUrl;
        console.log('[Auth] Access denied. No user session found. Redirecting to login.');
        return res.redirect('/login'); // Redirect to login page
    }
    // User is logged in, proceed to the next middleware or route handler
    next();
};

module.exports = requireLogin;