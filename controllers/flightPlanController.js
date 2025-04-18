// controllers/flightPlanController.js
const FlightPlan = require('../models/flightPlan');
const User = require('../models/User'); // From userDB
const Flight = require('../models/Flight'); // From flightDB

// Helper to check if a plan exists and throw 404
const checkPlanNotFound = (plan, planRef) => {
    if (!plan) {
        const error = new Error(`Flight plan with reference '${planRef}' not found.`);
        error.statusCode = 404;
        throw error;
    }
};


// POST /plans - Create Flight Plan (from previous response)
exports.createFlightPlan = async (req, res, next) => {
    const { planReference, robloxId, legs, planName } = req.body;
    let savedPlan; // To hold the plan once saved

    // --- IMPORTANT: Transaction Consideration ---
    // Ideally, saving the plan and adding the player to all flight legs
    // should be in a transaction to ensure atomicity. This requires a MongoDB
    // replica set or sharded cluster and adds complexity using sessions.
    // The code below does NOT use transactions for simplicity, meaning
    // the plan could be saved, but adding the player to a flight leg might fail,
    // leading to inconsistency. We will log errors in such cases.

    try {
        // --- Pre-checks (Same as before, including the enhanced leg validation) ---
        const userExists = await User.exists({ robloxId: robloxId });
        if (!userExists) {
            return res.status(404).json({ message: `User with Roblox ID ${robloxId} not found.` });
        }
        if (!legs || !Array.isArray(legs) || legs.length === 0) {
             return res.status(400).json({ message: "Flight plan must include at least one leg in the 'legs' array." });
        }
        for (const leg of legs) {
            if (!leg.flightReference || !leg.segmentFlightCode || !leg.departureIata || !leg.arrivalIata) {
                return res.status(400).json({ message: "Each leg must include flightReference, segmentFlightCode, departureIata, and arrivalIata." });
            }
            const flight = await Flight.findOne({ flight_reference: leg.flightReference }).lean(); // Find the parent flight
            if (!flight) return res.status(400).json({ message: `Parent Flight reference '${leg.flightReference}' for a leg does not exist.` });
            if (flight.departure?.iata !== leg.departureIata) return res.status(400).json({ message: `Leg departure IATA '<span class="math-inline">\{leg\.departureIata\}' does not match departure IATA '</span>{flight.departure?.iata}' for parent flight '${leg.flightReference}'.` });
            const arrivalSegment = flight.arrivals?.find(arr => arr.iata === leg.arrivalIata);
            if (!arrivalSegment) return res.status(400).json({ message: `Leg arrival IATA '<span class="math-inline">\{leg\.arrivalIata\}' not found in arrivals for parent flight '</span>{leg.flightReference}'.` });
            if (arrivalSegment.flight_code !== leg.segmentFlightCode) return res.status(400).json({ message: `Provided segmentFlightCode '<span class="math-inline">\{leg\.segmentFlightCode\}' does not match actual code '</span>{arrivalSegment.flight_code}' for arrival IATA '<span class="math-inline">\{leg\.arrivalIata\}' on parent flight '</span>{leg.flightReference}'.` });
        }
        // --- End Pre-checks ---


        // 1. Create and Save the Flight Plan first
        const newPlan = new FlightPlan({
            planReference,
            robloxId,
            legs,
            planName,
            status: 'Planned',
        });
        savedPlan = await newPlan.save(); // Save plan to flightPlanDB

        // --- NEW: 2. Add Player to Each Flight Leg in flightDB ---
        for (const leg of savedPlan.legs) {
            try {
                // Find the parent flight document (non-lean, as we need to save)
                const flightDoc = await Flight.findOne({ flight_reference: leg.flightReference });
                if (!flightDoc) {
                    // Should not happen due to pre-checks, but handle defensively
                    console.error(`[createFlightPlan Auto-Add Error] Flight ${leg.flightReference} not found after saving plan ${planReference}.`);
                    continue; // Skip to next leg
                }

                // Find the specific arrival subdocument within the flight
                // Mongoose arrays have an 'id()' method to find subdocuments by _id if needed,
                // but finding by IATA might be sufficient if IATA is unique within a flight's arrivals.
                // Let's find by index for reliability after confirming segmentFlightCode match.
                const arrivalIndex = flightDoc.arrivals.findIndex(arr =>
                    arr.iata === leg.arrivalIata && arr.flight_code === leg.segmentFlightCode
                );

                if (arrivalIndex === -1) {
                    console.error(`[createFlightPlan Auto-Add Error] Arrival segment <span class="math-inline">\{leg\.arrivalIata\}/</span>{leg.segmentFlightCode} not found in flight ${leg.flightReference} for plan ${planReference}.`);
                    continue; // Skip to next leg
                }

                // Check if player is already in this leg's player list
                const playerAlreadyExists = flightDoc.arrivals[arrivalIndex].players.some(
                    player => player.robloxId === robloxId
                );

                if (!playerAlreadyExists) {
                    // Add player with default preferences (defined in PlayerPreferenceSchema)
                    flightDoc.arrivals[arrivalIndex].players.push({ robloxId: robloxId });
                    // Mark modified if pushing to nested array (sometimes needed)
                    // flightDoc.markModified(`arrivals.${arrivalIndex}.players`);
                    await flightDoc.save(); // Save changes to the Flight document in flightDB
                    console.log(`[createFlightPlan Auto-Add] Added user ${robloxId} to leg ${leg.segmentFlightCode} of flight ${leg.flightReference}.`);
                } else {
                    console.log(`[createFlightPlan Auto-Add] User ${robloxId} already exists on leg ${leg.segmentFlightCode} of flight ${leg.flightReference}. Skipping.`);
                }

            } catch (flightUpdateError) {
                // Log error if updating a specific flight leg fails
                console.error(`[createFlightPlan Auto-Add Error] Failed to add user ${robloxId} to leg ${leg.segmentFlightCode} for plan ${planReference}. Error:`, flightUpdateError);
                // Continue to the next leg - plan is saved, but this leg addition failed.
            }
        } // End loop through legs

        // Respond with success after saving plan and attempting to add players
        res.status(201).json({
            message: 'Flight plan created successfully. Players automatically added to flight legs (check server logs for any errors).',
            plan: savedPlan // Return the saved flight plan
        });

    } catch (error) {
        // Handle plan saving errors (duplicate planRef, validation etc.)
        if (error.code === 11000) return res.status(409).json({ message: `Flight plan reference '${req.body.planReference}' already exists.` });
        if (error.name === 'ValidationError') return res.status(400).json({ message: 'Validation Error', errors: error.errors });
        next(error); // Pass other errors to central handler
    }
};


// --- NEW CONTROLLER FUNCTIONS ---

/**
 * GET /plans/:planReference
 * Get a single flight plan by its reference.
 */
exports.getPlan = async (req, res, next) => {
    try {
        const { planReference } = req.params;
        const plan = await FlightPlan.findOne({ planReference: planReference }).lean(); // Use lean for read-only

        checkPlanNotFound(plan, planReference); // Use helper for 404

        res.status(200).json(plan);
    } catch (error) {
        next(error); // Pass errors (like 404 from helper) to central handler
    }
};

/**
 * GET /plans/user/:robloxId
 * Get all flight plans for a specific user.
 * Supports optional filtering by status via query parameter (e.g., ?status=Active)
 */
exports.getUserPlans = async (req, res, next) => {
    try {
        const { robloxId } = req.params;
        const { status } = req.query; // Get optional status filter from query string

        const queryFilter = { robloxId: parseInt(robloxId, 10) };

        // Add status to filter only if it's provided and valid
        const validStatuses = ['Planned', 'Active', 'Completed', 'Cancelled'];
        if (status && validStatuses.includes(status)) {
            queryFilter.status = status;
        } else if (status) {
             // Optional: Warn or ignore invalid status query param
             console.warn(`Invalid status filter ignored: ${status}`);
        }

        const plans = await FlightPlan.find(queryFilter)
            .sort({ createdAt: -1 }) // Sort by most recently created first
            .lean(); // Use lean for read-only

        // It's okay if the user has no plans, just return an empty array.
        // No need to check 404 unless you want to verify the user exists first.
        res.status(200).json(plans);
    } catch (error) {
        // Handle potential errors like invalid robloxId format if not caught by validation
        if (error instanceof mongoose.Error.CastError) {
             return res.status(400).json({ message: 'Invalid Roblox ID format.' });
        }
        next(error);
    }
};

/**
 * PATCH /plans/:planReference/status
 * Update the overall status of a flight plan.
 */
exports.updatePlanStatus = async (req, res, next) => {
    try {
        const { planReference } = req.params;
        const { status } = req.body; // Expecting { "status": "NewStatus" } in body

        // Input validation for status value should be handled by middleware,
        // but double-checking the allowed enum values here is safe.
        const allowedStatuses = FlightPlan.schema.path('status').enumValues;
        if (!allowedStatuses.includes(status)) {
             // This check might be redundant if using strict validation middleware
             return res.status(400).json({ message: `Invalid status value. Must be one of: ${allowedStatuses.join(', ')}` });
        }

        const updatedPlan = await FlightPlan.findOneAndUpdate(
            { planReference: planReference }, // Filter
            { $set: { status: status } },     // Update
            { new: true, runValidators: true } // Options: return updated doc, run schema validators
        );

        checkPlanNotFound(updatedPlan, planReference); // Use helper for 404 if findOneAndUpdate returns null

        res.status(200).json({ message: 'Flight plan status updated successfully.', plan: updatedPlan });
    } catch (error) {
         if (error.name === 'ValidationError') {
             return res.status(400).json({ message: 'Validation Error', errors: error.errors });
         }
        next(error);
    }
};

/**
 * DELETE /plans/:planReference
 * Permanently delete a flight plan by its reference.
 */
exports.deletePlan = async (req, res, next) => {
    try {
        const { planReference } = req.params;

        const result = await FlightPlan.findOneAndDelete({ planReference: planReference });

        checkPlanNotFound(result, planReference); // Use helper for 404 if findOneAndDelete returns null

        // Successfully deleted
        res.status(200).json({ message: `Flight plan '${planReference}' deleted successfully.` });
        // OR use 204 No Content:
        // res.status(204).send();

    } catch (error) {
        next(error);
    }
};