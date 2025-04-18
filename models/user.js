// models/User.js
const mongoose = require('mongoose');
const { userDB } = require('../config/database'); // Import the specific connection

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
    // Add other user-specific fields if needed
}, { timestamps: true }); // Adds createdAt and updatedAt automatically

// Explicitly connect this model to the userDB connection
module.exports = userDB.model('User', UserSchema);