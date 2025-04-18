// routes/userRoutes.js
const express = require('express');
const userController = require('../controllers/userController');
const {
    handleValidationErrors,
    userIdValidation,
    createUserValidation,
    updateUserPointsValidation,
    updateUserDiscordValidation,
} = require('../middleware/validation');

const router = express.Router();

// GET /users/:robloxId - Get user data
router.get('/:robloxId', userIdValidation, handleValidationErrors, userController.getUser);

// POST /users/:robloxId - Create a new user
router.post('/:robloxId', createUserValidation, handleValidationErrors, userController.createUser);

// POST /users/:robloxId/points - Set user points
router.post('/:robloxId/points', updateUserPointsValidation, handleValidationErrors, userController.setUserPoints);

 // POST /users/:robloxId/discord - Link/update user's Discord ID
router.post('/:robloxId/discord', updateUserDiscordValidation, handleValidationErrors, userController.setUserDiscord);

// Add this route definition in userRoutes.js
const { discordIdValidation } = require('../middleware/validation'); // Import it
// ... other routes
// GET /users/discord/:discordId - Get user data by Discord ID
router.get('/discord/:discordId', discordIdValidation, handleValidationErrors, userController.getUserByDiscordId);

module.exports = router;