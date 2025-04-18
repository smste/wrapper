// models/Verification.js
const mongoose = require('mongoose');
// Connect to the appropriate DB (e.g., userDB)
const { userDB } = require('../config/database');

const VerificationSchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true, index: true },
    discordId: { type: String, required: true, index: true },
    robloxId: { type: Number, required: true },
    robloxUsername: { type: String, required: true },
    // --- ADDED FIELD ---
    discordUsername: { // Store Discord tag (e.g., User#1234) or username
        type: String,
        required: true,
    },
    // --- END ADDED FIELD ---
    status: { type: String, enum: ['pending', 'verified', 'expired'], default: 'pending', index: true },
    expiresAt: { type: Date, required: true, index: { expires: '0s' } }, // Ensure TTL index exists
}, { timestamps: true });

module.exports = userDB.model('Verification', VerificationSchema);