const mongoose = require('mongoose')
//First we require mongoose in our player.js file

const Schema = mongoose.Schema
// Then we define Schema as the mongoose.Schema method
// mongoose Schemas define the structure of the data records (also known as documents // in MongoDB)


const schema = new Schema({
   userID: String,
   coins: Number
})
// We use the new operator to create a new Schema and we define the fields,
// For this one I am just going to use User Id and coins, you can add more.
// Also for valid data types you can check the mongoose docs (string, number etc)

const Player = mongoose.model('Player', schema)
// Now we create a new mongoose model with the name and the schema

module.exports = {Player , schema}
// Finally we export the Model and the Schema so we can use it in our other files!