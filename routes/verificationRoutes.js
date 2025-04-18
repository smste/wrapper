// routes/verificationRoutes.js
const express = require('express');
const verificationController = require('../controllers/verificationController');
const {
    handleValidationErrors,
    confirmVerificationValidation
} = require('../middleware/validation');

const router = express.Router();

// No API Key? This endpoint is called by Roblox game servers.
// How do you authenticate this request?
// Option 1: Specific secret header known only to game script and API.
// Option 2: Rate limiting + trust (less secure).
// Option 3: More complex auth.
// Let's assume for now it doesn't need the *user* API key, but maybe a *game server* key?
// Or leave it open for now for simplicity, but add auth later.
router.post(
    '/confirm',
    confirmVerificationValidation,
    handleValidationErrors,
    verificationController.confirmVerification
);

module.exports = router;