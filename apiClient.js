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

    /**
     * GET /flights - List flights formatted as plannable legs.
     * @param {object} [params] - Optional query parameters (e.g., { page: 1, limit: 20 }).
     * @returns {Promise<object>} Object containing legs array (and potentially pagination data).
     */
    async listFlights(params = {}) {
        const queryParams = new URLSearchParams(params).toString();
        const url = `/flights${queryParams ? '?' + queryParams : ''}`;
        console.log(`[ApiClient] Calling GET ${url}`);
        return this.client.get(url); // Interceptor should return response.data { legs: [...] }
    }

    /**
     * POST /plans - Creates a new flight plan.
     * @param {object} planData - Plan details { planReference?, robloxId, legs: [ { flightReference, segmentFlightCode, departureIata, arrivalIata } ], planName? }.
     * @returns {Promise<object>} API response { message, plan }.
     */
    async createFlightPlan(planData) {
        if (!planData || !planData.robloxId || !planData.legs || !Array.isArray(planData.legs) || planData.legs.length === 0) {
             return Promise.reject({ status: 400, message: 'robloxId and at least one leg are required to create a plan.' });
        }
        // Generate plan reference client-side if API doesn't
        if (!planData.planReference) {
            planData.planReference = `WEB-${planData.robloxId}-${Date.now()}`;
        }
        console.log('[ApiClient] Calling POST /plans');
        return this.client.post('/plans', planData);
    }

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

    async listFlights(params = {}) { // params = { page: 1, limit: 20, status: 'Planned', ... }
        const queryParams = new URLSearchParams(params).toString();
        const url = `/flights${queryParams ? '?' + queryParams : ''}`;
        return this.client.get(url);
    }

    async getFlight(flightReference) {
        if (!flightReference || typeof flightReference !== 'string') {
             return Promise.reject({ status: 400, message: 'Invalid flight reference provided.' });
        }
        return this.client.get(`/flights/${encodeURIComponent(flightReference)}`);
    }

    /**
     * Creates a new flight.
     * @param {string} flightReference - Unique flight reference.
     * @param {object} departure - Departure details { airport, iata, time_format }.
     * @param {string} dispatcher - Dispatcher name/ID.
     * @param {string} eventDate - Event date string (YYYY-MM-DD).
     * @param {string} eventTime - Event time string (HH:mm or HH:mm:ss).
     * @param {string|null} [eventTimezone] - Optional event timezone (e.g., Australia/Sydney, +10:00). Defaults API-side if null.
     * @param {Array|null} [arrivals] - Optional array of initial arrival objects.
     * @returns {Promise<object>} API response { message, flight }.
     */
    /**
     * Creates a new flight. Assumes event time is AEST/AEDT if timezone omitted API-side.
     * @param {string} flightReference - Unique flight reference.
     * @param {object} departure - Departure details { airport, iata, time_format }.
     * @param {string} dispatcher - Dispatcher name/ID.
     * @param {string} eventDate - Event date string (YYYY-MM-DD).
     * @param {string} eventTime - Event time string (HH:mm or HH:mm:ss).
     * @param {Array|null} [arrivals] - Optional array of initial arrival objects (each needing date/time strings).
     * @returns {Promise<object>} API response { message, flight }.
     */
    async createFlight(flightReference, departure, dispatcher, eventDate, eventTime, arrivals = null) { // Removed eventTimezone param
        if (!flightReference || !departure || !dispatcher || !eventDate || !eventTime) {
            return Promise.reject({ status: 400, message: 'flightReference, departure, dispatcher, eventDate, and eventTime are required.' });
        }
        const payload = {
            departure,
            dispatcher,
            event_date: eventDate,
            event_time: eventTime,
            // event_timezone is no longer sent
        };
        if (arrivals && Array.isArray(arrivals)) {
            // Ensure arrival objects only contain date/time STRINGS expected by updated API
            payload.arrivals = arrivals.map(arr => ({
                 airport: arr.airport,
                 iata: arr.iata,
                 scheduledArrivalDate: arr.scheduledArrivalDate, // String YYYY-MM-DD
                 scheduledArrivalTimeStr: arr.scheduledArrivalTimeStr, // String HH:mm:ss
                 // scheduledArrivalTimezone: REMOVED
                 flight_code: arr.flight_code,
                 aircraft: arr.aircraft,
                 upgrade_availability_business: arr.upgrade_availability_business,
                 upgrade_availability_first: arr.upgrade_availability_first,
                 upgrade_availability_chairmans: arr.upgrade_availability_chairmans,
            }));
        }
        return this.client.post(`/flights/${encodeURIComponent(flightReference)}`, payload);
    }

    /**
     * POST /flights/:flight_reference/arrivals - Add Arrival
     * Assumes AEST/AEDT API-side. arrivalData needs date/time strings.
     */
    async createFlightArrival(flightReference, arrivalData) {
        // arrivalData should contain airport, iata, scheduledArrivalDate, scheduledArrivalTimeStr, flight_code, etc.
        // NO scheduledArrivalTimezone expected here anymore.
        if (!flightReference) return Promise.reject({ status: 400, message: 'Flight reference is required.' });
        if (!arrivalData || typeof arrivalData !== 'object' || !arrivalData.iata || !arrivalData.scheduledArrivalDate || !arrivalData.scheduledArrivalTimeStr /*...*/) {
             return Promise.reject({ status: 400, message: 'Valid arrival data object including date/time strings is required.' });
        }
        return this.client.post(`/flights/${encodeURIComponent(flightReference)}/arrivals`, arrivalData);
    }

    /**
     * PATCH /flights/:flight_reference/arrivals/:arrivalIata - Update Arrival
     * Assumes AEST/AEDT API-side if time updated. updateData needs date/time strings.
     */
    async updateArrival(flightReference, arrivalIata, updateData) {
        // updateData might contain airport, scheduledArrivalDate, scheduledArrivalTimeStr, etc.
        // NO scheduledArrivalTimezone expected here anymore.
        if (!flightReference || !arrivalIata) return Promise.reject({ status: 400, message: 'Flight reference and arrival IATA are required.' });
        if (!updateData || Object.keys(updateData).length === 0) {
             return Promise.reject({ status: 400, message: 'Update data is required.' });
        }
        const url = `/flights/${encodeURIComponent(flightReference)}/arrivals/${encodeURIComponent(arrivalIata.toUpperCase())}`;
        return this.client.patch(url, updateData);
    }

    async updateFlight(flightReference, updateData) {
        if (!flightReference) return Promise.reject({ status: 400, message: 'Flight reference is required.' });
        if (!updateData || Object.keys(updateData).length === 0) {
             return Promise.reject({ status: 400, message: 'Update data is required.' });
        }
        return this.client.patch(`/flights/${encodeURIComponent(flightReference)}`, updateData);
    }

    async deleteFlight(flightReference) {
        if (!flightReference) return Promise.reject({ status: 400, message: 'Flight reference is required.' });
        return this.client.delete(`/flights/${encodeURIComponent(flightReference)}`);
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

    async deleteArrival(flightReference, arrivalIata) {
        if (!flightReference || !arrivalIata) return Promise.reject({ status: 400, message: 'Flight reference and arrival IATA are required.' });
       const url = `/flights/<span class="math-inline">\{encodeURIComponent\(flightReference\)\}/arrivals/</span>{encodeURIComponent(arrivalIata.toUpperCase())}`;
       return this.client.delete(url);
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

    async removePlayerFromArrivalLeg(flightReference, arrivalIata, robloxId) {
        if (!flightReference || !arrivalIata || !robloxId) return Promise.reject({ status: 400, message: 'Flight reference, arrival IATA, and Roblox ID are required.' });
        if (typeof robloxId !== 'number' || robloxId <= 0) {
            return Promise.reject({ status: 400, message: 'Invalid Roblox ID provided.' });
        }
        if (typeof arrivalIata !== 'string' || arrivalIata.length !== 3) {
            return Promise.reject({ status: 400, message: 'Invalid Arrival IATA format provided.' });
        }
       const url = `/flights/<span class="math-inline">\{encodeURIComponent\(flightReference\)\}/arrivals/</span>{encodeURIComponent(arrivalIata.toUpperCase())}/players/${robloxId}`;
       return this.client.delete(url);
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