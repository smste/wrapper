// models/Verification.js
const mongoose = require('mongoose');
// Ensure you are connecting to the correct DB instance where user data resides
// Assuming userDB handles users AND pending verifications for simplicity here.
// If you want verifications elsewhere, change userDB to the appropriate connection.
const { userDB } = require('../config/database');

const VerificationSchema = new mongoose.Schema({
    code: { // The unique code given to the user
        type: String,
        required: true,
        unique: true,
        index: true,
    },
    discordId: {
        type: String,
        required: true,
        index: true,
    },
    robloxId: {
        type: Number,
        required: true,
    },
    robloxUsername: { // Store the username used for initiation
        type: String,
        required: true,
    },
    status: {
        type: String,
        enum: ['pending', 'verified', 'expired'],
        default: 'pending',
        index: true,
    },
    expiresAt: { // Automatically delete document after TTL
        type: Date,
        required: true,
        // Ensure a TTL index exists on this field in MongoDB:
        // db.verifications.createIndex( { "expiresAt": 1 }, { expireAfterSeconds: 0 } )
        index: { expires: '0s' },
    },
}, { timestamps: true }); // Adds createdAt, updatedAt

module.exports = userDB.model('Verification', VerificationSchema);