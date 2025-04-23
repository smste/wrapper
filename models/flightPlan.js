// models/FlightPlan.js
const mongoose = require('mongoose');
const { flightPlanDB } = require('../config/database'); // Import the specific connection for flight plans

// --- Helper Validation ---
function arrayMinLength(val) {
  return val && val.length > 0;
}

// --- Subdocument Schema for each leg/segment of the plan ---
const FlightLegSchema = new mongoose.Schema({
    flightReference: { // STILL REQUIRED: References the 'flight_reference' in the Flight model (flightDB)
        type: String,
        required: [true, 'Parent Flight reference is required for each leg.'],
        trim: true,
    },
    // --- NEW FIELD ---
    segmentFlightCode: { // The specific flight_code from the arrival segment within the parent Flight
        type: String,
        required: [true, 'The specific segment flight code (from the arrival) is required for each leg.'],
        trim: true,
    },
    departureIata: { // STILL REQUIRED: Specifies the departure airport for *this specific leg*
        type: String,
        required: [true, 'Departure IATA is required for each leg.'],
        uppercase: true,
        trim: true,
        match: [/^[A-Z]{3}$/, 'Departure IATA must be 3 uppercase letters.'],
    },
    arrivalIata: { // STILL REQUIRED: Specifies the arrival airport for *this specific leg*
        type: String,
        required: [true, 'Arrival IATA is required for each leg.'],
        uppercase: true,
        trim: true,
        match: [/^[A-Z]{3}$/, 'Arrival IATA must be 3 uppercase letters.'],
    },
}, { _id: false });

// --- Main Flight Plan Schema ---
const FlightPlanSchema = new mongoose.Schema({
    planReference: { // A unique ID for this specific plan/journey instance
        type: String,
        required: [true, 'A unique plan reference is required.'],
        unique: true,
        index: true,
        trim: true,
        // Consider generating this automatically if not provided (e.g., using UUID)
    },
    robloxId: { // The Roblox user ID this plan belongs to
        type: Number,
        required: [true, 'Roblox ID is required.'],
        index: true,
        min: [1, 'Roblox ID must be a positive number.'],
    },
    legs: { // Uses the updated FlightLegSchema
        type: [FlightLegSchema],
        required: true,
        validate: [arrayMinLength, 'Flight plan must have at least one leg.']
    },
    status: { // Overall status of the entire plan
       type: String,
       enum: ['Planned', 'Active', 'Completed', 'Cancelled'],
       default: 'Planned',
       index: true,
    },
    // Optional user-friendly name for the plan
    planName: {
        type: String,
        trim: true,
        maxlength: [100, 'Plan name cannot exceed 100 characters.']
    },
}, { timestamps: true }); // Adds createdAt and updatedAt automatically

// --- Create and export the model connected to the flightPlanDB ---
module.exports = flightPlanDB.models.flightPlan || flightPlanDB.model('flightPlan', FlightPlanSchema);