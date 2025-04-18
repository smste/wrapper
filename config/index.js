// config/index.js
require('dotenv').config();

// config/index.js
// ... inside the module.exports = { ... } block
console.log('[Config] Loaded API_BASE_URL:', process.env.API_BASE_URL); // Check raw env var
console.log('[Config] Loaded API_KEY:', process.env.API_KEY ? '****** (Loaded)' : '!!! NOT LOADED !!!'); // Check raw env var (don't log key itself)
// ... rest of exports

module.exports = {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: process.env.PORT || 3000,
    apiKey: process.env.API_KEY,
    rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10),
    rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10),
    userDbUri: process.env.USER_DB_URI,
    flightDbUri: process.env.FLIGHT_DB_URI,
    flightPlanDbUri: process.env.FLIGHT_PLAN_DB_URI,
    discordToken: process.env.DISCORD_BOT_TOKEN,
    discordClientId: process.env.DISCORD_CLIENT_ID,
    discordGuildId: process.env.DISCORD_GUILD_ID,
    staffRoleId: process.env.STAFF_ROLE_ID,
    apiBaseUrl: process.env.API_BASE_URL,
    gameServerSecretKey: process.env.GAME_SERVER_SECRET_KEY
};