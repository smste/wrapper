// routes/flightRoutes.js
const express = require('express');
const flightController = require('../controllers/flightController');
const {
    handleValidationErrors,
    addPlayerToLegValidation,
    flightReferenceParamValidation,
    arrivalIataParamValidation,
    flightRefValidation,
    robloxIdParamValidation,
    updatePlayerPrefsBodyValidation,
    createFlightValidation,
    createArrivalValidation
} = require('../middleware/validation');

const router = express.Router();

// --- Flight Operations ---

// GET /flights/:flight_reference - Get flight by reference or departure IATA
router.get('/:flight_reference', flightRefValidation, handleValidationErrors, flightController.getFlightByReference);

// POST /flights/:flight_reference - Create a new flight
router.post('/:flight_reference', createFlightValidation, handleValidationErrors, flightController.createFlight);

// --- Arrival Operations ---

const { iataParamValidation } = require('../middleware/validation'); // Assuming you add this validation
router.get(
    '/:flight_reference/arrivals/:iata', // Notice: No '?' here
    flightRefValidation,
    iataParamValidation, // Add validation for the required iata param
    handleValidationErrors,
    flightController.getFlightArrivals // This controller needs to handle the required param
);

// GET /flights/:flight_reference/arrivals - Get all arrivals for the flight (No :iata)
// This route will handle requests like /flights/FL123/arrivals/
router.get(
    '/:flight_reference/arrivals/', // Add trailing slash for consistency if desired, or omit if not needed
    flightRefValidation,
    handleValidationErrors,
    flightController.getFlightArrivals // This controller needs to handle the case where req.params.iata is undefined
);


// POST /flights/:flight_reference/arrivals - Create a new arrival for a flight (remains the same)
router.post('/:flight_reference/arrivals', createArrivalValidation, handleValidationErrors, flightController.createArrival);

// --- Player Operations within a Flight ---

// POST /flights/:flight_reference/players/:robloxId - Add a player to a flight
// router.post('/:flight_reference/players/:robloxId', addPlayerToFlightValidation, handleValidationErrors, flightController.addPlayerToFlight);

// POST /flights/:flight_reference/players/:robloxId/preferences - Update player preferences on flight
// router.post('/:flight_reference/players/:robloxId/preferences', updatePlayerPreferencesValidation, handleValidationErrors, flightController.updatePlayerPreferences);

router.post(
    '/:flight_reference/arrivals/:arrivalIata/players/:robloxId',
    addPlayerToLegValidation,   // Apply validation for params and optional body
    handleValidationErrors,     // Handle errors
    flightController.addPlayerToArrivalLeg // Link to new controller
);

router.patch(
    '/:flight_reference/arrivals/:arrivalIata/players/:robloxId/preferences',
    [ // Apply multiple validation middlewares in an array
        ...flightReferenceParamValidation,
        ...arrivalIataParamValidation,
        ...robloxIdParamValidation,
        ...updatePlayerPrefsBodyValidation // Validate body content
    ],
    handleValidationErrors, // Handle errors from all preceding validators
    flightController.updatePlayerPreferencesOnArrivalLeg // Link to new controller
);

module.exports = router;