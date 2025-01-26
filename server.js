const express = require("express");
require('dotenv').config()
const app = express();
// First of all you require Express

// MongoDB Configurations 
const mongoose = require('mongoose')
mongoose.connect(`mongodb+srv://${process.env.MONGO_USER}:${process.env.MONGO_PASS}@tripscluster.ajq0e.mongodb.net/playerData?retryWrites=true&w=majority`, {useNewUrlParser: true, useUnifiedTopology: true });

var db = mongoose.connection;

db.on("error", console.error.bind(console, "connection error:"));

db.once("open", function() {
  console.log("Connection To MongoDB Atlas Successful!");
});

require('./models/player')
const playerModel = mongoose.model('Player')

app.get("/", (request, response) => {
  response.send("No Access");
});
// Now you setup a GET route at / which is basically
// the Homepage of your app

app.get("/player-data", (request, response) => {
  response.send("No Access")
})

app.get("/player-data/:id", async (request, response) => {
  async function playerDataCheck() {
    const playerData = await playerModel.findOne({ userID: `${request.params.id}` })
    
    if (playerData) {
      return playerData
    } else {
      const newPlayerDataInstance = new playerModel({
        userID: `${request.params.id}`,
        coins: 0
      })
      
      const newPlayerData = await newPlayerDataInstance.save()
      
      return newPlayerData
    }
  }

  response.json(await playerDataCheck());
});

const bodyParser = require('body-parser');

app.use(bodyParser.urlencoded({
  extended: true
}));

app.use(bodyParser.json());

app.post("/player-data/update-coins/:id", async (request, response) => {
  // We use a mongoose method to find A record and update!
  await playerModel.findOneAndUpdate(
    { userID: `${request.params.id}` },
    { $set: { coins: request.body.coins } }
    // We set the coins to the coins we received in the body of the request
  );
  response.send("Updated Database.");
  // Just a response.
});

const listener = app.listen(3000, () => {
  console.log("Your app is listening on port " + listener.address().port);
});
// And Finally you make the app listen to a port.
