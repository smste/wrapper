// routes/internalRoutes.js
const express = require('express');
const userController = require('../controllers/userController'); // Reuse existing controller logic
const {
    handleValidationErrors,
    robloxIdParamValidation // Use the param validation for :robloxId
} = require('../middleware/validation'); // Import necessary validation

const router = express.Router();

// --- Internal User Routes ---

// GET /internal/users/:robloxId - Called by Roblox game server to get user data
router.get(
    '/users/:robloxId', // Path relative to where this router is mounted (e.g., /internal)
    robloxIdParamValidation, // Validate the parameter
    handleValidationErrors,
    userController.getUser // Reuse the same controller function as the public API
);

// Add any other routes here later that ONLY the Roblox server should call
// Example: Maybe fetching specific game state or simplified flight data

module.exports = router;