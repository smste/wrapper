// middleware/gameServerAuth.js
const config = require('../config'); // Your config object loading .env

const gameServerAuth = (req, res, next) => {
    const providedKey = req.header('X-GameServer-Key'); // Read the header

    if (!config.gameServerSecretKey) {
        console.error("GAME_SERVER_SECRET_KEY is not configured on the API server.");
        // Don't give too much info back in the error
        return res.status(500).json({ success: false, message: 'Server configuration error.' });
    }

    if (!providedKey || providedKey !== config.gameServerSecretKey) {
        console.warn(`Failed Game Server Auth attempt. Provided Key: ${providedKey ? providedKey.substring(0, 5) + '...' : 'None'}`);
        // 401 Unauthorized or 403 Forbidden are appropriate
        return res.status(401).json({ success: false, message: 'Unauthorized: Invalid or missing Game Server Key.' });
    }

    // Key is valid, allow request to proceed to the controller
    next();
};

module.exports = gameServerAuth;