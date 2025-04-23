// routes/attendanceRoutes.js
const express = require('express');
const attendanceController = require('../controllers/attendanceController'); // Create this controller
const { handleValidationErrors, attendanceCheckValidation } = require('../middleware/validation'); // Create this validation

const router = express.Router();

// POST /attendance/checkin - Player starts a leg
router.post(
    '/checkin',
    attendanceCheckValidation, // Validate planRef, robloxId, segmentCode
    handleValidationErrors,
    attendanceController.recordCheckIn
);

// POST /attendance/heartbeat - Player is still present
router.post(
    '/heartbeat',
    attendanceCheckValidation, // Validate planRef, robloxId, segmentCode
    handleValidationErrors,
    attendanceController.recordHeartbeat
);

// POST /attendance/checkout - Player finishes a leg successfully
router.post(
    '/checkout',
    attendanceCheckValidation, // Validate planRef, robloxId, segmentCode
    handleValidationErrors,
    attendanceController.recordCheckOut
);

module.exports = router;