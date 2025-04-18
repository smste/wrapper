// middleware/apiKeyAuth.js
const config = require('../config');

const apiKeyAuth = (req, res, next) => {
    const providedApiKey = req.header('X-API-Key'); // Standard header name

    if (!config.apiKey) {
         console.error("API_KEY environment variable is not set. Server cannot authenticate requests.");
         return res.status(500).json({ error: "Server configuration error." });
    }

    if (!providedApiKey || providedApiKey !== config.apiKey) {
        return res.status(401).json({ error: 'Unauthorized: Invalid or missing API Key.' });
    }

    next(); // API Key is valid, proceed to the next middleware/route handler
};

module.exports = apiKeyAuth;