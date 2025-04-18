// routes/verificationRoutes.js
const express = require('express');
const verificationController = require('../controllers/verificationController');
const {
    handleValidationErrors,
    confirmVerificationValidation // Import the specific validation rules
} = require('../middleware/validation'); // Adjust path if needed

const router = express.Router();

// POST /verifications/confirm - Endpoint called by the Roblox game
// Auth for this route is handled by gameServerAuth middleware in server.js
router.post(
    '/confirm',
    confirmVerificationValidation, // Validate the incoming body
    handleValidationErrors,        // Handle any validation errors
    verificationController.confirmVerification // Call the controller function
);

router.get(
    '/pending/:robloxId',
    robloxIdParamValidation,    // Validate the robloxId parameter
    handleValidationErrors,     // Handle validation errors
    verificationController.getPendingVerificationForUser // Call the new controller
);

module.exports = router;