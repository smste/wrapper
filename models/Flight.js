// models/Flight.js
const mongoose = require('mongoose');
const { flightDB } = require('../config/database'); // Import the specific connection

// Subdocument Schemas
const PlayerPreferenceSchema = new mongoose.Schema({
    robloxId: {
        type: Number,
        required: true,
        index: true,
    },
    class_upgrade: { type: String, required: true, default: "Economy" },
    seating_location: { type: String, required: true, default: "Any" },
    notificationsSent: { // Tracks sent notifications
        type: Map,
        of: Boolean,
        default: {},
    }
}, { _id: false });

const ArrivalSchema = new mongoose.Schema({
    airport: { type: String, required: true },
    iata: { type: String, required: true, uppercase: true, trim: true },
    scheduledArrivalTime: { // Stores the full date and time
        type: Date,
        required: [true, 'Scheduled arrival date and time is required.'],
    },
    flight_code: { type: String, required: true, trim: true },
    aircraft: { type: String, required: true },
    upgrade_availability_business: { type: Boolean, required: true, default: false },
    upgrade_availability_first: { type: Boolean, required: true, default: false },
    upgrade_availability_chairmans: { type: Boolean, required: true, default: false },
    players: { // NOW PlayerPreferenceSchema is defined and can be used here
        type: [PlayerPreferenceSchema],
        default: []
    }
}, { _id: true });

const DepartureSchema = new mongoose.Schema({
    airport: { type: String, required: true },
    iata: { type: String, required: true, uppercase: true, trim: true }, // Standardize IATA
    time_format: { type: String, required: true },
}, { _id: false });

const EventDateSchema = new mongoose.Schema({
    date: { type: String, required: true }, // Consider using Date type for easier sorting/querying
    time: { type: String, required: true },
}, { _id: false });


// Main Flight Schema
const FlightSchema = new mongoose.Schema({
    flight_reference: { // This seems like a unique identifier for the flight event
        type: String,
        required: true,
        unique: true,
        index: true,
        trim: true,
    },
    departure: { // Keep as single object if only one departure per flight ref
        type: DepartureSchema,
        required: true,
    },
    arrivals: [ArrivalSchema], // Array of possible arrival segments
    dispatcher: { type: String, required: true },
    date_of_event: { // Keep as single object
         type: EventDateSchema,
         required: true,
    },
    // Add other flight-specific details if needed (e.g., status: Scheduled/Departed/Arrived)
}, { timestamps: true });

// Index departure IATA if commonly searched
FlightSchema.index({ "departure.iata": 1 });
// Index arrival IATA if commonly searched
FlightSchema.index({ "arrivals.iata": 1 });

// Explicitly connect this model to the flightDB connection
module.exports = flightDB.model('Flight', FlightSchema);
