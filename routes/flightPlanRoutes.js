// routes/flightPlanRoutes.js
const express = require('express');
const flightPlanController = require('../controllers/flightPlanController');
const {
    handleValidationErrors, // Import the error handler
    createPlanValidation,
    planReferenceParamValidation,
    robloxIdParamValidation,
    updatePlanStatusValidation,
    planStatusQueryValidation,
} = require('../middleware/validation'); // Import specific validation rules

const router = express.Router();

// --- Flight Plan Routes ---

// POST /plans - Create a new flight plan
router.post(
    '/', // Route path is just '/' relative to where it's mounted (e.g., /plans)
    createPlanValidation,   // Apply validation rules for the request body
    handleValidationErrors, // Handle any validation errors
    flightPlanController.createFlightPlan // Call the controller function
);

// GET /plans/user/:robloxId - Get all plans for a specific user
router.get(
    '/user/:robloxId',
    robloxIdParamValidation,   // Validate :robloxId parameter
    planStatusQueryValidation, // Validate optional ?status query parameter
    handleValidationErrors,    // Handle validation errors
    flightPlanController.getUserPlans // Call the controller function
);

// GET /plans/:planReference - Get a specific flight plan by reference
router.get(
    '/:planReference',
    planReferenceParamValidation, // Validate :planReference parameter
    handleValidationErrors,       // Handle validation errors
    flightPlanController.getPlan  // Call the controller function
);

// PATCH /plans/:planReference/status - Update the status of a specific plan
router.patch(
    '/:planReference/status',
    planReferenceParamValidation, // Validate :planReference parameter
    updatePlanStatusValidation, // Validate 'status' in the request body
    handleValidationErrors,     // Handle validation errors
    flightPlanController.updatePlanStatus // Call the controller function
);

// DELETE /plans/:planReference - Delete a specific flight plan
router.delete(
    '/:planReference',
    planReferenceParamValidation, // Validate :planReference parameter
    handleValidationErrors,       // Handle validation errors
    flightPlanController.deletePlan // Call the controller function
);


module.exports = router; // Export the router