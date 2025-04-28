// routes/userRoutes.js
const express = require('express');
const userController = require('../controllers/userController');

const apiKeyAuth = require('../middleware/apiKeyAuth');
const gameServerAuth = require('../middleware/gameServerAuth');

const {
    handleValidationErrors,
    userIdValidation,
    createUserValidation,
    updateUserPointsValidation,
    updateUserDiscordValidation,
    getOrCreateUserValidation,
    discordIdValidation,
    addCreditsValidation
} = require('../middleware/validation');

const router = express.Router();

router.post(
    '/get-or-create',
    gameServerAuth, // Use game server key for this route
    getOrCreateUserValidation,
    handleValidationErrors,
    userController.findOrCreateUser
);

// GET /users/:robloxId - Get user data
router.get('/:robloxId', userIdValidation, handleValidationErrors, userController.getUser);

// POST /users/:robloxId - Create a new user
router.post('/:robloxId', createUserValidation, handleValidationErrors, userController.createUser);

// POST /users/:robloxId/points - Set user points
router.post('/:robloxId/points', updateUserPointsValidation, handleValidationErrors, userController.setUserPoints);

 // POST /users/:robloxId/discord - Link/update user's Discord ID
router.post('/:robloxId/discord', updateUserDiscordValidation, handleValidationErrors, userController.setUserDiscord);

// GET /users/discord/:discordId - Get user data by Discord ID
router.get('/discord/:discordId', discordIdValidation, handleValidationErrors, userController.getUserByDiscordId);

router.post(
    '/:robloxId/credits', // Route path
    apiKeyAuth, // Protected by standard API key (assuming staff action)
    userIdValidation, // Validate robloxId in URL param
    addCreditsValidation, // Validate amount/reason in body
    handleValidationErrors,
    userController.addStatusCredits // Link to new controller function
);

module.exports = router;