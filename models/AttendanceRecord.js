// models/AttendanceRecord.js
const mongoose = require('mongoose');
// Assuming you store attendance related to plans in flightPlanDB
const { flightPlanDB } = require('../config/database');

const AttendanceRecordSchema = new mongoose.Schema({
    planReference: { // Links to FlightPlan
        type: String,
        required: true,
        index: true,
    },
    robloxId: { // The player
        type: Number,
        required: true,
        index: true,
    },
    // Identify the leg - use segmentFlightCode for uniqueness within the plan context
    segmentFlightCode: {
         type: String,
         required: true,
    },
    // Optional: Store leg index if needed, but segment code might be better
    // legIndex: { type: Number, required: true },
    status: {
        type: String,
        enum: ['active', 'completed', 'incomplete', 'abandoned'], // incomplete/abandoned set by timeout job
        required: true,
        default: 'active', // Default when checked in
        index: true,
    },
    checkInTime: { // When they started the leg
         type: Date,
         required: true,
         default: Date.now,
    },
    checkOutTime: { // When they successfully finished the leg
         type: Date,
    },
    lastSeen: { // Timestamp of the last heartbeat received (or check-in)
         type: Date,
         required: true,
         index: true, // Index for the timeout check job
    },
}, { timestamps: true }); // createdAt, updatedAt

// Compound index for efficient lookups/updates
AttendanceRecordSchema.index({ planReference: 1, robloxId: 1, segmentFlightCode: 1 }, { unique: true });

module.exports = flightPlanDB.model('AttendanceRecord', AttendanceRecordSchema);