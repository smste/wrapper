// models/User.js
const mongoose = require('mongoose');
const { userDB } = require('../config/database'); // Import the specific connection

const TIER_LEVELS = ['Bronze', 'Silver', 'Gold', 'Platinum', 'PlatinumOne'];

const UserSchema = new mongoose.Schema({
    robloxId: { // Changed from user_id for clarity
        type: Number,
        required: true,
        unique: true,
        index: true, // Index for faster lookups
    },
    discordId: { // Store as String, Discord IDs are large Snowflakes
        type: String,
        required: false, // Allow users to exist before linking Discord
        unique: true,
        sparse: true, // Allows multiple null/undefined values but ensures uniqueness when set
        index: true,
    },
    points: {
        type: Number,
        required: true,
        default: 0,
    },
    statusCredits: { // Separate counter for tier qualification
        type: Number,
        required: true,
        default: 0,
        min: 0,
    },
    currentTier: { // The tier benefits the user currently receives
        type: String,
        enum: TIER_LEVELS,
        required: true,
        default: 'Bronze',
        index: true,
    },
    lifetimeTier: { // Highest tier achieved for life
        type: String,
        enum: TIER_LEVELS,
        required: true,
        default: 'Bronze',
        index: true,
    },
    temporaryTierExpiryDate: { // When the current *temporary* tier expires
        type: Date,
        required: false, // Null if current tier is lifetime or Bronze
        default: null,
    }
    // Add other user-specific fields if needed
}, { timestamps: true }); // Adds createdAt and updatedAt automatically

// Explicitly connect this model to the userDB connection
module.exports = userDB.model('User', UserSchema);
