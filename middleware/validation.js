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

// --- Timezone Validation Helper (Ensure this exists) ---
const timezoneValidation = (field) => body(field).custom((value) => {
    if (!value) return true; // Allow optional fields to pass if not present
    try {
        if (getTimeZone(value) || ['Z', '+00:00', '-00:00'].includes(value) || /^[+-]([01]\d|2[0-3]):([0-5]\d)$/.test(value)) {
             return true;
        }
        throw new Error(`Invalid timezone format.`);
    } catch (e) {
         throw new Error(`Invalid timezone: ${e.message}`);
    }
}).withMessage('Invalid timezone. Use IANA name (e.g., Australia/Sydney) or offset (+HH:mm / -HH:mm / Z).');

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

// --- Update createFlightValidation ---
const createFlightValidation = [
    // Validate URL Parameter
    param('flight_reference').isString().notEmpty().trim().withMessage('Flight reference URL parameter is required.'),

    // Validate Departure Object
    body('departure').isObject().withMessage('Departure object is required.'),
    body('departure.airport').isString().notEmpty().withMessage('Departure airport name is required.'),
    body('departure.iata').isString().isLength({ min: 3, max: 3 }).matches(/^[A-Za-z]{3}$/).toUpperCase().withMessage('Departure IATA must be 3 letters.'),
    body('departure.time_format').matches(/^([01]\d|2[0-3]):([0-5]\d)$/).withMessage('Departure time must be in HH:mm format (24-hour).'),

    // Validate Dispatcher
    body('dispatcher').isString().notEmpty().withMessage('Dispatcher is required.'),

    // Validate date_of_event Object (as per reverted schema)
    body('date_of_event').isObject().withMessage('date_of_event object is required.'),
    body('date_of_event.date')
        .exists({ checkFalsy: true }).withMessage('date_of_event.date (YYYY-MM-DD) is required.')
        .matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('date_of_event.date must be in YYYY-MM-DD format.'),
    body('date_of_event.time')
        .exists({ checkFalsy: true }).withMessage('date_of_event.time (HH:mm or HH:mm:ss) is required.')
        .matches(/^([01]\d|2[0-3]):([0-5]\d)(:([0-5]\d))?$/).withMessage('date_of_event.time must be in HH:mm or HH:mm:ss format.'),

    // Validate Optional Arrivals Array
    body('arrivals')
        .optional({ checkFalsy: true })
        .isArray({ min: 1}) // Allow empty array now? Or keep min 1 if always providing? Let's allow empty for flexibility.
        // .isArray({ min: 1}) // Use this if you *require* at least one arrival when the 'arrivals' key is present.
        .withMessage('Arrivals must be an array if provided.'),

    // Validate fields within each object in the 'arrivals' array *if* arrivals exists
    // Using the field names ENDING IN 'String'
    body('arrivals.*.airport').if(body('arrivals').exists({checkFalsy: true}))
        .isString().notEmpty().withMessage('Each arrival requires an airport name.'),
    body('arrivals.*.iata').if(body('arrivals').exists({checkFalsy: true}))
        .isString().isLength({ min: 3, max: 3 }).matches(/^[A-Za-z]{3}$/).toUpperCase().withMessage('Each arrival IATA must be 3 letters.'),
    body('arrivals.*.scheduledArrivalDateString').if(body('arrivals').exists({checkFalsy: true})) // <<-- Check for ...String
        .exists({ checkFalsy: true }).withMessage('Each arrival requires scheduledArrivalDateString (YYYY-MM-DD).')
        .matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('Arrival scheduledArrivalDateString must be YYYY-MM-DD.'),
    body('arrivals.*.scheduledArrivalTimeString').if(body('arrivals').exists({checkFalsy: true})) // <<-- Check for ...String
         .exists({ checkFalsy: true }).withMessage('Each arrival requires scheduledArrivalTimeString (HH:mm or HH:mm:ss).')
        .matches(/^([01]\d|2[0-3]):([0-5]\d)(:([0-5]\d))?$/).withMessage('Arrival scheduledArrivalTimeString must be HH:mm or HH:mm:ss.'),
    // Other required arrival fields
    body('arrivals.*.flight_code').if(body('arrivals').exists({checkFalsy: true}))
        .isString().notEmpty().withMessage('Each arrival requires a flight_code.'),
    body('arrivals.*.aircraft').if(body('arrivals').exists({checkFalsy: true}))
        .isString().notEmpty().withMessage('Each arrival requires an aircraft type.'),
    body('arrivals.*.upgrade_availability_business').if(body('arrivals').exists({checkFalsy: true}))
        .isBoolean().withMessage('Each arrival requires upgrade_availability_business (true/false).'),
    body('arrivals.*.upgrade_availability_first').if(body('arrivals').exists({checkFalsy: true}))
        .isBoolean().withMessage('Each arrival requires upgrade_availability_first (true/false).'),
    body('arrivals.*.upgrade_availability_chairmans').if(body('arrivals').exists({checkFalsy: true}))
        .isBoolean().withMessage('Each arrival requires upgrade_availability_chairmans (true/false).')
];

const attendanceCheckValidation = [
    body('planReference').isString().notEmpty().trim().withMessage('planReference is required.'),
    body('robloxId').isInt({ gt: 0 }).toInt().withMessage('Roblox ID must be a positive integer.'),
    body('segmentFlightCode').isString().notEmpty().trim().withMessage('segmentFlightCode is required.'),
];

// --- Update arrivalBodyValidation similarly ---
const arrivalBodyValidation = [
    // Keep rules for airport, flight_code, aircraft, upgrades (make optional for PATCH)
    body('airport').optional().isString().notEmpty().withMessage('Arrival airport name must be non-empty if provided.'),
    body('flight_code').optional().isString().notEmpty().withMessage('Arrival flight code must be non-empty if provided.'),
    body('aircraft').optional().isString().notEmpty().withMessage('Arrival aircraft must be non-empty if provided.'),
    body('upgrade_availability_business').optional().isBoolean().withMessage('Business upgrade availability must be a boolean.'),
    body('upgrade_availability_first').optional().isBoolean().withMessage('First class upgrade availability must be a boolean.'),
    body('upgrade_availability_chairmans').optional().isBoolean().withMessage('Chairman upgrade availability must be a boolean.'),

    // Update/Add rules for Date and Time strings (timezone is removed)
    body('scheduledArrivalDate').optional() // Optional for PATCH
        .matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('scheduledArrivalDate must be YYYY-MM-DD.'),
    body('scheduledArrivalTimeStr').optional() // Optional for PATCH
        .matches(/^([01]\d|2[0-3]):([0-5]\d)(:([0-5]\d))?$/).withMessage('scheduledArrivalTimeStr must be HH:mm or HH:mm:ss.'),
    // REMOVED: body('scheduledArrivalTimezone').optional().custom(...)

    // Custom validation to ensure required fields for POST / related fields for PATCH
    body().custom((value, { req }) => {
        const isPatch = req.method === 'PATCH';
        const hasTimeComponent = req.body.scheduledArrivalDate || req.body.scheduledArrivalTimeStr;

        if (!isPatch) { // POST request - requires all base fields + date/time
             if (!req.body.airport || !req.body.iata || !req.body.scheduledArrivalDate || !req.body.scheduledArrivalTimeStr || !req.body.flight_code || !req.body.aircraft || req.body.upgrade_availability_business === undefined || req.body.upgrade_availability_first === undefined || req.body.upgrade_availability_chairmans === undefined) {
                  throw new Error('Missing required fields for adding arrival (airport, iata, date, time, flight_code, aircraft, upgrades).');
             }
        } else { // PATCH request
             // Ensure at least one field is being updated
             const allowedFields = ['airport', 'scheduledArrivalDate', 'scheduledArrivalTimeStr', 'flight_code', 'aircraft', 'upgrade_availability_business', 'upgrade_availability_first', 'upgrade_availability_chairmans'];
             if (!allowedFields.some(field => req.body[field] !== undefined)) {
                 throw new Error('At least one field must be provided to update an arrival.');
             }
             // If updating time, require BOTH date and time string now (no separate timezone)
             if (hasTimeComponent && (!req.body.scheduledArrivalDate || !req.body.scheduledArrivalTimeStr)) {
                  throw new Error('To update arrival time, you must provide both scheduledArrivalDate and scheduledArrivalTimeStr.');
             }
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
    arrivalBodyValidation,
    attendanceCheckValidation
};
