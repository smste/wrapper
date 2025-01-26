const express = require("express");
require('dotenv').config()
const app = express();
// First of all you require Express

// MongoDB Configurations 
const mongoose = require('mongoose')
mongoose.connect(`mongodb+srv://${process.env.MONGO_USER}:${process.env.MONGO_PASS}@tripscluster.ajq0e.mongodb.net/Content?retryWrites=true&w=majority`, {useNewUrlParser: true, useUnifiedTopology: true, tlsAllowInvalidCertificates: true });

var db = mongoose.connection;

db.on("error", console.error.bind(console, "connection error:"));

db.once("open", function() {
  console.log("Connection To MongoDB Atlas Successful!");
});

require('./models/player')
const PointsModel = mongoose.model('Points')

app.use((req, res, next) => {

  // authentication middleware

  const auth = {login: `${process.env.AUTH_LOGIN}`, password: `${process.env.AUTH_PWD}`} // change this

  // parse login and password from headers
  const b64auth = (req.headers.authorization || '').split(' ')[1] || ''
  const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':')

  // Verify login and password are set and correct
  if (login && password && login === auth.login && password === auth.password) {
    // Access granted...
    return next()
  }

  // Access denied lol...
  res.set('WWW-Authenticate', 'Basic realm="401"') // change this if you want to be a 
  res.status(401).send('Authentication required.') // custom message

})

app.get("/", (request, response) => {
  response.send("No Access");
});
// Now you setup a GET route at / which is basically
// the Homepage of your app

app.get("/get-points", (request, response) => {
  response.send("No Access")
})

app.get("/get-points/:id", async (request, response) => {
  async function PointsDataCheck() {
    const PointsData = await PointsModel.findOne({ user_id: `${request.params.id}` })
    
    if (PointsData) {
      return PointsData
    } else {
      const newPointsDataInstance = new PointsModel({
        user_id: `${request.params.id}`,
        points: 0,
        purchase_history: {},
      })
      
      const newPointsData = await newPointsDataInstance.save()
      
      return newPointsData
    }
  }

  response.json(await PointsDataCheck());
});

const bodyParser = require('body-parser');

app.use(bodyParser.urlencoded({
  extended: true
}));

app.use(bodyParser.json());

app.post("/get-points/update-points/:id", async (request, response) => {
  // We use a mongoose method to find A record and update!
  await PointsModel.findOneAndUpdate(
    { userID: `${request.params.id}` },
    { $set: { points: request.body.points } }
    // We set the coins to the coins we received in the body of the request
  );
  response.send("Updated Database.");
  // Just a response.
});

const listener = app.listen(3000, () => {
  console.log("Your app is listening on port " + listener.address().port);
});
// And Finally you make the app listen to a port.
