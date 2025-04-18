// middleware/validation.js
const { body, param, query, validationResult } = require('express-validator');
const { getTimeZone, listTimeZones } = require('date-fns-tz'); // Import for timezone validation

// Middleware to handle validation errors
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    next();
};

// --- User Validation Rules ---
const userIdValidation = [
    param('robloxId').isInt({ gt: 0 }).withMessage('Roblox ID must be a positive integer.')
];

const createUserValidation = [
    param('robloxId').isInt({ gt: 0 }).withMessage('Roblox ID must be a positive integer.'),
    body('discordId').optional().isString().isLength({ min: 17, max: 20 }).withMessage('Discord ID must be a valid Snowflake string.'), // Discord IDs are typically 17-19 digits
];

const updateUserPointsValidation = [
    ...userIdValidation,
    body('points').isInt().withMessage('Points must be an integer.'),
];

 const updateUserDiscordValidation = [
    ...userIdValidation,
    body('discordId').isString().isLength({ min: 17, max: 20 }).withMessage('Discord ID must be a valid Snowflake string.'),
];


// --- Flight Validation Rules ---
const flightRefValidation = [
    param('flight_reference').isString().notEmpty().trim().withMessage('Flight reference is required.')
];

// Update createFlightValidation
const createFlightValidation = [
    param('flight_reference').isString().notEmpty().trim().withMessage('Flight reference is required.'),

    // Departure validation (no change)
    body('departure').isObject().withMessage('Departure object is required.'),
    body('departure.airport').isString().notEmpty().withMessage('Departure airport name is required.'),
    body('departure.iata').isString().isLength({ min: 3, max: 3 }).toUpperCase().withMessage('Departure IATA must be 3 letters.'),
    body('departure.time_format').matches(/^([01]\d|2[0-3]):([0-5]\d)$/).withMessage('Departure time must be in HH:MM format.'),

    // Dispatcher validation (no change)
    body('dispatcher').isString().notEmpty().withMessage('Dispatcher is required.'),

    // Date validation (no change)
    body('date_of_event').isObject().withMessage('Date object is required.'),
    body('date_of_event.date').isISO8601().toDate().withMessage('Event date must be a valid ISO 8601 date string (YYYY-MM-DD).'),
    body('date_of_event.time').matches(/^([01]\d|2[0-3]):([0-5]\d)$/).withMessage('Event time must be in HH:MM format.'),

    // --- MODIFIED SECTION: Optional Arrivals Validation ---
    body('arrivals')
        .optional({ checkFalsy: true }) // Makes the entire 'arrivals' key optional
        .isArray({ min: 1}) // If present, must be an array with at least one item
        .withMessage('Arrivals must be a non-empty array if provided.'),

    // Apply validation rules to each object within the 'arrivals' array using '*'
    // These fields become required *if* the arrivals array is present and not empty
    body('arrivals.*.airport').if(body('arrivals').exists({checkFalsy: true})) // Only validate if arrivals exist
        .isString().notEmpty().withMessage('Arrival airport name is required.'),
    body('arrivals.*.iata').if(body('arrivals').exists({checkFalsy: true}))
        .isString().isLength({ min: 3, max: 3 }).toUpperCase().withMessage('Arrival IATA must be 3 letters.'),
    body('arrivals.*.scheduledArrivalTime').if(body('arrivals').exists({checkFalsy: true}))
        .isISO8601().withMessage('Each arrival scheduledArrivalTime must be a valid ISO 8601 date-time string.')
        .toDate() // Convert valid strings to Date objects
        .withMessage('Invalid date format for scheduledArrivalTime in arrivals array.'),
    body('arrivals.*.flight_code').if(body('arrivals').exists({checkFalsy: true}))
        .isString().notEmpty().withMessage('Arrival flight code is required.'),
    body('arrivals.*.aircraft').if(body('arrivals').exists({checkFalsy: true}))
        .isString().notEmpty().withMessage('Arrival aircraft is required.'),
    body('arrivals.*.upgrade_availability_business').if(body('arrivals').exists({checkFalsy: true}))
        .isBoolean().withMessage('Business upgrade availability must be a boolean.'),
    body('arrivals.*.upgrade_availability_first').if(body('arrivals').exists({checkFalsy: true}))
        .isBoolean().withMessage('First class upgrade availability must be a boolean.'),
    body('arrivals.*.upgrade_availability_chairmans').if(body('arrivals').exists({checkFalsy: true}))
        .isBoolean().withMessage('Chairman upgrade availability must be a boolean.'),
];


const createArrivalValidation = [
     ...flightRefValidation,
     body('airport').isString().notEmpty().withMessage('Arrival airport name is required.'),
     body('iata').isString().isLength({ min: 3, max: 3 }).toUpperCase().withMessage('Arrival IATA must be 3 letters.'),
    //  body('time_format').matches(/^([01]\d|2[0-3]):([0-5]\d)$/).withMessage('Arrival time must be in HH:MM format.'),
    body('scheduledArrivalTime')
        .isISO8601().withMessage('scheduledArrivalTime must be a valid ISO 8601 date-time string (e.g., YYYY-MM-DDTHH:mm:ssZ or with offset).')
        .toDate() // Convert valid string to Date object for the controller
        .withMessage('Invalid date format for scheduledArrivalTime.'),
     body('flight_code').isString().notEmpty().withMessage('Arrival flight code is required.'),
     body('aircraft').isString().notEmpty().withMessage('Arrival aircraft is required.'),
     body('upgrade_availability_business').isBoolean().withMessage('Business upgrade availability must be a boolean.'),
     body('upgrade_availability_first').isBoolean().withMessage('First class upgrade availability must be a boolean.'),
     body('upgrade_availability_chairmans').isBoolean().withMessage('Chairman upgrade availability must be a boolean.'),
];

const addPlayerToFlightValidation = [
    ...flightRefValidation,
    param('robloxId').isInt({ gt: 0 }).withMessage('Roblox ID must be a positive integer.'),
    body('class_upgrade').optional().isString().withMessage('Class upgrade must be a string.'), // Make optional if defaults are set
    body('seating_location').optional().isString().withMessage('Seating location must be a string.'), // Make optional if defaults are set
];

const updatePlayerPreferencesValidation = [
     ...flightRefValidation,
     param('robloxId').isInt({ gt: 0 }).withMessage('Roblox ID must be a positive integer.'),
     body('class_upgrade').optional().isString().withMessage('Class upgrade must be a string.'),
     body('seating_location').optional().isString().withMessage('Seating location must be a string.'),
     // Ensure at least one field is provided (add custom validator if needed)
     body().custom((value, { req }) => {
        if (!req.body.class_upgrade && !req.body.seating_location) {
            throw new Error('At least one preference (class_upgrade or seating_location) must be provided.');
        }
        return true;
     })
];

// For validating :planReference in URL parameters
const planReferenceParamValidation = [
    param('planReference').isString().notEmpty().trim().withMessage('Plan reference URL parameter is required.')
];

// For validating :robloxId in URL parameters
const robloxIdParamValidation = [
    param('robloxId').isInt({ gt: 0 }).withMessage('Roblox ID URL parameter must be a positive integer.')
        .toInt() // Convert to integer
];

// For validating the body when creating a flight plan
const createPlanValidation = [
    body('planReference').isString().notEmpty().trim().withMessage('planReference is required.'),
    body('robloxId').isInt({ gt: 0 }).withMessage('robloxId must be a positive integer.'),
    body('planName').optional().isString().trim().isLength({ max: 100 }).withMessage('planName cannot exceed 100 characters.'),
    body('legs').isArray({ min: 1 }).withMessage('Flight plan must have at least one leg in the legs array.'),
    // Nested validation for each leg object within the array
    body('legs.*.flightReference').isString().notEmpty().trim().withMessage('Each leg requires a parent flightReference.'),
    // --- ADDED VALIDATION ---
    body('legs.*.segmentFlightCode').isString().notEmpty().trim().withMessage('Each leg requires a segmentFlightCode (from the arrival).'),
    // --- END ADDED VALIDATION ---
    body('legs.*.departureIata').isString().isLength({ min: 3, max: 3 }).matches(/^[A-Z]{3}$/).withMessage('Each leg requires a 3-letter uppercase departureIata.'),
    body('legs.*.arrivalIata').isString().isLength({ min: 3, max: 3 }).matches(/^[A-Z]{3}$/).withMessage('Each leg requires a 3-letter uppercase arrivalIata.'),
];

// For validating the body when updating plan status
const updatePlanStatusValidation = [
    body('status').isIn(['Planned', 'Active', 'Completed', 'Cancelled'])
        .withMessage('Status must be one of: Planned, Active, Completed, Cancelled.')
];

// For optional status query parameter validation
const planStatusQueryValidation = [
    query('status').optional().isIn(['Planned', 'Active', 'Completed', 'Cancelled'])
        .withMessage('Status query parameter must be one of: Planned, Active, Completed, Cancelled.')
];

const addPlayerToLegValidation = [
    param('flight_reference').isString().notEmpty().trim().withMessage('Flight reference URL parameter is required.'),
    param('arrivalIata').isString().isLength({ min: 3, max: 3 }).matches(/^[A-Z]{3}$/).withMessage('Arrival IATA URL parameter must be 3 uppercase letters.'),
    param('robloxId').isInt({ gt: 0 }).withMessage('Roblox ID URL parameter must be a positive integer.'),
    // Optional validation for request body (preferences)
    body('class_upgrade').optional().isString().trim().notEmpty().withMessage('class_upgrade must be a non-empty string if provided.'),
    body('seating_location').optional().isString().trim().notEmpty().withMessage('seating_location must be a non-empty string if provided.'),
];

// Add this to middleware/validation.js exports
const discordIdValidation = [
    param('discordId').isString().isLength({ min: 17, max: 20 }).withMessage('Discord ID must be a valid Snowflake string.')
];

const iataParamValidation = [
    param('iata').isString().isLength({ min: 3, max: 3 }).toUpperCase().trim().withMessage('IATA parameter must be 3 letters.')
];

const flightReferenceParamValidation = [
    param('flight_reference').isString().notEmpty().trim().withMessage('Flight reference URL parameter is required.')
];

const arrivalIataParamValidation = [
    param('arrivalIata').isString().isLength({ min: 3, max: 3 }).matches(/^[A-Z]{3}$/).withMessage('Arrival IATA URL parameter must be 3 uppercase letters.')
];

// --- NEW: Validation for Update Preferences Body ---
const updatePlayerPrefsBodyValidation = [
    // Custom validator to ensure at least one valid preference field is present
    body().custom((value, { req }) => {
        if (req.body.class_upgrade === undefined && req.body.seating_location === undefined) {
            throw new Error('At least one preference (class_upgrade or seating_location) must be provided in the request body.');
        }
        return true;
    }),
    // Validate fields only if they are present
    body('class_upgrade')
        .optional() // Make the field itself optional
        .isString().withMessage('class_upgrade must be a string.')
        .trim()
        .notEmpty().withMessage('class_upgrade cannot be empty if provided.'),
    body('seating_location')
        .optional() // Make the field itself optional
        .isString().withMessage('seating_location must be a string.')
        .trim()
        .notEmpty().withMessage('seating_location cannot be empty if provided.'),
];

const confirmVerificationValidation = [
    body('verificationCode')
    .trim()
    .isString().withMessage('Verification code must be a string.')
    .isLength({ min: 6, max: 6 }).withMessage('Verification code must be 6 characters long.')
    .isAlphanumeric().withMessage('Verification code must be alphanumeric.')
    .toUpperCase(), // Convert to uppercase to match stored code case-insensitively if needed
    body('robloxId')
        .isInt({ gt: 0 }).withMessage('Roblox ID must be a positive integer.')
        .toInt() // Convert to integer type
];

// Basic check for YYYY-MM-DD format
const dateValidation = (field) => body(field).matches(/^\d{4}-\d{2}-\d{2}$/).withMessage(`${field} must be in YYYY-MM-DD format.`);
// Basic check for HH:mm or HH:mm:ss format
const timeValidation = (field) => body(field).matches(/^([01]\d|2[0-3]):([0-5]\d)(:([0-5]\d))?$/).withMessage(`${field} must be in HH:mm or HH:mm:ss format.`);
// Validate Timezone string (IANA name or offset)
const timezoneValidation = (field) => body(field).custom((value) => {
    try {
        // Check if it's a valid IANA zone like 'Australia/Sydney'
        // or handle UTC offsets like '+10:00', '-05:00', 'Z'
        if (getTimeZone(value) || ['Z', '+00:00', '-00:00'].includes(value) || /^[+-]([01]\d|2[0-3]):([0-5]\d)$/.test(value)) {
             return true;
        }
        // List available zones on error? Maybe too verbose.
        // const availableZones = listTimeZones();
        throw new Error(`Invalid timezone. Use IANA name (e.g., Australia/Sydney) or offset (+HH:mm / -HH:mm / Z).`);
    } catch (e) {
         throw new Error(`Invalid timezone format: ${e.message}`);
    }
}).withMessage('Invalid timezone provided.');

// Validation for updating a Flight (example: dispatcher)
const updateFlightValidation = [
    body('dispatcher').optional().isString().trim().notEmpty().withMessage('Dispatcher must be a non-empty string if provided.'),
    // Add rules for other updatable fields (e.g., date_of_event, ensure you handle timezone)
    body().custom((value, { req }) => { // Ensure at least one field is passed
         if (Object.keys(req.body).length === 0) {
             throw new Error('At least one field (e.g., dispatcher) must be provided to update.');
         }
         return true;
     }),
];

// Validation for adding/updating an Arrival (includes time parts)
const arrivalBodyValidation = [
    body('airport').optional().isString().notEmpty().withMessage('Arrival airport name is required.'), // Optional for PATCH
    body('scheduledArrivalDate').optional().matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('scheduledArrivalDate must be YYYY-MM-DD.'), // Optional for PATCH
    body('scheduledArrivalTimeStr').optional().matches(/^([01]\d|2[0-3]):([0-5]\d)(:([0-5]\d))?$/).withMessage('scheduledArrivalTimeStr must be HH:mm or HH:mm:ss.'), // Optional for PATCH
    body('scheduledArrivalTimezone').optional().custom(timezoneValidation().custom).withMessage('scheduledArrivalTimezone is invalid.'), // Optional for PATCH
    body('flight_code').optional().isString().notEmpty().withMessage('Arrival flight code is required.'), // Optional for PATCH
    body('aircraft').optional().isString().notEmpty().withMessage('Arrival aircraft is required.'), // Optional for PATCH
    body('upgrade_availability_business').optional().isBoolean().withMessage('Business upgrade availability must be a boolean.'),
    body('upgrade_availability_first').optional().isBoolean().withMessage('First class upgrade availability must be a boolean.'),
    body('upgrade_availability_chairmans').optional().isBoolean().withMessage('Chairman upgrade availability must be a boolean.'),
    // Add custom check for PATCH to ensure *some* field is provided?
    body().custom((value, { req }) => {
         // For PATCH, ensure at least one valid field is present
         const allowedFields = ['airport', 'scheduledArrivalDate', 'scheduledArrivalTimeStr', 'scheduledArrivalTimezone', 'flight_code', 'aircraft', 'upgrade_availability_business', 'upgrade_availability_first', 'upgrade_availability_chairmans'];
         if (req.method === 'PATCH' && !allowedFields.some(field => req.body[field] !== undefined)) {
               throw new Error('At least one field must be provided to update an arrival.');
         }
         // For POST (add arrival), check required fields
          if (req.method === 'POST' && (!req.body.airport || !req.body.scheduledArrivalDate || !req.body.scheduledArrivalTimeStr || !req.body.scheduledArrivalTimezone || !req.body.flight_code || !req.body.aircraft || req.body.upgrade_availability_business === undefined || req.body.upgrade_availability_first === undefined || req.body.upgrade_availability_chairmans === undefined )) {
               throw new Error('Missing required fields for adding arrival (airport, date, time, timezone, flight_code, aircraft, upgrades).');
         }
         return true;
     }),
];

// Validation for listing flights (example: pagination)
const listFlightsValidation = [
    query('page').optional().isInt({ min: 1 }).toInt().withMessage('Page must be a positive integer.'),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt().withMessage('Limit must be between 1 and 100.'),
    // Add other filters like date range, status etc.
];

module.exports = {
    handleValidationErrors,
    userIdValidation,
    createUserValidation,
    updateUserPointsValidation,
    updateUserDiscordValidation,
    flightRefValidation,
    createFlightValidation,
    createArrivalValidation,
    addPlayerToFlightValidation,
    updatePlayerPreferencesValidation,
    discordIdValidation,
    iataParamValidation,
    planReferenceParamValidation,
    robloxIdParamValidation,
    createPlanValidation,
    updatePlanStatusValidation,
    planStatusQueryValidation,
    addPlayerToLegValidation,
    flightReferenceParamValidation,
    arrivalIataParamValidation,
    updatePlayerPrefsBodyValidation,
    confirmVerificationValidation,
    listFlightsValidation,
    updateFlightValidation,
    arrivalBodyValidation
};
