// models/WebLoginRequest.js
const mongoose = require('mongoose');
// Store these in the User DB or a dedicated DB
const { userDB } = require('../config/database');

const WebLoginRequestSchema = new mongoose.Schema({
    loginRequestId: { // Unique ID for this login attempt
        type: String,
        required: true,
        unique: true,
        index: true,
    },
    robloxId: { // Roblox user trying to log in
        type: Number,
        required: true,
    },
    discordId: { // Discord user who needs to approve
        type: String,
        required: true,
    },
    robloxUsername: { // For display purposes
        type: String,
        required: true,
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'denied', 'expired', 'consumed'], // Added consumed
        default: 'pending',
        index: true,
    },
    // --- ADDED OTT Fields ---
    ott: { // One-Time Token generated upon approval
        type: String,
        index: true, // Index for quick lookup
        sparse: true, // Allow nulls but unique when set
        unique: true, // Ensure OTT is unique
    },
    ottExpiresAt: { // Short expiry for the OTT itself
        type: Date,
        // TTL index to automatically delete records shortly after OTT expiry
        // Ensures consumed/expired OTT records don't linger forever
        // Set TTL slightly longer than OTT validity window (e.g., 120s if OTT valid for 60s)
        index: { expires: '120s' },
    },
    // --- END ADDED ---
    expiresAt: { // Expiry for the initial pending request itself
        type: Date,
        required: true,
        // This TTL index handles the overall request expiry (e.g., 3 minutes)
        index: { expires: '0s' },
    },
}, { timestamps: true }); // Adds createdAt, updatedAt

module.exports = userDB.model('WebLoginRequest', WebLoginRequestSchema);