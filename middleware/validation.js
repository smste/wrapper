// middleware/validation.js
const { body, param, query, validationResult } = require('express-validator');
// No longer need date-fns-tz for validation helpers if only checking string formats

// --- Helper function to handle validation results ---
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        // Log validation errors server-side for debugging
        console.error("Validation Errors:", JSON.stringify(errors.array()));
        return res.status(400).json({ errors: errors.array() });
    }
    next();
};

// --- User Validation Rules ---
const userIdValidation = [
    param('robloxId').isInt({ gt: 0 }).withMessage('Roblox ID must be a positive integer.')
        .toInt() // Convert param to integer
];

const createUserValidation = [
    param('robloxId').isInt({ gt: 0 }).withMessage('Roblox ID must be a positive integer.'),
    body('discordId').optional().isString().isLength({ min: 17, max: 20 }).withMessage('Discord ID must be a valid Snowflake string.'),
];

const updateUserPointsValidation = [
    ...userIdValidation, // Includes param('robloxId')...
    body('points').isInt().withMessage('Points must be an integer.'),
];

const updateUserDiscordValidation = [
    ...userIdValidation, // Includes param('robloxId')...
    body('discordId').isString().isLength({ min: 17, max: 20 }).withMessage('Discord ID must be a valid Snowflake string.'),
];

const discordIdValidation = [ // For param :discordId
    param('discordId').isString().isLength({ min: 17, max: 20 }).withMessage('Discord ID URL parameter must be a valid Snowflake string.')
];

const getOrCreateUserValidation = [ // For body { robloxId: ... }
    body('robloxId')
        .exists({ checkFalsy: true }).withMessage('robloxId is required in the request body.')
        .isInt({ gt: 0 }).withMessage('Roblox ID must be a positive integer.')
        .toInt()
];

const addCreditsValidation = [ // For body { amount: ..., reason?: ... }
    // Assumes robloxId is validated via param using userIdValidation
    body('amount')
        .exists({ checkFalsy: false }) // Allow 0 amount? Currently yes. Change if needed.
        .isInt().withMessage('Amount must be an integer.')
        .toInt(),
    body('reason')
        .optional()
        .isString().withMessage('Reason must be a string.')
        .trim()
        .isLength({ min: 1, max: 200 }).withMessage('Reason must be between 1 and 200 characters.')
];

// --- Flight Param Validations ---
const flightReferenceParamValidation = [
    param('flight_reference').isString().notEmpty().trim().withMessage('Flight reference URL parameter is required.')
];

const arrivalIataParamValidation = [
    param('arrivalIata').isString().isLength({ min: 3, max: 3 }).matches(/^[A-Za-z]{3}$/).toUpperCase().withMessage('Arrival IATA URL parameter must be 3 uppercase letters.')
];

// --- Flight Body Validations ---

// Validation for POST /flights/:flight_reference (reverted date/time)
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

    // --- Validate Top-Level Event Date/Time/Timezone fields ---
    // REMOVED: body('date_of_event').isObject()...
    body('event_date') // Check top-level field
        .exists({ checkFalsy: true }).withMessage('event_date (YYYY-MM-DD) is required.')
        .matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('event_date must be in YYYY-MM-DD format.'),
    body('event_time') // Check top-level field
        .exists({ checkFalsy: true }).withMessage('event_time (HH:mm or HH:mm:ss) is required.')
        .matches(/^([01]\d|2[0-3]):([0-5]\d)(:([0-5]\d))?$/).withMessage('event_time must be in HH:mm or HH:mm:ss format.'),
    // REMOVED: body('event_timezone').optional()... (Assuming string-based workaround)
    // If using Luxon/date-fns-tz approach, uncomment timezone validation:
    // body('event_timezone').optional().isString().custom(timezoneValidation().custom),

    // Validate Optional Arrivals Array (checking ...String fields)
    body('arrivals')
        .optional({ checkFalsy: true })
        .isArray()
        .withMessage('Arrivals must be an array if provided.'),
    body('arrivals.*.airport').if(body('arrivals').exists({checkFalsy: true}))
        .isString().notEmpty().withMessage('Each arrival requires an airport name.'),
    body('arrivals.*.iata').if(body('arrivals').exists({checkFalsy: true}))
        .isString().isLength({ min: 3, max: 3 }).matches(/^[A-Za-z]{3}$/).toUpperCase().withMessage('Each arrival IATA must be 3 letters.'),
    // Check fields ending in String (matching the string-based storage workaround)
    body('arrivals.*.scheduledArrivalDateString').if(body('arrivals').exists({checkFalsy: true}))
        .exists({ checkFalsy: true }).withMessage('Each arrival requires scheduledArrivalDateString (YYYY-MM-DD).')
        .matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('Arrival scheduledArrivalDateString must be YYYY-MM-DD.'),
    body('arrivals.*.scheduledArrivalTimeString').if(body('arrivals').exists({checkFalsy: true}))
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

// Validation for adding/updating an Arrival (using ...String fields)
const arrivalBodyValidation = [
    // Base fields (required for POST, optional for PATCH)
    body('airport').optional().isString().notEmpty().withMessage('Arrival airport name must be non-empty if provided.'),
    body('iata').if((value, { req }) => req.method === 'POST') // IATA only required for POST via body maybe? Route uses it for PATCH/DELETE
         .isString().isLength({ min: 3, max: 3 }).matches(/^[A-Za-z]{3}$/).toUpperCase().withMessage('Arrival IATA must be 3 letters.'),
    body('flight_code').optional().isString().notEmpty().withMessage('Arrival flight code must be non-empty if provided.'),
    body('aircraft').optional().isString().notEmpty().withMessage('Arrival aircraft must be non-empty if provided.'),
    body('upgrade_availability_business').optional().isBoolean().withMessage('Business upgrade availability must be a boolean.'),
    body('upgrade_availability_first').optional().isBoolean().withMessage('First class upgrade availability must be a boolean.'),
    body('upgrade_availability_chairmans').optional().isBoolean().withMessage('Chairman upgrade availability must be a boolean.'),

    // Date/Time String validation (optional for PATCH)
    body('scheduledArrivalDateString').optional()
        .matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('scheduledArrivalDateString must be YYYY-MM-DD.'),
    body('scheduledArrivalTimeString').optional()
        .matches(/^([01]\d|2[0-3]):([0-5]\d)(:([0-5]\d))?$/).withMessage('scheduledArrivalTimeString must be HH:mm or HH:mm:ss.'),

    // Custom validation
    body().custom((value, { req }) => {
        const isPatch = req.method === 'PATCH';
        const hasTimeComponent = req.body.scheduledArrivalDateString || req.body.scheduledArrivalTimeString;

        if (!isPatch) { // POST request - Check all required fields are present
             const requiredPostFields = ['airport', 'iata', 'scheduledArrivalDateString', 'scheduledArrivalTimeString', 'flight_code', 'aircraft', 'upgrade_availability_business', 'upgrade_availability_first', 'upgrade_availability_chairmans'];
             if (!requiredPostFields.every(field => req.body[field] !== undefined)) {
                  throw new Error('Missing required fields for adding arrival (airport, iata, dateString, timeString, flight_code, aircraft, upgrades).');
             }
        } else { // PATCH request
             // Ensure at least one field is being updated
             const allowedFields = ['airport', 'scheduledArrivalDateString', 'scheduledArrivalTimeString', 'flight_code', 'aircraft', 'upgrade_availability_business', 'upgrade_availability_first', 'upgrade_availability_chairmans'];
             if (!allowedFields.some(field => req.body[field] !== undefined)) {
                 throw new Error('At least one field must be provided to update an arrival.');
             }
             // If updating time, require BOTH date and time strings
             if (hasTimeComponent && (!req.body.scheduledArrivalDateString || !req.body.scheduledArrivalTimeString)) {
                  throw new Error('To update arrival time, you must provide both scheduledArrivalDateString and scheduledArrivalTimeString.');
             }
        }
        return true;
    }),
];

// Validation for updating a Flight (example: dispatcher)
const updateFlightValidation = [
    body('dispatcher').optional().isString().trim().notEmpty().withMessage('Dispatcher must be a non-empty string if provided.'),
    // Add rules for other updatable fields (e.g., event_date, event_time - now strings)
    body('date_of_event.date').optional() // Allow updating nested parts
        .matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('date_of_event.date must be YYYY-MM-DD format.'),
    body('date_of_event.time').optional()
         .matches(/^([01]\d|2[0-3]):([0-5]\d)(:([0-5]\d))?$/).withMessage('date_of_event.time must be HH:mm or HH:mm:ss format.'),

    body().custom((value, { req }) => { // Ensure at least one field is passed
         // Check if dispatcher OR date_of_event object (or parts of it) is present
         if (req.body.dispatcher === undefined && req.body.date_of_event === undefined) {
             throw new Error('At least one field (e.g., dispatcher, date_of_event) must be provided to update.');
         }
          // If date_of_event is provided for update, ensure it has valid sub-fields if needed
          if (req.body.date_of_event !== undefined && typeof req.body.date_of_event !== 'object') {
                throw new Error('date_of_event must be an object if provided for update.');
          }
           if (req.body.date_of_event && (!req.body.date_of_event.date && !req.body.date_of_event.time)) {
                throw new Error('If updating date_of_event, provide at least date or time.');
           }
         return true;
     }),
];

// Validation for adding Player to Leg Body (Preferences)
const addPlayerToLegValidation = [
    // Params are validated separately where route defined
    body('class_upgrade').optional().isString().trim().notEmpty().withMessage('class_upgrade must be a non-empty string if provided.'),
    body('seating_location').optional().isString().trim().notEmpty().withMessage('seating_location must be a non-empty string if provided.'),
];

// Validation for updating Player Preferences Body
const updatePlayerPrefsBodyValidation = [
    body().custom((value, { req }) => {
        if (req.body.class_upgrade === undefined && req.body.seating_location === undefined) {
            throw new Error('At least one preference (class_upgrade or seating_location) must be provided.');
        }
        return true;
    }),
    body('class_upgrade').optional().isString().trim().notEmpty().withMessage('class_upgrade cannot be empty if provided.'),
    body('seating_location').optional().isString().trim().notEmpty().withMessage('seating_location cannot be empty if provided.'),
];


// --- Flight Plan Validations ---
const planReferenceParamValidation = [
    param('planReference').isString().notEmpty().trim().withMessage('Plan reference URL parameter is required.')
];

const createPlanValidation = [
    body('planReference').optional().isString().notEmpty().trim().withMessage('planReference must be a non-empty string if provided.'), // Made optional if API generates it
    body('robloxId').isInt({ gt: 0 }).toInt().withMessage('robloxId must be a positive integer.'),
    body('planName').optional().isString().trim().isLength({ max: 100 }).withMessage('planName cannot exceed 100 characters.'),
    body('legs').isArray({ min: 1 }).withMessage('Flight plan must have at least one leg in the legs array.'),
    body('legs.*.flightReference').isString().notEmpty().trim().withMessage('Each leg requires a parent flightReference.'),
    body('legs.*.segmentFlightCode').isString().notEmpty().trim().withMessage('Each leg requires a segmentFlightCode.'),
    body('legs.*.departureIata').isString().isLength({ min: 3, max: 3 }).matches(/^[A-Za-z]{3}$/).toUpperCase().withMessage('Each leg requires a 3-letter uppercase departureIata.'),
    body('legs.*.arrivalIata').isString().isLength({ min: 3, max: 3 }).matches(/^[A-Za-z]{3}$/).toUpperCase().withMessage('Each leg requires a 3-letter uppercase arrivalIata.'),
];

const updatePlanStatusValidation = [
    body('status').isIn(['Planned', 'Active', 'Completed', 'Cancelled'])
        .withMessage('Status must be one of: Planned, Active, Completed, Cancelled.')
];

const planStatusQueryValidation = [
    query('status').optional().isIn(['Planned', 'Active', 'Completed', 'Cancelled'])
        .withMessage('Status query parameter must be one of: Planned, Active, Completed, Cancelled.')
];


// --- Verification / Attendance Validations ---
const confirmVerificationValidation = [
    body('verificationCode').isString().isLength({ min: 6, max: 6 }).isAlphanumeric().toUpperCase().withMessage('Verification code must be 6 alphanumeric characters.'),
    body('robloxId').isInt({ gt: 0 }).toInt().withMessage('Roblox ID must be a positive integer.')
];

const attendanceCheckValidation = [
    body('planReference').isString().notEmpty().trim().withMessage('planReference is required.'),
    body('robloxId').isInt({ gt: 0 }).toInt().withMessage('Roblox ID must be a positive integer.'),
    body('segmentFlightCode').isString().notEmpty().trim().withMessage('segmentFlightCode is required.'),
];


// --- Flight List Validation ---
const listFlightsValidation = [
    query('page').optional().isInt({ min: 1 }).toInt().withMessage('Page must be a positive integer.'),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt().withMessage('Limit must be between 1 and 100.'),
    query('originIata').optional().isString().isLength({ min: 3, max: 3 }).matches(/^[A-Za-z]{3}$/).toUpperCase().withMessage('originIata filter must be 3 letters.'),
    // Add more filters like destinationIata, departureDate etc. later
];

// --- Export ALL validation arrays ---
module.exports = {
    handleValidationErrors,
    // User
    userIdValidation,
    createUserValidation,
    updateUserPointsValidation,
    updateUserDiscordValidation,
    discordIdValidation,
    getOrCreateUserValidation,
    addCreditsValidation,
    // Flight Params
    flightReferenceParamValidation,
    arrivalIataParamValidation,
    // Flight Body
    createFlightValidation,
    updateFlightValidation,
    arrivalBodyValidation, // Used for POST /arrivals and PATCH /arrivals/:iata
    addPlayerToLegValidation,
    updatePlayerPrefsBodyValidation,
    // Flight List Query
    listFlightsValidation,
    // Plan Params & Body
    planReferenceParamValidation,
     // Reused for Plan User route param
    createPlanValidation,
    updatePlanStatusValidation,
    planStatusQueryValidation,
    // Verification / Attendance Body
    confirmVerificationValidation,
    attendanceCheckValidation,
};