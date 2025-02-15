const mongoose = require('mongoose');

const ArrivalCreationSchema = new mongoose.Schema({
    airport: { type: String, required: true, unique: true },
    iata: { type: String, required: true, unique: true },
    time_format: { type: String, required: true, unique: true },
    flight_code: { type: String, required: true, unique: true },
    
    upgrade_availability_business: { type: Boolean, required: true, unique: true },
    upgrade_availability_first: { type: Boolean, required: true, unique: true },
    upgrade_availability_chairmans: { type: Boolean, required: true, unique: true },
})

const PlayerPreferenceSchema = new mongoose.Schema({
    user_id: { type: Number, required: true, unique: true },
    preferences: [{
        class_upgrade: { type: Number, required: true, unique: true },
        seating_location: { type: String, required: true, unique: true },
    }]
});

const FlightCreationSchema = new mongoose.Schema({
    flight_reference: String,
    arrivals: [ArrivalCreationSchema],
    players: [PlayerPreferenceSchema],
    departure: [{
        airport: { type: String, required: true, unique: true },
        IATA: { type: String, required: true, unique: true },
        time_format: { type: Number, required: true, unique: true },
       }],
    dispatcher: { type: String, required: true, unique: true },
    teleportservice_key: { type: String, required: false, unique: true, default: "" },
    date_of_event: [{
        date: { type: String, required: true, unique: true },
        time: { type: String, required: true, unique: true },
    }]
});

const FlightModel = mongoose.model('FlightCreationModel', FlightCreationSchema);
module.exports = {FlightModel, FlightCreationSchema}