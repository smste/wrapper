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
        // Get date/time parts from body
        const { airport, iata, scheduledArrivalDate, scheduledArrivalTimeStr, scheduledArrivalTimezone, flight_code, aircraft, upgrade_availability_business, upgrade_availability_first, upgrade_availability_chairmans } = req.body;

        // Find the flight (non-lean to save)
        const flight = await Flight.findOne({ flight_reference: flight_reference });
        checkFlightNotFound(flight, flight_reference);

        // Convert input date/time/zone to UTC Date object
        const scheduledArrivalTimeUTC = parseDateTimeInput(scheduledArrivalDate, scheduledArrivalTimeStr, scheduledArrivalTimezone);
        if (!scheduledArrivalTimeUTC) {
             // Should be caught by validation, but safety check
             return res.status(400).json({ message: 'Valid scheduledArrivalDate, scheduledArrivalTimeStr, and scheduledArrivalTimezone are required.'});
        }


        // Check if arrival with the same IATA already exists (optional)
        if (flight.arrivals.some(arr => arr.iata === iata.toUpperCase())) {
             return res.status(409).json({ message: `Arrival with IATA ${iata.toUpperCase()} already exists for this flight.` });
        }

        // Create the new arrival subdocument data
        const newArrivalData = {
            airport,
            iata: iata.toUpperCase(),
            scheduledArrivalTime: scheduledArrivalTimeUTC, // Store the UTC Date object
            flight_code,
            aircraft,
            upgrade_availability_business,
            upgrade_availability_first,
            upgrade_availability_chairmans,
            players: [] // Initialize empty players array
        };

        flight.arrivals.push(newArrivalData);
        const updatedFlight = await flight.save();

        // Find the newly added arrival to return it specifically
        // Mongoose might add an _id, find using that if possible, otherwise by IATA
        const newArrival = updatedFlight.arrivals.find(arr => arr.iata === iata.toUpperCase()); // Simplistic find

        res.status(201).json({ message: 'Arrival created and added to flight.', arrival: newArrival || newArrivalData });
    } catch (error) {
         if (error.name === 'ValidationError') {
             return res.status(400).json({ message: 'Validation Error', errors: error.errors });
         }
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

exports.listFlights = async (req, res, next) => {
    try {
       const { page = 1, limit = 20, /* other filters like status, date_after etc. */ } = req.query;

       const filter = {};
       // Add filter conditions here based on query params if needed
       // e.g., if (req.query.status) filter.status = req.query.status;

       const options = {
           page: parseInt(page, 10),
           limit: parseInt(limit, 10),
           sort: { createdAt: -1 }, // Example sort
           lean: true, // Use lean for read performance
           // Use mongoose-paginate-v2 if installed for easier pagination
       };

       // Basic pagination without extra library
       const skip = (options.page - 1) * options.limit;
       const flights = await Flight.find(filter)
                                   .sort(options.sort)
                                   .skip(skip)
                                   .limit(options.limit)
                                   .lean();
       const totalFlights = await Flight.countDocuments(filter);

       res.status(200).json({
           flights: flights,
           page: options.page,
           limit: options.limit,
           totalPages: Math.ceil(totalFlights / options.limit),
           totalFlights: totalFlights,
       });
    } catch (error) {
       next(error);
    }
};

/**
* PATCH /flights/:flight_reference
* Modify top-level flight details (e.g., dispatcher).
*/
exports.updateFlight = async (req, res, next) => {
   try {
       const { flight_reference } = req.params;
       const updateData = {};

       // Only include fields that are allowed to be updated and were provided
       if (req.body.dispatcher !== undefined) {
            updateData.dispatcher = req.body.dispatcher;
       }
        // Add other updatable fields here (e.g., parse date_of_event with timezone if allowing update)
        // Be cautious updating departure details if arrivals depend on them.

       if (Object.keys(updateData).length === 0) {
           // Should be caught by validation, but good check
            return res.status(400).json({ message: 'No valid fields provided for update.' });
       }

       const updatedFlight = await Flight.findOneAndUpdate(
            { flight_reference: flight_reference },
            { $set: updateData },
            { new: true, runValidators: true } // Return updated doc, run schema validators
       );

       checkFlightNotFound(updatedFlight, flight_reference);

       res.status(200).json({ message: 'Flight updated successfully.', flight: updatedFlight });
   } catch (error) {
       if (error.name === 'ValidationError') {
            return res.status(400).json({ message: 'Validation Error', errors: error.errors });
       }
       next(error);
   }
};

/**
* DELETE /flights/:flight_reference
* Delete a flight and all its associated data.
*/
exports.deleteFlight = async (req, res, next) => {
   try {
       const { flight_reference } = req.params;

       const result = await Flight.findOneAndDelete({ flight_reference: flight_reference });

       checkFlightNotFound(result, flight_reference); // Checks if it existed before deletion

       // Consider implications: Should deleting a flight also delete associated Flight Plans? (Probably not automatically)
       // Maybe change flight status instead (soft delete)? For now, hard delete.

       res.status(200).json({ message: `Flight '${flight_reference}' deleted successfully.` });
        // Or res.status(204).send();
   } catch (error) {
       next(error);
   }
};


/**
* PATCH /flights/:flight_reference/arrivals/:arrivalIata
* Modify details of a specific arrival segment. Handles timezone input.
*/
exports.updateArrival = async (req, res, next) => {
    try {
       const { flight_reference, arrivalIata } = req.params;
       const updateFields = req.body; // Get all potential fields

       // Find flight (non-lean)
       const flight = await Flight.findOne({ flight_reference: flight_reference });
       checkFlightNotFound(flight, flight_reference);

       // Find index of the arrival to update
       const arrivalIndex = findArrivalIndexByIata(flight, arrivalIata); // Throws 404 if not found

       // --- Prepare $set update object for the specific arrival ---
       const setUpdate = {};
       let arrivalPathPrefix = `arrivals.${arrivalIndex}.`; // Path prefix for $set

       // Process each potential field
       if (updateFields.airport !== undefined) setUpdate[arrivalPathPrefix + 'airport'] = updateFields.airport;
       if (updateFields.flight_code !== undefined) setUpdate[arrivalPathPrefix + 'flight_code'] = updateFields.flight_code;
       if (updateFields.aircraft !== undefined) setUpdate[arrivalPathPrefix + 'aircraft'] = updateFields.aircraft;
       if (updateFields.upgrade_availability_business !== undefined) setUpdate[arrivalPathPrefix + 'upgrade_availability_business'] = updateFields.upgrade_availability_business;
       if (updateFields.upgrade_availability_first !== undefined) setUpdate[arrivalPathPrefix + 'upgrade_availability_first'] = updateFields.upgrade_availability_first;
       if (updateFields.upgrade_availability_chairmans !== undefined) setUpdate[arrivalPathPrefix + 'upgrade_availability_chairmans'] = updateFields.upgrade_availability_chairmans;

       // Handle date/time/timezone update
       if (updateFields.scheduledArrivalDate || updateFields.scheduledArrivalTimeStr || updateFields.scheduledArrivalTimezone) {
            // If any part of the time is being updated, we need all parts to reconstruct the date
            const currentDate = flight.arrivals[arrivalIndex].scheduledArrivalTime;
            // Get current parts in AEST/SYDNEY as a default for filling missing pieces? Or require all 3?
            // Let's require all 3 for simplicity when updating time. Validation should enforce this? No, PATCH allows partial.
            // We need to get the *existing* parts if some are missing from the request body to recalculate.

            // Extract existing date/time/zone - This requires careful timezone handling!
            // For simplicity here, let's assume the API *requires* all three parts (date, time, zone) if updating time.
            // The validation `arrivalBodyValidation` needs adjustment for PATCH to require all 3 if any time part is present.
            // OR fetch existing, format it, replace parts, then re-parse. Complex.

            // ---> Simplified Approach: Assume validation requires Date, Time, Zone if ANY are present for PATCH <---
            if (updateFields.scheduledArrivalDate && updateFields.scheduledArrivalTimeStr && updateFields.scheduledArrivalTimezone) {
                const scheduledArrivalTimeUTC = parseDateTimeInput(
                    updateFields.scheduledArrivalDate,
                    updateFields.scheduledArrivalTimeStr,
                    updateFields.scheduledArrivalTimezone
                );
                 if (!scheduledArrivalTimeUTC) throw new Error('Invalid date/time/timezone combination provided for update.'); // Caught by try/catch
                 setUpdate[arrivalPathPrefix + 'scheduledArrivalTime'] = scheduledArrivalTimeUTC;
            } else if (updateFields.scheduledArrivalDate || updateFields.scheduledArrivalTimeStr || updateFields.scheduledArrivalTimezone) {
                 // If only some parts are provided, return an error (or implement complex merge logic)
                return res.status(400).json({ message: 'To update arrival time, please provide all three fields: scheduledArrivalDate (YYYY-MM-DD), scheduledArrivalTimeStr (HH:mm:ss), and scheduledArrivalTimezone (e.g., Australia/Sydney or +10:00).' });
            }
       }


       if (Object.keys(setUpdate).length === 0) {
            return res.status(400).json({ message: 'No valid fields provided for arrival update.' });
       }

       // --- Perform Update using findOneAndUpdate to target the specific arrival ---
        const updatedFlight = await Flight.findOneAndUpdate(
            { _id: flight._id, 'arrivals.iata': arrivalIata.toUpperCase() }, // Find flight and specific arrival
            { $set: setUpdate }, // Apply the updates using dot notation path
            { new: true, runValidators: true } // Return updated doc, run schema validators
        );

        if (!updatedFlight) {
             // Should not happen if flight/arrival existed, but handle defensively
              throw new Error('Failed to apply update to arrival segment.');
        }

       // Find the updated arrival segment to return
        const updatedArrival = updatedFlight.arrivals.find(arr => arr.iata === arrivalIata.toUpperCase());

       res.status(200).json({ message: `Arrival segment ${arrivalIata} updated successfully.`, arrival: updatedArrival });

    } catch (error) {
       if (error.name === 'ValidationError') {
            return res.status(400).json({ message: 'Validation Error', errors: error.errors });
       }
       // Handle 404 errors from findArrivalIndexByIata
        if (error.statusCode === 404) {
             return res.status(404).json({ message: error.message });
        }
       next(error);
    }
};


/**
* DELETE /flights/:flight_reference/arrivals/:arrivalIata
* Delete a specific arrival segment from a flight.
*/
exports.deleteArrival = async (req, res, next) => {
   try {
       const { flight_reference, arrivalIata } = req.params;

       // Find the flight and use $pull to remove the arrival subdocument
        const updatedFlight = await Flight.findOneAndUpdate(
            { flight_reference: flight_reference },
            { $pull: { arrivals: { iata: arrivalIata.toUpperCase() } } }, // $pull removes array elements matching criteria
            { new: true } // Return the modified document
        );

        if (!updatedFlight) {
             // Flight itself not found
             return res.status(404).json({ message: `Flight with reference '${flight_reference}' not found.` });
        }

        // Check if an arrival was actually removed (check if array size changed or if element still exists)
        // This check is implicit - if findOneAndUpdate succeeded, pull *attempted*.
        // If the arrival didn't exist, it still returns the document.
        // We could compare array lengths before/after, but might be overkill.
        // Let's assume success if the flight was found and updated.

       res.status(200).json({ message: `Arrival segment ${arrivalIata} deleted successfully from flight ${flight_reference}.` });
        // Or res.status(204).send();

   } catch (error) {
       next(error);
   }
};


/**
* DELETE /flights/:flight_reference/arrivals/:arrivalIata/players/:robloxId
* Remove a specific player from a specific arrival leg.
*/
exports.removePlayerFromArrivalLeg = async (req, res, next) => {
    try {
       const { flight_reference, arrivalIata, robloxId: robloxIdStr } = req.params;
        const robloxId = parseInt(robloxIdStr, 10);

        if (isNaN(robloxId) || robloxId <= 0) {
            return res.status(400).json({ message: 'Invalid Roblox ID format.' });
        }

        // Find the flight and use $pull on the nested players array
        const updatedFlight = await Flight.findOneAndUpdate(
            {
                flight_reference: flight_reference,
                'arrivals.iata': arrivalIata.toUpperCase() // Ensure the arrival exists
            },
            {
                // $pull from the players array within the matched arrival element ($)
                $pull: { 'arrivals.$.players': { robloxId: robloxId } }
            },
            { new: true }
        );

        if (!updatedFlight) {
             // Flight or arrival not found
             return res.status(404).json({ message: `Flight '<span class="math-inline">\{flight\_reference\}' or arrival '</span>{arrivalIata}' not found.` });
        }

        // Check if player was actually removed? Comparing array lengths before/after is complex here.
        // Assume success if the update ran without error. A more robust check could query the player count before/after.

        res.status(200).json({ message: `Player ${robloxId} removed successfully from arrival leg ${arrivalIata} of flight ${flight_reference}.` });
        // Or res.status(204).send();

    } catch (error) {
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