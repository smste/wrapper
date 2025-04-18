// models/Verification.js
const mongoose = require('mongoose');
const { userDB } = require('../config/database'); // Connect to the USER database

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
        // Create a TTL index in MongoDB to automatically delete expired records
        // You might need to create this index manually in your Atlas console or using a migration script:
        // db.verifications.createIndex( { "expiresAt": 1 }, { expireAfterSeconds: 0 } )
        index: { expires: '0s' },
    },
}, { timestamps: true }); // Adds createdAt, updatedAt

module.exports = userDB.model('Verification', VerificationSchema);
