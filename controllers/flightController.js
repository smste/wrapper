// controllers/flightController.js
const Flight = require('../models/Flight');
const User = require('../models/User'); // May need user info sometimes

// Helper to handle 'not found' errors
const checkFlightNotFound = (doc, ref) => {
    if (!doc) {
        const error = new Error(`Flight with reference ${ref} not found.`);
        error.statusCode = 404;
        throw error;
    }
};

 // Helper to find player index in flight
const findPlayerIndex = (flight, robloxId) => {
    const index = flight.players.findIndex(p => p.robloxId === parseInt(robloxId, 10));
    if (index === -1) {
        const error = new Error(`Player with Roblox ID ${robloxId} not found on flight ${flight.flight_reference}.`);
        error.statusCode = 404;
        throw error;
    }
    return index;
}

// GET /flights/:flight_reference
exports.getFlightByReference = async (req, res, next) => {
    try {
        const { flight_reference } = req.params;
        // Find by reference OR departure IATA (adjust if logic needs to be stricter)
        const flight = await Flight.findOne({
            $or: [
                { flight_reference: flight_reference },
                { "departure.iata": flight_reference.toUpperCase() } // Assuming ref might be IATA
            ]
         }).lean(); // Use lean for read-only

        checkFlightNotFound(flight, flight_reference);
        res.status(200).json(flight);
    } catch (error) {
        next(error);
    }
};

 // GET /flights/:flight_reference/arrivals/:iata?
 exports.getFlightArrivals = async (req, res, next) => {
    try {
        // Destructure both potentially available params
        const { flight_reference, iata } = req.params;

        const flight = await Flight.findOne({
            $or: [
                { flight_reference: flight_reference },
                { "departure.iata": flight_reference.toUpperCase() }
            ]
        }, { arrivals: 1 }).lean(); // Only select arrivals field

        checkFlightNotFound(flight, flight_reference); // Use existing helper

        // Check if the 'iata' parameter was provided in the request URL
        if (iata) {
            // If iata exists, find the specific arrival
            const arrival = flight.arrivals.find(arr => arr.iata === iata.toUpperCase()); // Already converting iata in validation, but good to be sure
            if (!arrival) {
                const error = new Error(`Arrival airport ${iata.toUpperCase()} not found for flight ${flight_reference}.`);
                error.statusCode = 404;
                throw error;
            }
            // Return the specific arrival
            return res.status(200).json(arrival);
        } else {
            // If no 'iata' param was in the URL, return all arrivals
            return res.status(200).json(flight.arrivals || []); // Return empty array if no arrivals field/array
        }
    } catch (error) {
        next(error);
    }
};


// POST /flights/:flight_reference
exports.createFlight = async (req, res, next) => {
    try {
        const { flight_reference } = req.params;
        // Destructure required fields AND the now optional 'arrivals' field
        const { departure, dispatcher, date_of_event, arrivals } = req.body;

        const existingFlight = await Flight.findOne({ flight_reference: flight_reference });
        if (existingFlight) {
            return res.status(409).json({ message: 'Flight reference already exists.' });
        }

        // Prepare flight data for creation
        const flightData = {
            flight_reference,
            departure: { // Ensure nested structure matches schema
                airport: departure.airport,
                iata: departure.iata,
                time_format: departure.time_format,
            },
            dispatcher,
            date_of_event: {
                date: date_of_event.date, // Assuming validated as ISO date string
                time: date_of_event.time,
            },
            // --- MODIFIED ---
            // Use the 'arrivals' from the request body if it's a valid array, otherwise default to empty
            arrivals: (arrivals && Array.isArray(arrivals)) ? arrivals : [],
            players: [] // Players are still added separately later
        };

        const newFlight = new Flight(flightData);
        const savedFlight = await newFlight.save();

        res.status(201).json({ message: 'Flight created successfully.', flight: savedFlight });
    } catch (error) {
         if (error.code === 11000) { // Handle potential race condition for unique index
            return res.status(409).json({ message: 'Flight reference already exists (concurrent creation).' });
        }
        next(error); // Pass other errors to the handler
    }
};

// POST /flights/:flight_reference/arrivals
exports.createArrival = async (req, res, next) => {
    try {
        const { flight_reference } = req.params;
        // Destructure expecting scheduledArrivalTime instead of time_format
        const { airport, iata, scheduledArrivalTime, flight_code, aircraft, upgrade_availability_business, upgrade_availability_first, upgrade_availability_chairmans } = req.body;

        const flight = await Flight.findOne({ flight_reference: flight_reference });
        // ... (check flight not found) ...

        // Check if arrival with the same IATA already exists (optional)
        // ...

        // Create the new arrival subdocument data
        const newArrivalData = {
            airport, iata, scheduledArrivalTime, // Use the Date object here
            flight_code, aircraft, upgrade_availability_business,
            upgrade_availability_first, upgrade_availability_chairmans,
            players: [] // Initialize empty players array for the new arrival
        };

        flight.arrivals.push(newArrivalData);
        const updatedFlight = await flight.save();
        const newArrival = updatedFlight.arrivals.find(arr => /* find criteria, e.g., by _id if needed */ arr.iata === iata); // Adjust find logic if needed

        res.status(201).json({ message: 'Arrival created and added to flight.', arrival: newArrival || newArrivalData });
    } catch (error) {
        next(error);
    }
};

// controllers/flightController.js
// ... other requires (Flight, User) ...

/**
 * POST /flights/:flight_reference/arrivals/:arrivalIata/players/:robloxId
 * Adds a player to a specific arrival leg of a flight.
 */
exports.addPlayerToArrivalLeg = async (req, res, next) => {
    try {
        const { flight_reference, arrivalIata, robloxId: robloxIdStr } = req.params;
        const preferences = req.body; // Optional preferences { class_upgrade?, seating_location? }
        const robloxId = parseInt(robloxIdStr, 10);

        // Validate Roblox ID format
        if (isNaN(robloxId) || robloxId <= 0) {
            return res.status(400).json({ message: 'Invalid Roblox ID format.' });
        }

        // 1. Validate Player Exists in User DB
        const userExists = await User.exists({ robloxId: robloxId });
        if (!userExists) {
            return res.status(404).json({ message: `User with Roblox ID ${robloxId} not found.` });
        }

        // 2. Find the Flight document
        const flight = await Flight.findOne({ flight_reference: flight_reference });
        if (!flight) {
             return res.status(404).json({ message: `Flight with reference '${flight_reference}' not found.` });
        }

        // 3. Find the specific arrival segment by IATA
        const arrivalIndex = flight.arrivals.findIndex(arr => arr.iata === arrivalIata.toUpperCase());
        if (arrivalIndex === -1) {
             return res.status(404).json({ message: `Arrival segment with IATA '<span class="math-inline">\{arrivalIata\}' not found on flight '</span>{flight_reference}'.` });
        }
        const arrivalSegment = flight.arrivals[arrivalIndex]; // Get the subdocument reference

        // 4. Check if player is already on this leg
        const playerAlreadyExists = arrivalSegment.players.some(p => p.robloxId === robloxId);
        if (playerAlreadyExists) {
            return res.status(409).json({ message: `Player ${robloxId} is already on arrival leg ${arrivalIata} of flight ${flight_reference}.` });
        }

        // 5. Add player to the arrival segment's players array
        const playerToAdd = {
             robloxId: robloxId,
             // Apply preferences from body or let schema defaults handle it
             ...(preferences.class_upgrade && { class_upgrade: preferences.class_upgrade }),
             ...(preferences.seating_location && { seating_location: preferences.seating_location }),
         };
        arrivalSegment.players.push(playerToAdd);

        // 6. Save the updated flight document
        const updatedFlight = await flight.save();

        // Find the added player data in the saved document to return it
        const addedPlayerData = updatedFlight.arrivals[arrivalIndex].players.find(p => p.robloxId === robloxId);

        res.status(201).json({
             message: `Player ${robloxId} added successfully to arrival leg ${arrivalIata} of flight ${flight_reference}.`,
             player: addedPlayerData
        });

    } catch (error) {
         // Handle potential Mongoose validation errors during save etc.
         if (error.name === 'ValidationError') {
             return res.status(400).json({ message: 'Validation Error adding player', errors: error.errors });
         }
        next(error);
    }
};

exports.updatePlayerPreferencesOnArrivalLeg = async (req, res, next) => {
    try {
        const { flight_reference, arrivalIata, robloxId: robloxIdStr } = req.params;
        const { class_upgrade, seating_location } = req.body; // Get potential updates from body
        const robloxId = parseInt(robloxIdStr, 10);

        // Validate Roblox ID format (redundant if param validation is strict, but safe)
        if (isNaN(robloxId) || robloxId <= 0) {
            return res.status(400).json({ message: 'Invalid Roblox ID format.' });
        }

        // 1. Find the Flight document (use exec() for clearer promise handling)
        const flight = await Flight.findOne({ flight_reference: flight_reference }).exec();
        if (!flight) {
            return res.status(404).json({ message: `Flight with reference '${flight_reference}' not found.` });
        }

        // 2. Find the specific arrival segment by IATA
        const arrivalIndex = flight.arrivals.findIndex(arr => arr.iata === arrivalIata.toUpperCase());
        if (arrivalIndex === -1) {
            return res.status(404).json({ message: `Arrival segment with IATA '${arrivalIata}' not found on flight '${flight_reference}'.` });
        }
        const arrivalSegment = flight.arrivals[arrivalIndex]; // Get the subdocument reference

        // 3. Find the player within this arrival leg's players array
        // Mongoose subdocuments don't have findIndex directly, access the array
        const playerIndex = arrivalSegment.players.findIndex(p => p.robloxId === robloxId);
        if (playerIndex === -1) {
             return res.status(404).json({ message: `Player ${robloxId} not found on arrival leg ${arrivalIata} of flight ${flight_reference}.` });
        }
        const playerToUpdate = arrivalSegment.players[playerIndex]; // Get the player subdocument reference

        // 4. Update fields if they were provided in the request body
        let updated = false;
        if (class_upgrade !== undefined) {
            playerToUpdate.class_upgrade = class_upgrade;
            updated = true;
        }
        if (seating_location !== undefined) {
            playerToUpdate.seating_location = seating_location;
            updated = true;
        }

        if (!updated) {
            // Should be caught by validation, but good practice
            return res.status(400).json({ message: 'No valid preference fields provided for update.' });
        }

        // 5. Mark the specific path as modified (important for nested arrays/objects)
        flight.markModified(`arrivals.${arrivalIndex}.players.${playerIndex}`);

        // 6. Save the updated flight document
        const updatedFlight = await flight.save();

        // 7. Find the updated player data to return
        const updatedPlayerData = updatedFlight.arrivals[arrivalIndex].players[playerIndex];

        res.status(200).json({
            message: `Preferences updated successfully for player ${robloxId} on arrival leg ${arrivalIata}.`,
            player: updatedPlayerData
        });

    } catch (error) {
        // Handle potential Mongoose validation errors during save etc.
        if (error.name === 'ValidationError') {
            return res.status(400).json({ message: 'Validation Error updating preferences', errors: error.errors });
        }
        next(error);
    }
};

// --- TODO (Optional but Recommended) ---
// Add controller for PATCH /flights/:flight_reference/arrivals/:arrivalIata/players/:robloxId/preferences
// exports.updatePlayerPreferencesOnArrivalLeg = async (req, res, next) => { /* ... */ };

// --- REMOVE/COMMENT OUT OLD CONTROLLERS ---
// exports.addPlayerToFlight = async (req, res, next) => { /* ... OLD LOGIC ... */ };
// exports.updatePlayerPreferences = async (req, res, next) => { /* ... OLD LOGIC ... */ };

// ... other existing flight controllers (createFlight, getFlight, createArrival etc.) ...