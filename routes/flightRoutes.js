// routes/flightRoutes.js
const express = require('express');
const flightController = require('../controllers/flightController');
const {
    handleValidationErrors,
    addPlayerToLegValidation,
    flightReferenceParamValidation,
    updateFlightValidation, // New
    arrivalBodyValidation,  // New/Modified
    listFlightsValidation,  // New
    arrivalIataParamValidation,
    flightRefValidation,
    robloxIdParamValidation,
    updatePlayerPrefsBodyValidation,
    createFlightValidation,
    // createArrivalValidation
} = require('../middleware/validation');

const router = express.Router();

router.get('/', listFlightsValidation, handleValidationErrors, flightController.listFlights);

// --- Flight Operations ---

// GET /flights/:flight_reference - Get flight by reference or departure IATA
router.get('/:flight_reference', flightRefValidation, handleValidationErrors, flightController.getFlightByReference);

// POST /flights/:flight_reference - Create a new flight
router.post('/:flight_reference', createFlightValidation, handleValidationErrors, flightController.createFlight);

// PATCH /flights/:flight_reference (Update)
router.patch('/:flight_reference', flightReferenceParamValidation, updateFlightValidation, handleValidationErrors, flightController.updateFlight);

// DELETE /flights/:flight_reference (Delete)
router.delete('/:flight_reference', flightReferenceParamValidation, handleValidationErrors, flightController.deleteFlight);

// --- Arrival Operations ---
// POST /flights/:flight_reference/arrivals (Add Arrival) - Uses new validation
router.post('/:flight_reference/arrivals', flightReferenceParamValidation, arrivalBodyValidation, handleValidationErrors, flightController.createArrival);
// GET /flights/:flight_reference/arrivals/:iata? (Read Arrivals) - Keep existing route(s) for this
// Assuming the split route version from earlier:
router.get('/:flight_reference/arrivals/:iata', flightReferenceParamValidation, arrivalIataParamValidation, handleValidationErrors, flightController.getFlightArrivals);
router.get('/:flight_reference/arrivals/', flightReferenceParamValidation, handleValidationErrors, flightController.getFlightArrivals); // Handles no IATA case
// PATCH /flights/:flight_reference/arrivals/:arrivalIata (Update Arrival) - Uses new validation
router.patch('/:flight_reference/arrivals/:arrivalIata', flightReferenceParamValidation, arrivalIataParamValidation, arrivalBodyValidation, handleValidationErrors, flightController.updateArrival);
// DELETE /flights/:flight_reference/arrivals/:arrivalIata (Delete Arrival)
router.delete('/:flight_reference/arrivals/:arrivalIata', flightReferenceParamValidation, arrivalIataParamValidation, handleValidationErrors, flightController.deleteArrival);

// --- Player Operations within a Flight ---

// POST /flights/:flight_reference/players/:robloxId - Add a player to a flight
// router.post('/:flight_reference/players/:robloxId', addPlayerToFlightValidation, handleValidationErrors, flightController.addPlayerToFlight);

// POST /flights/:flight_reference/players/:robloxId/preferences - Update player preferences on flight
// router.post('/:flight_reference/players/:robloxId/preferences', updatePlayerPreferencesValidation, handleValidationErrors, flightController.updatePlayerPreferences);

// --- Player Operations within a Flight Leg ---
// POST /flights/:flight_reference/arrivals/:arrivalIata/players/:robloxId (Add Player)
router.post('/:flight_reference/arrivals/:arrivalIata/players/:robloxId', addPlayerToLegValidation, handleValidationErrors, flightController.addPlayerToArrivalLeg);
// PATCH /flights/:flight_reference/arrivals/:arrivalIata/players/:robloxId/preferences (Update Prefs)
router.patch('/:flight_reference/arrivals/:arrivalIata/players/:robloxId/preferences', flightReferenceParamValidation, arrivalIataParamValidation, robloxIdParamValidation, updatePlayerPrefsBodyValidation, handleValidationErrors, flightController.updatePlayerPreferencesOnArrivalLeg);
// DELETE /flights/:flight_reference/arrivals/:arrivalIata/players/:robloxId (Remove Player)
router.delete('/:flight_reference/arrivals/:arrivalIata/players/:robloxId', flightReferenceParamValidation, arrivalIataParamValidation, robloxIdParamValidation, handleValidationErrors, flightController.removePlayerFromArrivalLeg);

module.exports = router;