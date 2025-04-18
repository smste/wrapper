// apiClient.js (Corrected and Completed)
const axios = require('axios');

class ApiClient {
    /**
     * Creates an instance of the API client.
     * @param {string} baseURL - The base URL of your API (e.g., 'http://localhost:3000').
     * @param {string} apiKey - Your secret API key.
     * @param {number} [timeout=5000] - Request timeout in milliseconds.
     */
    constructor(baseURL, apiKey, timeout = 5000) {
        // --- Log received values (keep for debugging if needed) ---
        console.log('[ApiClient Constructor] Received baseURL:', baseURL);
        console.log('[ApiClient Constructor] Received apiKey:', apiKey ? '****** (Received)' : '!!! NOT RECEIVED !!!');

        // --- Complete Error Checks ---
        if (!baseURL || typeof baseURL !== 'string') {
            throw new Error('API base URL (string) is required for ApiClient.');
        }
        if (!apiKey || typeof apiKey !== 'string') {
            throw new Error('API key (string) is required for ApiClient.');
        }

        // --- Complete Axios Instance Creation ---
        this.client = axios.create({
            baseURL: baseURL,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-API-Key': apiKey, // Set the API key header for all requests
            },
            timeout: timeout,
        });

        // Log after creation (keep for debugging if needed)
        console.log(`[ApiClient Constructor] Axios instance created. BaseURL in defaults: >>${this.client.defaults.baseURL}<<`);

        // --- Re-add Axios Response Interceptor ---
        // This simplifies handling successful responses and errors centrally.
        this.client.interceptors.response.use(
            (response) => {
                // On success (2xx status codes), return only the response data
                return response.data;
            },
            (error) => {
                // On error, log details and reject with structured error info
                const status = error.response?.status;
                const data = error.response?.data;
                // Use the error message from the API response if available
                const message = data?.error || data?.message || error.message || 'An unknown API error occurred';

                console.error(`API Request Failed: ${status || 'Network Error'} - ${message}`, data || '');

                // Reject with a structured error object including status
                return Promise.reject({
                    status: status || null,
                    message: message,
                    details: data || null,
                });
            }
        );
    } // End of constructor

    // =========================================
    // --- User Methods ---
    // =========================================

    async getUser(robloxId) {
        if (!robloxId || typeof robloxId !== 'number' || robloxId <= 0) {
            return Promise.reject({ status: 400, message: 'Invalid Roblox ID provided.' });
        }
        return this.client.get(`/users/${robloxId}`);
    }

    async createUser(robloxId, discordId = null) {
        if (!robloxId || typeof robloxId !== 'number' || robloxId <= 0) {
            return Promise.reject({ status: 400, message: 'Invalid Roblox ID provided.' });
        }
        const payload = {};
        if (discordId) {
            if (typeof discordId !== 'string' || discordId.length < 17) {
                 return Promise.reject({ status: 400, message: 'Invalid Discord ID provided.' });
            }
            payload.discordId = discordId;
        }
        return this.client.post(`/users/${robloxId}`, payload);
    }

    async setUserPoints(robloxId, points) {
        if (!robloxId || typeof robloxId !== 'number' || robloxId <= 0) {
            return Promise.reject({ status: 400, message: 'Invalid Roblox ID provided.' });
        }
        if (typeof points !== 'number' || !Number.isInteger(points)) {
             return Promise.reject({ status: 400, message: 'Points must be an integer.' });
        }
        return this.client.post(`/users/${robloxId}/points`, { points });
    }

    async linkUserDiscord(robloxId, discordId) {
         if (!robloxId || typeof robloxId !== 'number' || robloxId <= 0) {
            return Promise.reject({ status: 400, message: 'Invalid Roblox ID provided.' });
        }
        if (!discordId || typeof discordId !== 'string' || discordId.length < 17) {
             return Promise.reject({ status: 400, message: 'Invalid Discord ID provided.' });
        }
        return this.client.post(`/users/${robloxId}/discord`, { discordId });
    }

    async getUserByDiscordId(discordId) {
        if (!discordId || typeof discordId !== 'string' || discordId.length < 17) {
             return Promise.reject({ status: 400, message: 'Invalid Discord ID provided.' });
        }
        // Remove extra logs/try-catch now, rely on interceptor
        // console.log(`--- DEBUG [getUserByDiscordId] ---`);
        // console.log(`Attempting GET request to path: /users/discord/${discordId}`);
        // console.log(`Is this.client defined? : ${!!this.client}`);
        // console.log(`BaseURL from defaults    : >>${this.client?.defaults?.baseURL}<<`);
        return this.client.get(`/users/discord/${discordId}`);
    }

    // =========================================
    // --- Flight Methods ---
    // =========================================

    async getFlight(flightReference) {
        if (!flightReference || typeof flightReference !== 'string') {
             return Promise.reject({ status: 400, message: 'Invalid flight reference provided.' });
        }
        return this.client.get(`/flights/${encodeURIComponent(flightReference)}`);
    }

    async createFlight(flightReference, departure, dispatcher, date_of_event, arrivals = null) {
        if (!flightReference || typeof flightReference !== 'string') {
             return Promise.reject({ status: 400, message: 'Invalid flight reference provided.' });
        }
        // Basic validation, more detailed validation happens API-side
        if (!departure || !dispatcher || !date_of_event) {
            return Promise.reject({ status: 400, message: 'Departure, dispatcher, and date_of_event are required.' });
        }
        const payload = { departure, dispatcher, date_of_event };
        if (arrivals && Array.isArray(arrivals)) {
            payload.arrivals = arrivals; // Include optional arrivals
        }
        return this.client.post(`/flights/${encodeURIComponent(flightReference)}`, payload);
    }

    async getFlightArrivals(flightReference, iata = null) {
         if (!flightReference || typeof flightReference !== 'string') {
             return Promise.reject({ status: 400, message: 'Invalid flight reference provided.' });
        }
        let url = `/flights/${encodeURIComponent(flightReference)}/arrivals/`;
        if (iata) {
             if (typeof iata !== 'string' || iata.length !== 3) {
                 return Promise.reject({ status: 400, message: 'Invalid IATA code provided.' });
             }
            url += `${encodeURIComponent(iata.toUpperCase())}`;
        }
        return this.client.get(url);
    }

    async createFlightArrival(flightReference, arrivalData) {
         if (!flightReference || typeof flightReference !== 'string') {
             return Promise.reject({ status: 400, message: 'Invalid flight reference provided.' });
        }
         if (!arrivalData || typeof arrivalData !== 'object') {
             return Promise.reject({ status: 400, message: 'Arrival data object is required.' });
         }
         // Expects full arrival data including scheduledArrivalTime (ISO string)
        return this.client.post(`/flights/${encodeURIComponent(flightReference)}/arrivals`, arrivalData);
    }

    async addPlayerToArrivalLeg(flightReference, arrivalIata, robloxId, preferences = {}) {
        if (!flightReference || !arrivalIata || !robloxId) {
             return Promise.reject({ status: 400, message: 'flightReference, arrivalIata, and robloxId are required.' });
        }
        if (typeof robloxId !== 'number' || robloxId <= 0) {
             return Promise.reject({ status: 400, message: 'Invalid Roblox ID provided.' });
        }
         // Basic check for IATA format
         if (typeof arrivalIata !== 'string' || arrivalIata.length !== 3) {
             return Promise.reject({ status: 400, message: 'Invalid Arrival IATA format provided.' });
         }
        const url = `/flights/${encodeURIComponent(flightReference)}/arrivals/${encodeURIComponent(arrivalIata.toUpperCase())}/players/${robloxId}`;
        return this.client.post(url, preferences);
    }

    async updatePlayerPreferencesOnArrivalLeg(flightReference, arrivalIata, robloxId, preferences) {
        if (!flightReference || !arrivalIata || !robloxId) {
             return Promise.reject({ status: 400, message: 'flightReference, arrivalIata, and robloxId are required.' });
        }
        if (typeof robloxId !== 'number' || robloxId <= 0) {
             return Promise.reject({ status: 400, message: 'Invalid Roblox ID provided.' });
        }
         if (typeof arrivalIata !== 'string' || arrivalIata.length !== 3) {
             return Promise.reject({ status: 400, message: 'Invalid Arrival IATA format provided.' });
         }
        if (!preferences || typeof preferences !== 'object' || (!preferences.class_upgrade && !preferences.seating_location)) {
            return Promise.reject({ status: 400, message: 'At least one preference (class_upgrade or seating_location) must be provided.' });
        }
        const url = `/flights/${encodeURIComponent(flightReference)}/arrivals/${encodeURIComponent(arrivalIata.toUpperCase())}/players/${robloxId}/preferences`;
        return this.client.patch(url, preferences); // Use PATCH for updates
    }

    // =========================================
    // --- Flight Plan Methods ---
    // =========================================

    async createFlightPlan(planData) {
        // Expects planData = { planReference, robloxId, legs: [ { flightReference, segmentFlightCode, departureIata, arrivalIata } ], planName? }
        if (!planData || !planData.planReference || !planData.robloxId || !planData.legs || !Array.isArray(planData.legs) || planData.legs.length === 0) {
             return Promise.reject({ status: 400, message: 'planReference, robloxId, and at least one leg are required to create a plan.' });
        }
        return this.client.post('/plans', planData);
    }

    async getPlan(planReference) {
        if (!planReference || typeof planReference !== 'string') {
             return Promise.reject({ status: 400, message: 'Invalid plan reference provided.' });
        }
        return this.client.get(`/plans/${encodeURIComponent(planReference)}`);
    }

    async getUserPlans(robloxId, statuses = []) {
        if (!robloxId || typeof robloxId !== 'number' || robloxId <= 0) {
            return Promise.reject({ status: 400, message: 'Invalid Roblox ID provided.' });
        }
        let url = `/plans/user/${robloxId}`;
        if (statuses && Array.isArray(statuses) && statuses.length > 0) {
            const statusParams = statuses.map(s => `status=${encodeURIComponent(s)}`).join('&');
            url += `?${statusParams}`;
        }
        return this.client.get(url);
    }

    async updatePlanStatus(planReference, status) {
        if (!planReference || typeof planReference !== 'string') {
             return Promise.reject({ status: 400, message: 'Invalid plan reference provided.' });
        }
        const validStatuses = ['Planned', 'Active', 'Completed', 'Cancelled'];
        if (!status || !validStatuses.includes(status)) {
             return Promise.reject({ status: 400, message: `Invalid status value. Must be one of: ${validStatuses.join(', ')}` });
        }
        return this.client.patch(`/plans/${encodeURIComponent(planReference)}/status`, { status });
    }

    async deletePlan(planReference) {
        if (!planReference || typeof planReference !== 'string') {
             return Promise.reject({ status: 400, message: 'Invalid plan reference provided.' });
        }
        return this.client.delete(`/plans/${encodeURIComponent(planReference)}`);
    }

} // End of ApiClient class

module.exports = ApiClient;