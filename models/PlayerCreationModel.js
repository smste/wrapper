const mongoose = require('mongoose');

const PlayerCreationSchema = new mongoose.Schema({
    user_id: Number,
    points: { type: Number, required: true, unique: true },
    discord_account: { type: Number, required: true, unique: true },
})

const PlayerCreationModel = mongoose.model('PlayerCreationModel', PlayerCreationSchema);
module.exports = {PlayerCreationModel, PlayerCreationSchema}