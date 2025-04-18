// config/database.js
const mongoose = require('mongoose');
const config = require('./index'); // Make sure config/index.js loads the new URI

const createDbConnection = (uri, dbName) => {
    if (!uri) {
        console.error(`MongoDB URI for ${dbName} not found in environment variables.`);
        process.exit(1); // Exit if essential DB URI is missing
    }
    // Ensure URI is a string before creating connection
    if (typeof uri !== 'string') {
         console.error(`MongoDB URI for ${dbName} must be a string. Received: ${typeof uri}`);
         process.exit(1);
    }


    const connection = mongoose.createConnection(uri, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
    });

    connection.on('connected', () => {
        console.log(`MongoDB connection established for: ${dbName}`);
    });

    connection.on('error', (err) => {
        console.error(`MongoDB connection error for ${dbName}:`, err);
    });

    connection.on('disconnected', () => {
        console.warn(`MongoDB connection disconnected for: ${dbName}`);
    });

    return connection;
};

// Existing connections
const userDB = createDbConnection(config.userDbUri, 'UserDB');
const flightDB = createDbConnection(config.flightDbUri, 'FlightDB');

// --- New Connection ---
const flightPlanDB = createDbConnection(config.flightPlanDbUri, 'FlightPlanDB');


module.exports = {
    userDB,
    flightDB,
    flightPlanDB, // Export the new connection
};