const express = require("express");
const app = express();

require('dotenv').config()

const mongoose = require('mongoose');
mongoose.connect(`mongodb+srv://${process.env.MONGO_USER}:${process.env.MONGO_PASS}@tripscluster.ajq0e.mongodb.net/Content?retryWrites=true&w=majority`,
{
useNewUrlParser: true,
useUnifiedTopology: true,
tlsAllowInvalidCertificates: true
});

var db = mongoose.connection;

db.on("error", console.error.bind(console, "connection error:"));

db.once("open", function() {
  console.log("Connection To MongoDB Atlas Successful!");
});

// Models

require('./models/FlightCreationModel')
require('./models/PlayerCreationModel')

const FlightCreationModel = mongoose.model('FlightCreationModel')
const PlayerCreationModel = mongoose.model('PlayerCreationModel')

// Authentication Middleware

app.use((req, res, next) => {
    const auth = {login: `${process.env.AUTH_LOGIN}`, password: `${process.env.AUTH_PWD}`}
  
    const b64auth = (req.headers.authorization || '').split(' ')[1] || ''
    const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':')

    if (login && password && login === auth.login && password === auth.password) {
      return next()
    }
  
    res.set('WWW-Authenticate', 'Basic realm="401"')
    res.status(401).send('You did not enter the correct credentials.')
  
})

app.get("/", (request, response) => {
    response.send("");
});

// GET Requests

app.get("/get/", (request, response) => {
    response.send("/get")
})

app.get("/get/flight/:flight_reference", async (request, response) => {
    try {
        async function FlightDataModel() {
            const FlightDataModel = await FlightCreationModel.findOne({ flight_reference: `${request.params.flight_reference}` })
    
            if (FlightDataModel) {
                return FlightDataModel
            } else {
                return false
            }
        }
    
        response.json(await FlightDataModel());
    } catch (error) {
        console.error("Error:", error);
        return response.status(500).send({ error: "Internal server error." });
    }
    
})

app.get("/get/player/:user_id", async (request, response) => {
    try {
        async function PlayerDataModelFunction() {
            const PlayerDataModel = await PlayerCreationModel.findOne({ user_id: `${request.params.user_id}` })

            if (PlayerDataModel) {
                return PlayerDataModel
            } else {
                return false
            }
        }

        response.json(await PlayerDataModelFunction());
    } catch (error) {
        console.error("Error:", error);
        return response.status(500).send({ error: "Internal server error." });
    }
})

// SET Requests

const bodyParser = require('body-parser');

app.use(bodyParser.urlencoded({
  extended: true
}));

app.use(bodyParser.json());

app.post("/set/", (request, response) => {
    response.send("/set")
})

app.post("/set/player/:user_id/points", async (request, response) => {
    try {
        const { user_id } = request.params;
        const { points } = request.body;

        // Validate points
        if (points === undefined || typeof points !== "number") {
            return response.status(400).send({ error: "Invalid or missing 'points' in request body." });
        }

        // Find the player
        const GetPlayer = await PlayerCreationModel.findOne({ user_id: user_id });

        if (GetPlayer) {
            // Update or create points record
            await PlayerCreationModel.findOneAndUpdate(
                { user_id },
                { $set: { points } },
                { upsert: true, new: true } // Create document if it doesn't exist
            );
            return response.status(200).send({ message: "Points updated successfully." });
        } else {
            return response.status(404).send({ error: "Player not found." });
        }
    } catch (error) {
        console.error("Error while setting player points:", error);
        return response.status(500).send({ error: "Internal server error." });
    }
})

app.post("/set/player/:user_id/discord", async (request, response) => {
    try {
        const { user_id } = request.params;
        const { discord_account } = request.body;

        // Validate id
        if (discord_account === undefined || typeof discord_account !== "number") {
            return response.status(400).send({ error: "Invalid or missing value in request body." });
        }

        // Find the player
        const GetPlayer = await PlayerCreationModel.findOne({ user_id: user_id });

        if (GetPlayer) {
            await PlayerCreationModel.findOneAndUpdate(
                { user_id },
                { $set: { discord_account } },
            );
            return response.status(200).send({ message: "Discord updated successfully." });
        } else {
            return response.status(404).send({ error: "Player not found." });
        }
    } catch (error) {
        console.error("Error while setting player id:", error);
        return response.status(500).send({ error: "Internal server error." });
    }
})

app.post("/set/flight/:flight_reference/player/:player_id/preferences/", async (request, response) => {
    try {
        const { flight_reference, player_id } = request.params;
        const { seating_location, class_upgrade } = request.body;

        if (!seating_location && !class_upgrade) {
            return response.status(400).send({ error: "No valid fields to update." });
        }

        // Find the flight by reference
        const flight = await FlightCreationModel.findOne({ flight_reference });

        if (!flight) {
            return response.status(404).send({ error: "Flight not found." });
        }

        // Find the player within the flight's players array
        const player = flight.players.find(player => player.user_id === parseInt(player_id));

        if (!player) {
            return response.status(404).send({ error: "Player not found in this flight." });
        }

        // Update the player's preferences
        if (seating_location) {
            player.preferences[0].seating_location = seating_location;
        }
        if (class_upgrade) {
            player.preferences[0].class_upgrade = class_upgrade;
        }

        // Save the updated flight
        await flight.save();

        response.status(200).send({ message: "Preferences updated successfully.", player });
    } catch (error) {
        console.error("Error while updating player preferences:", error);
        response.status(500).send({ error: "Internal server error." });
    }
});

// CREATE Requests

app.post("/create/", (request, response) => {
    response.send("/create")
})

app.post("/create/flight/:flight_reference/arrival/", async (request, response) => {
    try {
        const { airport_name, iata, time_format, upgrade_availability_business, upgrade_availability_first, upgrade_availability_chairmans } = request.body;

        if (!airport_name || !iata || !time_format || upgrade_availability_business == null || upgrade_availability_first == null || upgrade_availability_chairmans == null) {
            return response.status(400).send({ error: "Missing required fields in request body." });
        }

        // Check if the flight exists
        const flight = await FlightCreationModel.findOne({ flight_reference: request.params.flight_reference });
        if (!flight) {
            return response.status(404).send({ error: "Flight not found." });
        }

        // Check if the arrival already exists
        const existingArrival = flight.arrivals.find(arrival => arrival.airport === airport_name);
        if (existingArrival) {
            return response.status(409).send({ error: "Arrival already exists for this airport in this flight." });
        }

        // Create and add the new arrival as a subdocument
        const newArrival = {
            airport: airport_name,
            iata: iata,
            time_format: time_format,
            upgrade_availability_business: upgrade_availability_business,
            upgrade_availability_first: upgrade_availability_first,
            upgrade_availability_chairmans: upgrade_availability_chairmans,
        };

        flight.arrivals.push(newArrival); // Add subdocument
        await flight.save(); // Save changes to the flight

        response.status(201).send({ message: "Arrival created and associated with flight.", arrival: newArrival });
    } catch (error) {
        console.error("Error creating arrival:", error);
        response.status(500).send({ error: "Internal server error." });
    }
});


app.post("/create/flight/:flight_reference", async (request, response) => {
    try {
        const { departure_airport, departure_iata, departure_time_format, dispatcher } = request.body;

        if (!departure_airport || !departure_iata || !departure_time_format || dispatcher == null) {
            return response.status(400).send({ error: "Missing required fields in request body." });
        }

        const flight = await FlightCreationModel.findOne({ flight_reference: request.params.flight_reference });
        if (flight) {
            return response.status(400).send({ error: "Flight already exists." });
        }

        const NewFlightCreation = new FlightCreationModel({
            flight_reference: request.params.flight_reference,
            departure: [
                {
                    airport: departure_airport,
                    IATA: departure_iata,
                    time_format: departure_time_format,
                },
            ],
            dispatcher,
        });

        const savedFlight = await NewFlightCreation.save();

        response.status(201).send({ message: "Flight created successfully.", flight: savedFlight });
    } catch (error) {
        console.error("Error creating flight:", error);
        response.status(500).send({ error: "Internal server error." });
    }
});


app.post("/create/player/:player_id", async (request, response) => {
    try {
        const playerId = request.params.player_id;
        const { discord_account = 0 } = request.body;
    
        // Check if a player already exists or create a new one
        const playerCreationCheck = async () => {
            let playerData = await PlayerCreationModel.findOne({ user_id: playerId });
    
            if (playerData) {
                return response.status(400).send({ error: "Player already exists."}); // Player already exists
            }
    
            // Create a new player if none exists
            const newPlayerData = new PlayerCreationModel({
                user_id: playerId,
                discord_account,
                points: 0,
            });
    
            return await newPlayerData.save();
        };
    
        // Execute and send the result
        const result = await playerCreationCheck();
        response.json(result);

    } catch (error) {
        console.error("Error:", error);
        response.status(500).send({ error: "Internal server error." });
    }    
})

app.post("/create/flight/:flight_reference/player/:player_id/", async (request, response) => {
    try {
        const { class_upgrade, seating_location } = request.body;
        const { flight_reference, player_id } = request.params;

        if (!class_upgrade || seating_location == null) {
            return response.status(400).send({ error: "Missing required fields in request body." });
        }

        // Check if the flight exists
        const flight = await FlightCreationModel.findOne({ flight_reference: request.params.flight_reference });
        if (!flight) {
            return response.status(404).send({ error: "Flight not found." });
        }

        // Check if the arrival already exists
        const existingPlayerPreferenceModel = flight.players.find(player => player.user_id === parseInt(player_id));
        if (existingPlayerPreferenceModel) {
            return response.status(409).send({ error: "Player already exists for this flight." });
        }

        // Create and add the new arrival as a subdocument
        const NewPlayerPreferenceModel = {
            user_id: player_id,
            preferences: [
                {
                    class_upgrade: class_upgrade,
                    seating_location: seating_location,
                },
            ],
        };

        flight.players.push(NewPlayerPreferenceModel); // Add subdocument
        await flight.save(); // Save changes to the flight

        response.status(201).send({ message: "Player created and associated with flight.", arrival: NewPlayerPreferenceModel });
    } catch (error) {
        console.error("Error creating arrival:", error);
        response.status(500).send({ error: "Internal server error." });
    }
})

const listener = app.listen(3000, () => {
    console.log("Your app is listening on port " + listener.address().port);
});