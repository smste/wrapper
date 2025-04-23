// controllers/flightController.js
const Flight = require('../models/Flight');
const User = require('../models/User'); // May need user info sometime
const { DateTime } = require('luxon');

// --- NEW Helper function using Luxon ---
// Parses date/time strings assuming they are in Australia/Sydney timezone
function parseDateTimeInput_Luxon(dateStr, timeStr) {
    const timeZone = 'Australia/Sydney'; // Use IANA name for automatic DST handling
    if (!dateStr || !timeStr) {
        console.error("parseDateTimeInput_Luxon: dateStr or timeStr missing");
        throw new Error('Date and Time strings are required.');
    }
    try {
        // Ensure time has seconds for consistent parsing, default to :00
        let time = timeStr;
        if (time.match(/^\d{2}:\d{2}$/)) {
             time += ':00';
        } else if (!time.match(/^\d{2}:\d{2}:\d{2}$/)) {
             throw new Error('Invalid time format HH:mm or HH:mm:ss required.');
        }

        // Combine date and time for Luxon format parsing
        const dateTimeString = `${dateStr} ${time}`; // Luxon prefers space for this format usually
        const formatString = 'yyyy-MM-dd HH:mm:ss'; // Format matching combined string

        // Create Luxon DateTime object FROM the input string IN the specified zone
        const localDt = DateTime.fromFormat(dateTimeString, formatString, { zone: timeZone });

        if (!localDt.isValid) {
            // Throw Luxon's explanation if available
            throw new Error(localDt.invalidReason || `Could not parse '${dateTimeString}' in zone '${timeZone}'.`);
        }

        // Convert the Luxon DateTime object to a standard JavaScript Date object (which is UTC)
        const utcDate = localDt.toJSDate();

        console.log(`[DateTimeParse Luxon] Input: ${dateStr} ${timeStr} (Assumed ${timeZone}) -> Output UTC: ${utcDate.toISOString()}`);
        return utcDate;

    } catch (error) {
        console.error(`Error parsing date/time with Luxon (Assumed ${timeZone}): ${dateStr}, ${timeStr}`, error);
        // Rethrow a potentially more user-friendly error
        throw new Error(`Invalid format or combination for date/time (expected YYYY-MM-DD HH:mm:ss assumed ${timeZone}): ${error.message}`);
    }
}
// --- END Helper function ---


// --- Update createFlight function to use the Luxon helper ---
exports.createFlight = async (req, res, next) => {
    try {
        const { flight_reference } = req.params;
        const { departure, dispatcher, event_date, event_time, arrivals } = req.body;

        // Check existing (no change)
        const existingFlight = await Flight.findOne({ flight_reference });
        if (existingFlight) return res.status(409).json({ message: 'Flight reference already exists.' });

        // --- Handle Event Date/Time using Luxon helper (defaults to Australia/Sydney) ---
        let eventDateTimeUTC;
        try {
            eventDateTimeUTC = parseDateTimeInput_Luxon(event_date, event_time);
            // The helper now throws on error, caught by outer try/catch or handled below
        } catch (parseError) {
            return res.status(400).json({ message: `Event time error: ${parseError.message}` });
        }

        // --- Handle Arrivals using Luxon helper ---
        let processedArrivals = [];
        if (arrivals && Array.isArray(arrivals)) {
            for (const arrival of arrivals) {
                 if (!arrival.scheduledArrivalDateString || !arrival.scheduledArrivalTimeString /* other req fields */) {
                    return res.status(400).json({ message: `Arrival to ${arrival.iata || 'unknown'} is missing required fields (dateString, timeString, etc.).` });
                 }
                 let arrivalDateTimeUTC;
                 try {
                     // Use the Luxon helper, assumes AEST/AEDT input
                     arrivalDateTimeUTC = parseDateTimeInput_Luxon(
                         arrival.scheduledArrivalDateString,
                         arrival.scheduledArrivalTimeString
                     );
                     // Add processed arrival (using correct field names from Schema)
                      processedArrivals.push({
                           airport: arrival.airport,
                           iata: arrival.iata.toUpperCase(),
                           scheduledArrivalTime: arrivalDateTimeUTC, // Store Date object
                           flight_code: arrival.flight_code,
                           aircraft: arrival.aircraft,
                           upgrade_availability_business: arrival.upgrade_availability_business,
                           upgrade_availability_first: arrival.upgrade_availability_first,
                           upgrade_availability_chairmans: arrival.upgrade_availability_chairmans,
                           players: [],
                      });
                 } catch (arrivalParseError) {
                     return res.status(400).json({ message: `Invalid date/time for arrival ${arrival.iata || 'unknown'}: ${arrivalParseError.message}` });
                 }
            }
        } // End if arrivals

        // --- Create the new flight document (Schema expects eventDateTime: Date) ---
        const newFlight = new Flight({
            flight_reference,
            departure: {
                airport: departure.airport,
                iata: departure.iata.toUpperCase(),
                time_format: departure.time_format,
            },
            dispatcher,
            eventDateTime: eventDateTimeUTC, // Save the UTC Date object
            arrivals: processedArrivals,
            // players: [] // Default in schema
        });

        const savedFlight = await newFlight.save();
        console.log(`[API POST /flights] Successfully created flight ${savedFlight.flight_reference}`);
        res.status(201).json({ message: 'Flight created successfully.', flight: savedFlight });

    } catch (error) {
        // ... error handling (duplicate key, validation) as before ...
        if (error.code === 11000) return res.status(409).json({ message: `Flight reference '${req.params.flight_reference}' already exists.` });
        if (error.name === 'ValidationError') return res.status(400).json({ message: 'Validation Error creating flight', errors: error.errors });
        console.error(`[API POST /flights] Unexpected error for flight ref '${req.params.flight_reference}':`, error);
        next(error);
    }
};

// --- Update createArrival and updateArrival similarly ---
// Ensure they call parseDateTimeInput_Luxon(dateString, timeString)
// and save the result to the scheduledArrivalTime field (which is type Date).

exports.createArrival = async (req, res, next) => {
    try {
        const { flight_reference } = req.params;
        const { airport, iata, scheduledArrivalDateString, scheduledArrivalTimeString, flight_code, aircraft, ...upgrades } = req.body;

        const flight = await Flight.findOne({ flight_reference });
        if (!flight) return res.status(404).json({ message: `Flight '${flight_reference}' not found.`});
        // ... check duplicate IATA ...

        let scheduledArrivalTimeUTC;
        try {
             scheduledArrivalTimeUTC = parseDateTimeInput_Luxon(scheduledArrivalDateString, scheduledArrivalTimeString);
        } catch(parseError) {
             return res.status(400).json({ message: `Arrival time error: ${parseError.message}` });
        }


        const newArrivalData = {
            airport, iata: iata.toUpperCase(),
            scheduledArrivalTime: scheduledArrivalTimeUTC, // Store Date object
            flight_code, aircraft,
            upgrade_availability_business: upgrades.upgrade_availability_business,
            upgrade_availability_first: upgrades.upgrade_availability_first,
            upgrade_availability_chairmans: upgrades.upgrade_availability_chairmans,
            players: []
        };

        flight.arrivals.push(newArrivalData);
        const updatedFlight = await flight.save();
        const newArrival = updatedFlight.arrivals.find(arr => arr.iata === iata.toUpperCase()); // Simplistic
        res.status(201).json({ message: 'Arrival created and added to flight.', arrival: newArrival || newArrivalData });

    } catch (error) { /* ... error handling ... */ next(error); }
};


exports.updateArrival = async (req, res, next) => {
     try {
        const { flight_reference, arrivalIata } = req.params;
        const updateFields = req.body;

        const flight = await Flight.findOne({ flight_reference });
        if (!flight) return res.status(404).json({ message: `Flight '${flight_reference}' not found.`});
        const arrivalIndex = findArrivalIndexByIata(flight, arrivalIata); // findArrivalIndexByIata helper assumed to exist

        const setUpdate = {};
        const arrivalPathPrefix = `arrivals.${arrivalIndex}.`;

        // Process non-time fields
        if (updateFields.airport !== undefined) setUpdate[arrivalPathPrefix + 'airport'] = updateFields.airport;
        if (updateFields.flight_code !== undefined) setUpdate[arrivalPathPrefix + 'flight_code'] = updateFields.flight_code;
        if (updateFields.aircraft !== undefined) setUpdate[arrivalPathPrefix + 'aircraft'] = updateFields.aircraft;
        // ... other non-time fields ...
        if (updateFields.upgrade_availability_chairmans !== undefined) setUpdate[arrivalPathPrefix + 'upgrade_availability_chairmans'] = updateFields.upgrade_availability_chairmans;


        // Handle date/time update (assuming AEST)
        // Validation should ensure both date and time strings are present if updating time
        if (updateFields.scheduledArrivalDateString && updateFields.scheduledArrivalTimeString) {
            try {
                 const scheduledArrivalTimeUTC = parseDateTimeInput_Luxon(
                     updateFields.scheduledArrivalDateString,
                     updateFields.scheduledArrivalTimeString
                 );
                 setUpdate[arrivalPathPrefix + 'scheduledArrivalTime'] = scheduledArrivalTimeUTC; // Set the Date object
             } catch(parseError) {
                   return res.status(400).json({ message: `Invalid date/time update: ${parseError.message}` });
             }
        } else if (updateFields.scheduledArrivalDateString || updateFields.scheduledArrivalTimeString) {
             // Should be caught by validation if configured correctly
             return res.status(400).json({ message: 'To update arrival time, please provide both date and time strings.' });
        }

        if (Object.keys(setUpdate).length === 0) {
             return res.status(400).json({ message: 'No valid fields provided for arrival update.' });
        }

        // --- Perform Update ---
         const updatedFlight = await Flight.findOneAndUpdate(
             { _id: flight._id, 'arrivals.iata': arrivalIata.toUpperCase() },
             { $set: setUpdate },
             { new: true, runValidators: true }
         );

         if (!updatedFlight) throw new Error('Failed to apply update to arrival segment.');
         const updatedArrival = updatedFlight.arrivals.find(arr => arr.iata === arrivalIata.toUpperCase());
         res.status(200).json({ message: `Arrival segment ${arrivalIata} updated successfully.`, arrival: updatedArrival });

     } catch (error) { /* ... error handling, including 404 from findArrivalIndexByIata ... */ next(error); }
};

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

/**
 * GET /flights
 * List flights, formatted as individual plannable legs.
 * TODO: Add proper filtering and pagination for production.
 */
exports.listFlights = async (req, res, next) => {
    console.log(`[API GET /flights] Request received. Query params:`, req.query);
    try {
       // ... (DB connection check) ...
       console.log(`[API GET /flights] Executing Flight.find({})`);
       const flights = await Flight.find({}).lean();
       console.log(`[API GET /flights] Found ${flights?.length || 0} raw flight documents.`);

       const availableLegs = [];
       if (flights) {
           flights.forEach(flight => {
               if (!flight.departure) { // Check parent departure object first
                    console.warn(`[API GET /flights] Skipping flight ${flight.flight_reference} - Missing departure object.`);
                    return; // Skip this flight entirely if no departure info
               }
               if (flight.arrivals && flight.arrivals.length > 0) {
                   flight.arrivals.forEach((arrival, index) => {
                       // Check each required field explicitly
                       const hasDep = !!flight.departure; // Should be true based on check above
                       const hasArrIata = !!arrival.iata;
                       const hasFlightCode = !!arrival.flight_code;
                       const hasSchedArrTime = !!arrival.scheduledArrivalTime;

                       if (hasDep && hasArrIata && hasFlightCode && hasSchedArrTime) {
                           // All good, add the leg
                           availableLegs.push({
                               flightReference: flight.flight_reference,
                               segmentFlightCode: arrival.flight_code,
                               departureAirport: flight.departure.airport,
                               departureIata: flight.departure.iata,
                               departureTimeFormat: flight.departure.time_format,
                               arrivalAirport: arrival.airport,
                               arrivalIata: arrival.iata,
                               scheduledArrivalTimeISO: arrival.scheduledArrivalTime.toISOString(),
                               aircraft: arrival.aircraft,
                           });
                       } else {
                           // --- DETAILED LOG FOR SKIPPED LEG ---
                           console.warn(`[API GET /flights] Skipping arrival leg #${index} for flight ${flight.flight_reference} - Missing data:`, {
                               flightRef: flight.flight_reference,
                               arrivalIataInDB: arrival.iata, // Show what was found
                               arrivalFlightCodeInDB: arrival.flight_code, // Show what was found
                               arrivalSchedTimeInDB: arrival.scheduledArrivalTime, // Show what was found
                               iataOK: hasArrIata,
                               flightCodeOK: hasFlightCode,
                               schedTimeOK: hasSchedArrTime
                           });
                           // --- END DETAILED LOG ---
                       }
                   });
               } else {
                    console.warn(`[API GET /flights] Skipping flight ${flight.flight_reference} - No arrivals array found or empty.`);
               }
           });
       }
        console.log(`[API GET /flights] Processed into ${availableLegs.length} available legs.`);
       // ... rest of function (pagination, response) ...
        const page = parseInt(req.query.page || '1', 10);
        const limit = parseInt(req.query.limit || '50', 10);
        const totalLegs = availableLegs.length;
        const startIndex = (page - 1) * limit;
        const endIndex = page * limit;
        const paginatedLegs = availableLegs.slice(startIndex, endIndex);
        const responsePayload = { legs: paginatedLegs, page, limit, totalPages: Math.ceil(totalLegs / limit), totalItems: totalLegs };
        console.log(`[API GET /flights] Sending response with ${responsePayload.legs?.length || 0} legs for page ${page}.`);
        res.status(200).json(responsePayload);

    } catch (error) {
       console.error("[API GET /flights] Error in listFlights controller:", error);
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