// apiClient.js

const axios = require('axios');

class ApiClient {
    constructor(baseURL, apiKey, timeout = 5000) {
        console.log('[ApiClient Constructor] Received baseURL:', baseURL); // Log received value
        console.log('[ApiClient Constructor] Received apiKey:', apiKey ? '****** (Received)' : '!!! NOT RECEIVED !!!'); // Log received value
    
        if (!baseURL || typeof baseURL !== 'string') { /* ... throw error ... */ }
        if (!apiKey || typeof apiKey !== 'string') { /* ... throw error ... */ }
    
        this.client = axios.create({ /* ... */ });
        console.log('[ApiClient Constructor] this.client initialized:', !!this.client); // Check if it got set
    }

    /**
     * Gets user data by their Discord ID.
     * @param {string} discordId - The Discord user ID.
     * @returns {Promise<object>} The user data object.
     * @rejects {object} Error object with status and message on failure.
     */
    async getUserByDiscordId(discordId) {
        if (!discordId || typeof discordId !== 'string' || discordId.length < 17) {
             return Promise.reject({ status: 400, message: 'Invalid Discord ID provided.' });
        }

        // ---> ADD THIS LOG <---
        console.log(`--- DEBUG [getUserByDiscordId] ---`);
        console.log(`Attempting GET request to path: /users/discord/${discordId}`);
        console.log(`Is this.client defined? : ${!!this.client}`); // Should be true
        console.log(`BaseURL from defaults    : >>${this.client?.defaults?.baseURL}<<`); // Check the configured default

        try {
            // This is the line that seems to be failing
            const response = await this.client.get(`/users/discord/${discordId}`);
            return response; // Interceptor returns response.data usually, but let's return full response for now if needed
        } catch (error) {
             console.error(`Error within this.client.get call:`, error.message); // Log specific axios error
             // Re-throw for the interceptor or further handling
             // The interceptor should handle formatting the rejection
             throw error;
        }
    }

    /**
     * Gets flight plans for a specific user.
     * @param {number} robloxId - The Roblox user ID.
     * @param {Array<string>} [statuses] - Optional array of statuses to filter by (e.g., ['Planned', 'Active']). API endpoint must support this.
     * @returns {Promise<Array<object>>} Array of flight plan objects.
     */
    async getUserPlans(robloxId, statuses = []) {
        if (!robloxId || typeof robloxId !== 'number' || robloxId <= 0) {
            return Promise.reject({ message: 'Invalid Roblox ID provided.' });
        }
        let url = `/plans/user/${robloxId}`;
        if (statuses && statuses.length > 0) {
            // Modify this if your API expects statuses differently (e.g., comma-separated)
            const statusParams = statuses.map(s => `status=${encodeURIComponent(s)}`).join('&');
            url += `?${statusParams}`;
        }
        return this.client.get(url); // Assumes GET /plans/user/:robloxId handles filters
    }
}

module.exports = ApiClient;